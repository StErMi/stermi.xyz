---
title: 'Ethernaut Challenge #8 Solution — Vault'
excerpt: This is Part 8 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal for this challenge is to be able to guess the `Vault` secret password and unlock it.
coverImage:
  url: '/assets/blog/ethernaut/fallback.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-14T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/vault.svg'
---

This is Part 8 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #8: Vault

> Unlock the vault to pass the level!
>
> Level author: [Kyle Riley](https://github.com/syncikin)

The goal for this challenge is to be able to guess the `Vault` secret password and unlock it.

## Study the contracts

The contract is pretty simple and short. Let's review it

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract Vault {
  bool public locked;
  bytes32 private password;

  constructor(bytes32 _password) public {
    locked = true;
    password = _password;
  }

  function unlock(bytes32 _password) public {
    if (password == _password) {
      locked = false;
    }
  }
}
```

We have two states variable

- `bool public locked` that check if the vault is locked or not
- `bytes32 private password` the secret password that we need to guess to unlock the vault

We have the `constructor(bytes32 _password)` function that will

- set the `locked` variable to `true`
- set the `password` variable to the value of the input parameter `_password`

After that, we have the `unlock(bytes32 _password)` function that just check if the byte32 input matches the stored `password` value and unlock the `Vault`.

The first thing that you must remember when you use or develop on the blockchain is that **nothing** is private in the blockchain. Everything can be seen even if you declare a variable as `private` or `internal`. I suggest you to read more about this concept by reading [“SWC-136: Unencrypted Private Data On-Chain”](https://swcregistry.io/docs/SWC-136).

I'm saying this because the owner of the contract would think that there is no way that I would be able to read directly a `private` state variable. But in reality, we have two different way to do that:

1. you could re-construct the key by reviewing the deployment data on Etherscan or Tenderly
2. you could just fork the network in a block after the deployment and use [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html) to read the slot where that value is stored

We will go with the second options just because I think that it's more fun :D

First, we need to understand how the [Layout of State variables in Storage](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#layout-of-state-variables-in-storage) work.

- Each storage slot will use 32 bytes (word size)
- For each variable, a size in bytes is determined according to its type
- Multiple, contiguous items that need less than 32 bytes are packed into a single storage slot if possible according to the following rules:
  - The first item in a storage slot is stored lower-order aligned.
  - Value types use only as many bytes as are necessary to store them.
  - If a value type does not fit the remaining part of a storage slot, it is stored in the next storage slot.
  - Structs and array data always start a new slot and their items are packed tightly according to these rules.
  - Items following struct or array data always start a new storage slot.

Let's now look at the Contract variables layout:

```solidity
bool public locked;
bytes32 private password;
```

**Note:** this is not the case, but you have to remember that `constant` and `immutable` variables will not take a storage slot because they will be directly replaced in the code at compile time or during deployment time (immutable). See more on the ["Constant and Immutable State Variables"](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables) documentation page.

So let's make some math, given each variable type we can know which slot they will use:

- `bool locked` will be at **slot0**. The `bool` type takes 1 byte of storage, but because the next state variable takes the whole 32 bytes slot, we cannot pack `locked` with `password`.
- `bytes32 password` will take slot **from slot1**. As the name imply, the `bytes32` take the whole 32 bytes word.

Why is so important to know which slot is used by our variable?

Because by forking the chain and by using Foundry Cheatcode we can directly read a Contract's slot value in a specific block in time even if the variable is private!

## Solution code

Here's the code that I used for the test:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // load the contract slot1 storage value
    bytes32 password = vm.load(address(level), bytes32(uint256(1)));

    // call the contract level to unlock the Vault
    level.unlock(password);

    // Assert that we have unlocked the Vault
    assertEq(level.locked(), false);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Vault.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Vault.t.sol)

## Further reading

- [SWC-136: Unencrypted Private Data On-Chain](https://swcregistry.io/docs/SWC-136)
- [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html)
- [Layout of State variables in Storage](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#layout-of-state-variables-in-storage)
- [Constant and Immutable State Variables](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables)
- ["Mappings and Dynamic Arrays"](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#mappings-and-dynamic-arrays)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
