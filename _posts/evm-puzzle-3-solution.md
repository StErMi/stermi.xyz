---
title: 'EVM Puzzle 3 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2022-06-14T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 3 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 3

```bash
00      36      CALLDATASIZE
01      56      JUMP
02      FD      REVERT
03      FD      REVERT
04      5B      JUMPDEST
05      00      STOP
```

The problem is similar to the [[Puzzle 1]] and [[Puzzle 2]] challenges where we need to find a way to have in the EVM Stack the correct value when the `JUMP` opcode is executed. We need to have into the stack the value `4` in order to land in a valid `JUMPDEST` opcode.

In this puzzle we have only one opcode before the `JUMP`

- [CALLDATASIZE](https://www.evm.codes/#36) push the byte size of the calldata

To solve this challenge it's important to understand what the `calldata` is.

From [Chapter 13 - The Ethereum Virtual Machine](https://github.com/ethereumbook/ethereumbook/blob/develop/13evm.asciidoc)

> The call data region is the data that is sent with a transaction. In the case of contract creation, it would be the constructor code. This region is immutable and can be read with the instructions [CALLDATALOAD](http://localhost:3000/#35), [CALLDATASIZE](http://localhost:3000/#36), and [CALLDATACOPY](http://localhost:3000/#37).

Instead from OpenZeppelin blog post ["Deconstructing a Solidity Contract — Part III: The Function Selector"](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-iii-the-function-selector-6a9b6886ea49/) the `calldata` is explained like:

> [As explained in Solidity’s documentation ABI specification](https://docs.soliditylang.org/en/v0.8.14/abi-spec.html), the calldata is an encoded chunk of hexadecimal numbers that contains information about what function of the contract we want to call, and it’s arguments or data. Simply put, it consists of a “function id”, which is generated by hashing the function’s signature (truncated to the first leading four bytes) followed by the packed arguments data.

If for example we want to interact with a Contract to withdraw `10 WETH` we would call the contract's function that have this signature: `withdraw(uint256)`. The calldata value for that call would be `0x2e1a7d4d0000000000000000000000000000000000000000000000008ac7230489e80000` which the 4 first bytes represents the function signature, the other 32 would represent the uint256 parameter value passed to it.

Just try to print this in your Solidity contract to reproduce it: `abi.encodeWithSignature("withdraw(uint256)", 10 ether);`

## Solution

The solution in this challenge is pretty easy, we just need to pass 4 bytes input value in order to make the `JUMP` op to jump to the `JUMPDEST` destination.

For example we could pass the 4 bytes that represent the signature of the function we have used in the example above. In this case we would pass `0x2e1a7d4d` to solve the challenge.

Here's the link to the [solution of Puzzle 3](https://www.evm.codes/playground?callValue=0&unit=Wei&callData=0x2e1a7d4d&codeType=Bytecode&code=%273656FDFD5B00%27_) on EVM Codes website to simulate it.
