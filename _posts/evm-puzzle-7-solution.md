---
title: 'EVM Puzzle 7 solution'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-18T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

This is Part 7 of the [“Let’s play EVM Puzzles”](https://stermi.xyz/blog/lets-play-evm-puzzles) series, where I will explain how to solve each puzzle challenge.

> [EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

## EVM Puzzle 7

```bash
00      36        CALLDATASIZE
01      6000      PUSH1 00
03      80        DUP1
04      37        CALLDATACOPY
05      36        CALLDATASIZE
06      6000      PUSH1 00
08      6000      PUSH1 00
0A      F0        CREATE
0B      3B        EXTCODESIZE
0C      6001      PUSH1 01
0E      14        EQ
0F      6013      PUSH1 13
11      57        JUMPI
12      FD        REVERT
13      5B        JUMPDEST
14      00        STOP
```

This challenge introduces some new opcode and more complexity.
Let's review each new opcode and try to break down everything in blocks:

- [CALLDATACOPY](https://www.evm.codes/#37): pop 3 values from the stack as inputs and copy the calldata value from the transaction data to the memory
  - input1 `destOffset`: byte offset in memory where the result of the copy operation will be copied to
  - input2 `offset`: byte offset in the calldata from which you want to start to copy from
  - input3 `size`: byte size of the data from calldata you intend to copy in memory
- [CREATE](https://www.evm.codes/#37): deploy a new contract. It pops 3 values from the stack to use as input of the deployment operation. The result of the operation is the **address** of the deployed contract that is pushed to the stack.
  - input1 `value`: value in way to send to the new account
  - input2 `offset`: byte offset from where you want to start copy the new contract's code from the memory
  - input3: `size`: byte size of instruction to copy starting from the memory offset
- [EXTCODESIZE](https://www.evm.codes/#37): Pop a value from the stack to be used as a 20-byte address. The address will be used to "query" the destination contract and get as the result the byte size of the contract's code. The result is pushed back to the stack

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

## Block 3: Make it jump!

```bash
0B      3B        EXTCODESIZE
0C      6001      PUSH1 01
0E      14        EQ
0F      6013      PUSH1 13
11      57        JUMPI
```

`EXTCODESIZE` get the size in bytes of the deployed contract and add it to the stack. After that, the puzzle check that the size of the deployed contract is equal to the value 1. If so, we follow the `JUMPI` to the position `13` and we win the challenge.

The solution is to find a `calldata` value for which the result of `EXTCODESIZE` (done on the contract deployed with code from the `calldata` itself) return **1**.

## Solution

What's the correct `calldata` to pass to the transaction to

- make the contract successfully deploy via `CREATE`
- return **1** when `EXTCODESIZE` is executed

Let's find out how `CREATE` work:

As we saw from the OpenZeppelin blog post ["# Deconstructing a Solidity Contract — Part II: Creation vs. Runtime"](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-ii-creation-vs-runtime-6b9d60ecb44c/)

> [...] The creation code gets executed in a transaction, which returns a copy of the runtime code, which is the actual code of the contract. As we will see, the constructor is part of the creation code, and not part of the runtime code. The contract’s constructor is part of the creation code; it will not be present in the contract’s code once it is deployed.

When the `CREATE` opcode is executed, only the code returned by the `RETURN` opcode will be the "runtime code" that will be executed in the future when the deployed contract will be called. The other part of the bytecode is just used once, only for the `constructor` part.

Our `calldata` can have all the code we want inside, but we need to make it sure that the returned code (runtime code) has only 1 instruction, so `EXTCODESIZE` will return 1 (byte).

Let's see how the [RETURN](https://www.evm.codes/#f3) opcode works: it pops 2 values from the stack to use them as input for:

- memory offset from where to start to read
- memory size in bytes to read and return

Whatever it's in memory, we want to return only 1 instruction that is 1 byte. Our goal is to execute `RETURN(offset=0, size=1)`.

Let's make an example where we want our deployed smart contract to have only the `STOP` instruction (opcode `00`). The code that must be sent to the `CREATE` opcode would be like this

```bash
PUSH1 00 // 00 is the opcode for STOP
PUSH1 00 // this will be used as the offset of MSTORE8 that store 1 byte in memory
MSTORE8 // will store in memory from offset 0 the `00` value (from the first PUSH1)

PUSH1 01 // how many bytes must be returned
PUSH1 00 // from which memory offset return those bytes
RETURN
```

That translated in bytecode is `600060005360016000F3`.

So if we pass `600160005360016000F3` as the calldata of our puzzle, it will use that calldata to create and deploy a new contract that will have a runtime code of just `00`: the `STOP` opcode!

Here's the link to the [solution of Puzzle 7](https://www.evm.codes/playground?callValue=0&unit=Wei&callData=0x600060005360016000F3&codeType=Bytecode&code=%2736~0803736~0~0F03B~114601357FD5B00%27~600%01~_) on EVM Codes website to simulate it.
