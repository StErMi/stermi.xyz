---
title: 'EVM Puzzle 2 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-12T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 2 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 2

```bash
00      34      CALLVALUE
01      38      CODESIZE
02      03      SUB
03      56      JUMP
04      FD      REVERT
05      FD      REVERT
06      5B      JUMPDEST
07      00      STOP
08      FD      REVERT
09      FD      REVERT
```

The problem is similar to the [[Puzzle 1]] challenge where we need to find a way to have in the EVM Stack the correct value when the `JUMP` opcode is executed. We need to have into the stack the value `6` in order to land in a valid `JUMPDEST` opcode.

Let's review each operation and plan ahead

- `CALLVALUE` as we know from the previous challenge will push the `msg.value` (in wei) to the stack
- [CODESIZE](https://www.evm.codes/#38) push into the stack the contract's code size in `bytes`
- [SUB](https://www.evm.codes/#03) pop two values from the stack, subscract V1 (position 1 in the stack) from V0 (position 0 in the stack), pushing the result of the operation into the stack

This would be the stack before the `SUB` opcode:

| POSITION | VALUE | REASON                |
| -------- | ----- | --------------------- |
| #0       | V1    | pushed by `CODESIZE`  |
| #1       | V0    | pushed by `CALLVALUE` |

After `SUB` the stack would have the value `V0-V1` (`CODESIZE - CALLVALUE`). It's important to remember that the EVM Stack operates as a LIFO (last in, first out) queue.

## Solution

The contract code is nothing more than the ordered list of Opcodes that will be executed by the EVM. Each opcode is `1 byte` so `CODESIZE` op will push the value `0x0A` to the stack (hex conversion of 10 in decimal).

To have `6` as the result of `SUB` we need `CALLVALUE` to push the value `4` into the Stack in order to make `JUMP` the PC jump to the sixth position of our code.

Here's the link to the [solution of Puzzle 2](https://www.evm.codes/playground?callValue=4&unit=Wei&callData=&codeType=Bytecode&code=%2734380356FDFD5B00FDFD%27_) on EVM Codes website to simulate it.
