---
title: 'EVM Puzzle 8 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2022-06-20T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 8 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 8

```bash
00      36        CALLDATASIZE
01      6000      PUSH1 00
03      80        DUP1
04      37        CALLDATACOPY
05      36        CALLDATASIZE
06      6000      PUSH1 00
08      6000      PUSH1 00
0A      F0        CREATE
0B      6000      PUSH1 00
0D      80        DUP1
0E      80        DUP1
0F      80        DUP1
10      80        DUP1
11      94        SWAP5
12      5A        GAS
13      F1        CALL
14      6000      PUSH1 00
16      14        EQ
17      601B      PUSH1 1B
19      57        JUMPI
1A      FD        REVERT
1B      5B        JUMPDEST
1C      00        STOP
```

This challenge is similar to the previous [[Puzzle 7]] but slightly different.

Let's review each new opcode and try to break down everything in blocks:

- [SWAP5](https://www.evm.codes/#94): this opcode swap the opcode in position 0 with the one in position 5. SWAP opcodes go from `SWAP1` to `SWAP16`
- [GAS](https://www.evm.codes/#5a): push in the stack the remaining gas in the transaction after this operation. Because yes, also the `GAS` op costs gas :D (2 gas)
- [CALL](https://www.evm.codes/#f1): Creates a new sub context (every op that interact with the "outside" create a new context as far as I see) and execute the code present in the external account. The opcode push to the stack the 0 if the call reverted, otherwise 1. After the execution, it keeps the normal flow. **Note:** if the account called have no code, it will return success as `true`. The opcode pop 7 elements from the stack to be used as parameters when executing it:
  - `gas`: the amount of gas to send to the sub context created for the execution.
  - `address`: the address on which the context will be executed
  - `value`: value in `wei` to send to the address
  - `argsOffset`: byte offset in the memory in number of bytes
  - `argsSize`: byte size to copy from the memory with the previously specified offset
  - `retOffset`: byte offset in memory in bytes from which you want to store the return data returned by the execution
  - `retSize`: byte size to copy from the returned data

Let's try to understand what all those opcodes do when executed.

## Block 1: Copy the whole calldata input in memory

```bash
00      36        CALLDATASIZE
01      6000      PUSH1 00
03      80        DUP1
04      37        CALLDATACOPY
```

The `CALLDATACOPY` is like a "special" MLOAD that take the data to be stored in the memory directly from the calldata location.
Those instructions are saying: take all the data from calldata and copy it to the memory starting from the memory position 0.

## Block 2: Create a new contract, its code will be the equal to the calldata data

After the execution of ops from "Block 1" we have our calldata data inside memory starting from position 0.

```bash
05      36        CALLDATASIZE
06      6000      PUSH1 00
08      6000      PUSH1 00
0A      F0        CREATE
```

These opcodes are just saying: create a new contract transferring `0 wei` with the transaction. The code to deploy the new contract will be the one in memory that goes from offset `0` to `CALLDATASIZE` bytes.

So connecting Block 1 and Block 2 the result is this: use the calldata data in input to use it as the code to deploy a new contract.

## Block 3: Prepare and make the CALL

```bash
0B      6000      PUSH1 00
0D      80        DUP1
0E      80        DUP1
0F      80        DUP1
10      80        DUP1
11      94        SWAP5
12      5A        GAS
13      F1        CALL
```

All the opcodes before `CALL` are just preparing all the inputs needed to execute the call.
After the preparation, we will execute this `CALL(gas=ALL_THE_GAS_AVAILABLE, address=ADDRESS_FROM_CREATE, value: 0, argsOffset=0, argsSize=0, retOffset=0, retSize=0)`

Basically, we are just calling the deployed contract with all the gas still available without any calldata arguments and without reading anything from the returned value.

After the execution of `CALL` the stack will have only one value. `0` if it has **reverted**, `1` otherwise.

## Block 4: Make the jump!

````bash
14      6000      PUSH1 00
16      14        EQ
17      601B      PUSH1 1B
19      57        JUMPI
1A      FD        REVERT
1B      5B        JUMPDEST
1C      00        STOP```

Before the `PUSH1 00` the stack has only the execution result of the `CALL`.
All these op codes are saying: if the `CALL` has reverted, jump to `1B` otherwise keep going with the flow and execute `REVERT` (something that we don't want!).

The solution of the challenge is to not execute the `REVERT` opcode in position `1A` is to deploy a contract that, when called, will **revert**. Reverting `CALL` will push to the stack the value `0` that will make the `EQ` push to the stack a `1`.
By doing so, the `JUMPI` opcode will jump to the `1B` position!

## Solution

The question is, which is the `calldata` to pass to the transaction to make this?

We can make the deployed contract to just revert as soon as possible by having just the `REVERT` opcode.

The calldata that we need to pass will be

```bash
// store in memory the REVERT opcode as the only "code" of the contract
PUSH1 FD
PUSH1 00
MSTORE8

// make the constructor return the stored runtime code
PUSH1 01
PUSH1 00
RETURN
````

Translated in bytecode, our calldata and solution to the puzzle will be `0x60FD60005360016000F3`.

Here's the link to the [solution of Puzzle 8](https://www.evm.codes/playground?callValue=0&unit=Wei&callData=0x60FD60005360016000F3&codeType=Bytecode&code=%2736600080373660006000F0600080808080945AF1600014601B57FD5B00%27_) on EVM Codes website to simulate it.
