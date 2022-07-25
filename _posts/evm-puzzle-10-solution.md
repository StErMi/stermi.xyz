---
title: 'EVM Puzzle 10 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-22T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 10 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 10

```bash
00      38          CODESIZE
01      34          CALLVALUE
02      90          SWAP1
03      11          GT
04      6008        PUSH1 08
06      57          JUMPI
07      FD          REVERT
08      5B          JUMPDEST
09      36          CALLDATASIZE
0A      610003      PUSH2 0003
0D      90          SWAP1
0E      06          MOD
0F      15          ISZERO
10      34          CALLVALUE
11      600A        PUSH1 0A
13      01          ADD
14      57          JUMPI
15      FD          REVERT
16      FD          REVERT
17      FD          REVERT
18      FD          REVERT
19      5B          JUMPDEST
1A      00          STOP
```

This puzzle is similar to the [Puzzle 9](https://stermi.hashnode.dev/evm-puzzle-9-solution) we have just completed. It's mostly about understanding what opcodes do and solve a system of equations.

Let's see what new opcodes have been introduced:

- [GT](https://www.evm.codes/#11): pop 2 values from the stack and push the result of `value0 > value1` to the stack. If the result is `true`, it pushes `1` otherwise `0`
- [MOD](https://www.evm.codes/#11): pop 2 values from the stack and push back to the stack the result of `value0 % value1`. Note that the denominator (`value1`) is `0` the result will be `0`
- [ISZERO](https://www.evm.codes/#15): pop a value from the stack and push the result of `value0 === 0` to the stack

## Block 1: check calldata size and call value

```bash
00      38          CODESIZE
01      34          CALLVALUE
02      90          SWAP1
03      11          GT
04      6008        PUSH1 08
06      57          JUMPI
07      FD          REVERT
08      5B          JUMPDEST
```

The block adds the size of the code to the stack, add the value sent with the transaction to the stack, swap them in position (you could have achieved the same result with less gas) and then perform `GT(CALLVALUE, CODESIZE)`.

If the result of that is **0** it will not follow the `JUMPI` jump and revert.
`CODESIZE` push to the stack the number of bytes of the contract's code. In this case, it will push to the stack the value `0x1b` (27 in decimal).

**Note:** The number of code's instructions are 24 (so 24 bytes) but you must add to those also the bytes pushed by the `PUSH*` opcodes. In this case, we have 2 `PUSH1` and 1 `PUSH2` so in total we need to add 3 bytes. That's why the `CODESIZE` return 27 → 24 bytes for the number of instructions + 3 bytes from the values of the `PUSH` in the code.

We have found our first equation to not revert: `GT(27, CALLVALUE) = 1` so we must have `CALLVALUE <= 27` to not revert.

## Block 2: check the calldata size

```bash
08      5B          JUMPDEST
09      36          CALLDATASIZE
0A      610003      PUSH2 0003
0D      90          SWAP1
0E      06          MOD
0F      15          ISZERO
```

The opcodes push to the stack the `CALLDATASIZE`, push `0x0003`, swap them, perform a `MOD(0x0003, CALLDATASIZE)` and perform `ISZERO` on the value0 present in the stack. Because we have just performed the MOD operation, it will be `ISZERO(MOD(0x0003, CALLDATASIZE))`

This value will be used by the `JUMPI` from the instruction in position `14`. If the result of the `ISZERO` is not **1** the contract will revert because it will not perform the jump.

The size of our `calldata` must be a multiple of 3 to make `MODE(3, CALLDATASIZE)` be equal to **0**.

This is the second part of the system of equations.

## Block 3: find the correct call value to jump to a valid `JUMPDEST`

```bash
10      34          CALLVALUE
11      600A        PUSH1 0A
13      01          ADD
14      57          JUMPI
```

Currently, in our stack we have the result of `ISZERO(MOD(0x0003, CALLDATASIZE))` and we know that it will be 1 otherwise we are going to revert.

Performing the other operation will make the stack be like

```bash
PUSH 0A
CALLVALUE
ISZERO(MOD(0x0003, CALLDATASIZE))
```

At this point, we perform the `ADD` so we have the stack that will be

```bash
ADD(0A, CALLVALUE)
ISZERO(MOD(0x0003, CALLDATASIZE))
```

`JUMPI` will perform a jump to the position with value `ADD(0x0A, CALLVALUE)`. The `JUMPDEST` that we want to reach is the one in position `19` (25 in decimal).

This mean that `ADD(0x0A, CALLVALUE) === 19`. The only possible value for that is that our `CALLVALUE` is 10 (in hex is 0x0F)

## Solution

The system of equations we have to solve is this:

- `CODESIZE = 27` (`1b` in hex) is always
- `CALLVALUE` must be `<= 27` to make `GT(CALLVALUE, CODESIZE)` return `1`
- `CALLVALUE = 15` (`0F` in hex) to make `ADD(0A, CALLVALUE)` return `19`
- `CALLDATASIZE` must be a multiple of `3` to make `ISZERO(MOD(0x0003, CALLDATASIZE))` return `1`

A possible solution could be:

- `CALLVALUE` = **15**
- `CALLDATA` = **0xFFFFFF**

Here's the link to the [solution of Puzzle 10](https://www.evm.codes/playground?callValue=15&unit=Wei&callData=0xFFFFFF&codeType=Bytecode&code=%2738349011600857FD5B3661000390061534600A0157FDFDFDFD5B00%27_) on EVM Codes website to simulate it.
