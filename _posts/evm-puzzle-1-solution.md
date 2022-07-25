---
title: 'EVM Puzzle 1 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-10T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 1 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 1

```bash
00      34      CALLVALUE
01      56      JUMP
02      FD      REVERT
03      FD      REVERT
04      FD      REVERT
05      FD      REVERT
06      FD      REVERT
07      FD      REVERT
08      5B      JUMPDEST
09      00      STOP
```

The solution is to make the contract jump to the PC (program counter, the number on the first column) 08 that is marked by the JUMPDEST opcode.

The [JUMP](https://www.evm.codes/#56) opcode works like this:

> Instruction alters the program counter, thus breaking the linear path of the execution to another point in the deployed [code](https://www.evm.codes/about). It is used to implement functionalities like functions.

Note that the PC to which we are going to jump must be a valid destination marked by a JUMPDEST opcode.

From where the JUMP will get the value to jump to? As we said before, each operation interact with the stack, memory o storage. In this case the JUMP operation will take the first value (remember that the stack work as a LIFO queue) from the stack and will use it as the parameter to know where it needs to jump.

That specific value is added to the stack from the [CALLVALUE](https://www.evm.codes/#34) opcode that is the very first opcode executed by the EVM.

What does this opcode do? It push to the stack the value of the current call in `wei`.

So for example if we were calling this contract with a `msg.value` equal to `1000 wei` it would push to the stack `3e8` (the hex conversion of 1000 in decimal).

So we need to find the correct value of wei to pass to the contract in order to make the `CALLVALUE` opcode to push the correct byte offset to make it jump to the valid `JUMPDEST` at PC 8.

## Solution

To solve this puzzle we must call the contract passing `msg.value` equal to **8**, by doing this `CALLVALUE` will push to the EVM Stack `8` that will be popped by the `JUMP` opcode. By doing that the Program Counter will jump to the eighth instruction that is represented by `JUMPDEST`

Here's the link to the [solution of Puzzle 1](https://www.evm.codes/playground?callValue=8&unit=Wei&callData=&codeType=Bytecode&code=%273456FDFDFDFDFDFD5B00%27_) on EVM Codes website to simulate it.
