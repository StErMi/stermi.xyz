---
title: 'EVM Puzzle 4 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-15T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 4 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 4

```bash
00      34      CALLVALUE
01      38      CODESIZE
02      18      XOR
03      56      JUMP
04      FD      REVERT
05      FD      REVERT
06      FD      REVERT
07      FD      REVERT
08      FD      REVERT
09      FD      REVERT
0A      5B      JUMPDEST
0B      00      STOP
```

Similar to the previous challenges, we need to find the correct `CALLVALUE` value to pass to the contract to make the `JUMP` jump to the valid `JUMPDEST` opcode at the instruction 10 (`0A` in hex)

Let's review each opcode before the `JUMP`:

- `CALLVALUE` push in the stack the `msg.value` in `wei` passed along the transaction
- `CODESIZE`: push in the stack the byte size of the contract's code
- [XOR](https://www.evm.codes/#18): pop the first and second element from the stack and perform the bitwise XOR operation between them. The result will be pushed back to the stack.

Remember that the Stack is a LIFO queue, so when the `XOR` will be applied it would be like this: `XOR(CODESIZE, CALLVALUE)`

## Solution

The first valid `JUMPDEST` operation is at position 10 so `XOR(CODESIZE, CALLVALUE) == 10`.
In our case, `CODESIZE` is 12 bytes, so we know that `XOR(12, CALLVALUE)` must equal to 10.

The correct value of `CALLVALUE` will be **6**!

Here's the link to the [solution of Puzzle 4](https://www.evm.codes/playground?callValue=6&unit=Wei&callData=&codeType=Bytecode&code=%2734381856FDFDFDFDFDFD5B00%27_) on EVM Codes website to simulate it.
