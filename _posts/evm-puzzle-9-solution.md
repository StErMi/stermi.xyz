---
title: 'EVM Puzzle 9 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-21T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 9 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 9

```bash
00      36        CALLDATASIZE
01      6003      PUSH1 03
03      10        LT
04      6009      PUSH1 09
06      57        JUMPI
07      FD        REVERT
08      FD        REVERT
09      5B        JUMPDEST
0A      34        CALLVALUE
0B      36        CALLDATASIZE
0C      02        MUL
0D      6008      PUSH1 08
0F      14        EQ
10      6014      PUSH1 14
12      57        JUMPI
13      FD        REVERT
14      5B        JUMPDEST
15      00        STOP
```

This puzzle is much simpler compared to the previous one. It's just a question to solve some math equations.

Let's see what new opcodes have been introduced:

- [LT](https://www.evm.codes/#10): pop 2 values from the stack and push the result of `value0 < value1` to the stack. If the result is true, it pushes `1` otherwise `0`.
- [CALLVALUE](https://www.evm.codes/#34): push to the stack the value of the current call in `wei`

## Block 1: check calldata size

```bash
00      36        CALLDATASIZE
01      6003      PUSH1 03
03      10        LT
04      6009      PUSH1 09
06      57        JUMPI
07      FD        REVERT
08      FD        REVERT
09      5B        JUMPDEST
```

This block check if the size in byte of the `calldata` is less than 3. If so, it does not follow the `JUMPI` jump and revert. That's our first requirement. Our `calldatasize` must be greater or equal of `3`.

## Block 2: Check the calldata size and value

```bash
09      5B        JUMPDEST
0A      34        CALLVALUE
0B      36        CALLDATASIZE
0C      02        MUL
0D      6008      PUSH1 08
0F      14        EQ
10      6014      PUSH1 14
12      57        JUMPI
13      FD        REVERT
14      5B        JUMPDEST
15      00        STOP
```

The next block of code instead push to the stack the multiplication of `calldata` size in bytes and calldata value in `wei`.

If the result is not equal to 8 it will not follow the `JUMPI` jump and revert. This means that the second requirement is that `MUL(calldata_size, calldata_value)` must be equal to 8.

## Solution

There are many possible solutions, we just need to follow these requirements:

- `CALLDATASIZE >= 3
- `CALLVALUE * CALLDATASIZE === 8`

For example, `0xFFFFFFFFFFFFFFFF` as calldata and `1 wei` as value will solve the challenge, but also `0xFFFFFFFF` and `2 wei` will do it!

Here's the link to the [solution of Puzzle 9](https://www.evm.codes/playground?callValue=1&unit=Wei&callData=0xFFFFFFFFFFFFFFFF&codeType=Bytecode&code=%2736600310600957FDFD5B343602600814601457FD5B00%27_) on EVM Codes website to simulate it.
