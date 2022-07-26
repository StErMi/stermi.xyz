---
title: 'EVM Puzzle 6 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2022-06-17T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 6 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 6

```bash
00      6000      PUSH1 00
02      35        CALLDATALOAD
03      56        JUMP
04      FD        REVERT
05      FD        REVERT
06      FD        REVERT
07      FD        REVERT
08      FD        REVERT
09      FD        REVERT
0A      5B        JUMPDEST
0B      00        STOP
```

This challenge introduces the usage of a new opcode called [CALLDATALOAD](https://www.evm.codes/#35).
The `CALLDATALOAD` opcode pop a value from the stack and use it as the byte `offeset` to read from the `CALLDATA`. The result of the read from the calldata is pushed to the stack as a 32-byte value. Remember that

> All bytes after the end of the [calldata](https://www.evm.codes/about) are set to 0.

Let's make an example. Our calldata is `0x3039` (hex conversion of 12345 in decimal). If before calldata we have `PUSH1 00` it means that `CALLDATALOAD` will load the whole calldata value with an offset of `0 bytes`.

The result would be that in stack position 0 we will have `3039000000000000000000000000000000000000000000000000000000000000`. Do you see all the zeroes? That's because after the end of the`calldata` the EVM will fill the stack 32-byte value with zeroes.

If we had `PUSH1 01` before `CALLDATALOAD` we would have in the stack `3900000000000000000000000000000000000000000000000000000000000000`.

To solve this challenge, we need to make the EVM to jump to the instruction with `PC` position `0A`.

## Solution

Given that we push as `CALLDATA` byte offset index a value of `0` we need to have inside the calldata a value that will let us jump to position `0A`.

In this case, the solution will be to pass as `calldatavalue` the value **0x000000000000000000000000000000000000000000000000000000000000000A**.

Here's the link to the [solution of Puzzle 6](https://www.evm.codes/playground?callValue=0&unit=Wei&callData=0x000000000000000000000000000000000000000000000000000000000000000A&codeType=Bytecode&code=%2760003556FDFDFDFDFDFD5B00%27_) on EVM Codes website to simulate it.
