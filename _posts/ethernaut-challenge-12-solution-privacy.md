---
title: 'Ethernaut Challenge #12 Solution — Privacy'
excerpt: This is Part 12 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to unlock `Privacy` contract by discovering the "secret" `key` stored in it.
coverImage: '/assets/blog/ethernaut/privacy.svg'
date: '2020-07-22T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/privacy.svg'
---

This is Part 12 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #12: Privacy

> The creator of this contract was careful enough to protect the sensitive areas of its storage. Unlock this contract to beat the level.
>
> Things that might help:
>
> - Understanding how storage works
> - Understanding how parameter parsing works
> - Understanding how casting works
>
> Tips:
>
> - Remember that metamask is just a commodity. Use another tool if it is presenting problems. Advanced gameplay could involve using remix, or your own web3 provider.
>
> Level author(s): [Alejandro Santander](https://github.com/ajsantander)

The goal of this challenge is to be able to unlock `Privacy` contract by discovering the "secret" `key` stored in it.

Do you remember the [[8 Vault]] challenge? Well, it's pretty much the same, so let's go and study the contract!

## Study the contracts

The contract itself is pretty simple, there are many state variables, a `constructor` and an `unlock` function.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract Privacy {
    bool public locked = true;
    uint256 public ID = block.timestamp;
    uint8 private flattening = 10;
    uint8 private denomination = 255;
    uint16 private awkwardness = uint16(now);
    bytes32[3] private data;

    constructor(bytes32[3] memory _data) public {
        data = _data;
    }

    function unlock(bytes16 _key) public {
        require(_key == bytes16(data[2]));
        locked = false;
    }
}
```

All the state variables are pretty useless, we are just interested in two variables

- `bool public locked` that is initialized to true and hold the value that must be set to false to win the challenge
- `bytes32[3] private data` is the variable where our key is stored. We need to find out the value of `data[2]` to solve the challenge

We can see all the other variables only as a "storage padding" to reach what we want to read (`data[2]`) to solve the challenge.

The `constructor(bytes32[3] memory _data)` just initialize the `data` variable's value

And then we have `unlock(bytes16 _key)` that simply check if the `byte16 _key` input we have passed match the `data[2]` value. If the comparison return, `true` we have **unlocked** the contract and passed the challenge.

There are three concepts that we need to master to be able to solve the challenge:

- How information are stored in the blockchain. Are `private` variables **really private**?
- How the Solidity Layout of State variable in Storage works
- How "casting" works (we need to downcast `data[2]` from `bytes32` to `bytes16`)

I have already covered all these topics in the [[1 Private Data]] blog post, so I will freely copy-paste from there and adapt part of the content to this challenge.

### Private variable and Solidity Layout of State variable in Storage

The first thing that you must remember when you use or develop on the blockchain is that **nothing** is private in the blockchain. Everything can be seen even if you declare a variable as `private` or `internal`. I suggest you to read more about this concept by reading [“SWC-136: Unencrypted Private Data On-Chain”](https://swcregistry.io/docs/SWC-136).

I'm saying this because the owner of the contract would think that there is no way that I would be able to read directly a `private` state variable. But in reality, we have two different way to do that:

1. you could re-construct the key by reviewing the deployment data on Etherscan or Tenderly
2. you could just fork the network where the contract is deployed in a block after the deployment and use [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html) to read the slot where that value is stored

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

**Bonus:** `constant` and `immutable` variables will not take a storage slot because they will be directly replaced in the code at compile time or during deployment time (immutable). See more on the ["Constant and Immutable State Variables"](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables) documentation page.

Let's now look at the Contract variables layout:

```solidity
    bool public locked = true;
    uint256 public ID = block.timestamp;
    uint8 private flattening = 10;
    uint8 private denomination = 255;
    uint16 private awkwardness = uint16(now);
    bytes32[3] private data;
```

And now let's try to guess which sloth each variable will take

- **slot_0**: `locked` is of type `bool` so it would take `8 bits (1 byte)` but because the next variable cannot be packed with this, Solidity reserve for the `locked` variable an entire storage.
- **slot_1**: `ID` is of type `address` so it would take `20 bytes`. Same as before, it cannot be packed and will take an entire storage.
- **slot_2**: `flattening`, `denomination` and `awkwardness` can all be packed together because in total they only need `8 bits + 8 bits + 16 bits = 32 bits`.
- **From slot_3 to slot_5**: `data` is a static size `bytes32` array of 3 elements. Each element will take a single slot.

We now know that the **"secret"** key we need to **unlock** the contract is stored in the **fifth slot** of the storage layout of the contract.

### Down casting

What you have to understand when you're downcast is that you are going to lose information because you will store bigger information inside a smaller box.

Let's make an example: inside the `bytes32` variable, we have this value `0x66a80b61b29ec044d14c4c8c613e762ba1fb8eeb0c454d1ee00ed6dedaa5b5c5`

If we perform a downcast of that value to `bytes16` the new value would be `0x66a80b61b29ec044d14c4c8c613e762b`

Can you see the result? Solidity takes the **higher order 16 bytes** and "transfer" them to the new variable.

For our challenge it's not a huge deal because the `unlock` function just a simple equality check `_key == bytes16(data[2])` but it's still an important concept to know.

### Read storage values

We now have all the information that we need, and we can leverage the power of `Foundry` by using its cheatcode `vm.load` to read a specific slot position from a specific contract's address

If you want to learn more about this cheatcode, just open the [Foundry Cheatcodes Reference](https://book.getfoundry.sh/cheatcodes/#cheatcodes-reference).

## Solution code

Here's the code that I used for the test:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Read the slot 5 from the level address
    bytes32 data = vm.load(address(level), bytes32(uint256(5)));

    // Call the level's `unlock` function and pass the downcasted bytes16
    // value we just took from the private slot
    level.unlock(bytes16(data));

    // Assert we have unlocked the contract and passed the challenge
    assertEq(level.locked(), false);

    vm.stopPrank();
}
```

You can read the full solution of the challenge, opening [Privacy.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Privacy.t.sol)

## Further reading

- [SWC-136: Unencrypted Private Data On-Chain](https://swcregistry.io/docs/SWC-136)
- [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html)
- [Layout of State variables in Storage](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#layout-of-state-variables-in-storage)
- [Constant and Immutable State Variables](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables)
- [Mappings and Dynamic Arrays](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#mappings-and-dynamic-arrays)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
