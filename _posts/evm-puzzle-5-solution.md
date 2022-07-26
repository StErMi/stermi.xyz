---
title: 'EVM Puzzle 5 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2022-06-16T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 5 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 5

```bash
00      34          CALLVALUE
01      80          DUP1
02      02          MUL
03      610100      PUSH2 0100
06      14          EQ
07      600C        PUSH1 0C
09      57          JUMPI
0A      FD          REVERT
0B      FD          REVERT
0C      5B          JUMPDEST
0D      00          STOP
0E      FD          REVERT
0F      FD          REVERT
```

This challenge is a little different compared to the previous one. Instead of using `JUMP` it uses the opcode [JUMPI](https://www.evm.codes/#57).

> The **JUMPI** instruction may alter the program counter, thus breaking the linear path of the execution to another point in the deployed [code](https://www.evm.codes/about). It is used to implement functionalities like loops and conditions.

When the `JUMPI` is executed, it pops 2 values from the Stack. The first value will be the new Program Counter to jump to (as always, it must be a valid `JUMPDEST` instruction). The second value instead is a boolean flag (0 or 1) to evaluate to know if it must jump or not.
If the value is 1 it will jump; otherwise it will continue to the next instruction.

Let's review each opcode before the `JUMPI`:

- `CALLVALUE` push in the stack the `msg.value` in `wei` passed along the transaction
- [DUP1](https://www.evm.codes/#80): duplicate the first value in the stack and push it to the first position of the stack
- [MUL](https://www.evm.codes/#02): pop the first two values of the stack and multiply them. The result is pushed back to the stack
- [PUSH2](https://www.evm.codes/#61): push 2 bytes input into the stack
- [EQ](https://www.evm.codes/#14): pop 2 values from the stack, if those are equal push 1 to the stack, otherwise push 0.
- [PUSH](https://www.evm.codes/#60): push 1 byte input into the stack

Let's review the stack after each operation

`CALLVALUE` is executed
