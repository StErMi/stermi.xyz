---
title: 'Let’s play EVM Puzzles — learning Ethereum EVM while playing!'
excerpt: 'EVM Puzzles is a project developed by Franco Victorio (@fvictorio_nan) that is a perfect fit if you are in the process of learning how the Ethereum EVM works, and you want to apply some of the knowledge you have just acquired.'
coverImage:
  url: '/assets/blog/evm_puzzle.jpeg'
  credit:
    name: Ryoji Iwata Unsplash
    url: https://unsplash.com/@ryoji__iwata
date: '2020-06-09T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/evm_puzzle.jpeg'
---

[EVM Puzzles](https://github.com/fvictorio/evm-puzzles) is a project developed by Franco Victorio ([@fvictorio_nan](https://twitter.com/fvictorio_nan)) that a perfect fit if you are in the process of learning how the Ethereum EVM works and you want to apply some of the knowledge you have just acquired.

Let's see what's this project is all about:

> A collection of EVM puzzles. Each puzzle consists on sending a successful transaction to a contract. The bytecode of the contract is provided, and you need to fill the transaction data that won't revert the execution.

If you are not familiar with Ethereum EVM I would suggest you to start learning more by giving a try to ["The EVM Handbook"](https://noxx3xxon.notion.site/noxx3xxon/The-EVM-Handbook-bb38e175cc404111a391907c4975426d) it will not be an easy and short read but it contains tons of videos and articles about EVM and it's really well made.

## How to play

```bash
git clone https://github.com/fvictorio/evm-puzzles.git
cd evm-puzzles
npm install
npx hardhat play
```

The "puzzle" to solve for each challenge is to understand which is the correct value, calldata or both that you have to send to the contract in order to not revert.

All Opcode are executed one by one and they will interact with the stack, memory or storage.

While playing you will probably need some useful tools that would help you visualize and debug those op codes. Here's the one I'm using

- [EVM Codes](https://www.evm.codes)
- [Ethereum Virtual Machine Opcodes](https://www.ethervm.io)
- [Ethereum Remix](https://remix.ethereum.org)

## Solutions to each puzzle

As promised, I will update this blog post every time I will publish a new solution of the puzzle. In every blog post, I’ll explain each new opcode we are going to use and a step-by-step guide to solve the puzzle

- [EVM Puzzle 1 solution](https://stermi.xyz/blog/evm-puzzle-1-solution)
- [EVM Puzzle 2 solution](https://stermi.xyz/blog/evm-puzzle-2-solution)
- [EVM Puzzle 3 solution](https://stermi.xyz/blog/evm-puzzle-3-solution)
- [EVM Puzzle 4 solution](https://stermi.xyz/blog/evm-puzzle-4-solution)
- [EVM Puzzle 5 solution](https://stermi.xyz/blog/evm-puzzle-5-solution)
- [EVM Puzzle 6 solution](https://stermi.xyz/blog/evm-puzzle-6-solution)
- [EVM Puzzle 7 solution](https://stermi.xyz/blog/evm-puzzle-7-solution)
- [EVM Puzzle 8 solution](https://stermi.xyz/blog/evm-puzzle-8-solution)
- [EVM Puzzle 9 solution](https://stermi.xyz/blog/evm-puzzle-9-solution)
- [EVM Puzzle 10 solution](https://stermi.xyz/blog/evm-puzzle-10-solution)
