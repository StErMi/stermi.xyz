---
title: 'EthernautDAO CTF 6 — Hackable Contract Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>Our goal is to be able to solve the challenge, become the `winner` and flip the value of `done` from `false` to `true`.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-08-08T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1556278995909427202](https://twitter.com/EthernautDAO/status/1556278995909427202)

## CTF 6: Hackable

For this challenge, we have to deal only with a single Smart Contract called [hackable](https://goerli.etherscan.io/address/0x445d0fa7fa12a85b30525568dfd09c3002f2ade5#code), a simple smart contract.

The smart contract has been deployed with the following configuration values:

- `lastXDigits` equal to `45`
- `mod` equal to `100`
- `done` equal to `false`

Our goal is to be able to solve the challenge, become the `winner` and flip the value of `done` from `false` to `true`.

## Study the contracts

This contract is simple to understand and easy to solve, the annoying thing to become the `winner` is just wait for the correct time to call the function `cantCallMe`. You will understand it in just a few moments ;)

Let's see the code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract hackable {
    uint256 public lastXDigits;
    uint256 public mod;
    bool public done;
    address public winner;

    constructor(uint256 digits, uint256 m) {
        lastXDigits = digits;
        mod = m;
        done = false;
    }

    function cantCallMe() public {
        require(done == false, "Already done");
        uint256 res = block.number % mod;
        require(res == lastXDigits, "Can't call me !");
        winner = msg.sender;
        done = true;
    }
}
```

As you can see, there are not many lines of code to understand, so let's just directly in the solution.

To make `cantCallMe` to not revert, we have to call it in the correct `block.number` for which the result of `block.number % mod == lastXDigits`.

The contract is deployed with the current configuration:

- `lastXDigits` equal to `45`
- `mod` equal to `100`

This mean that to pass the check, we have to call the function in a specific block number for which `block.number % 100 == 45`.

As I said, the challenge was straightforward, you just need to call the function in a block where the `block.number` last two digits are equal to **45**. This mean that you have to patiently wait for the blockchain to mint new blocks and be able to insert a transaction in the correct one.

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
function testFindTheGoodBlock() public {
    address player = users[0];

    // Random block number just to test the solution
    uint256 solutionBlockNumber = 948574245;

    // warp the blockchain to the blocknumber that will solve the challenge
    vm.roll(solutionBlockNumber);

    // Assert that the solution is correct
    assertEq(solutionBlockNumber % hackableContract.mod(), hackableContract.lastXDigits());

    // Solve the challenge
    vm.prank(player);
    hackableContract.cantCallMe();

    // assert it has been solved
    assertEq(hackableContract.winner(), player);
    assertEq(hackableContract.done(), true);
}
```

Here is the command I have used to run the test: `forge test --match-contract HackableTest --fork-url <your_rpc_url> --fork-block-number 7335616 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [Hackable.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/Hackable.t.sol)

## Further reading

This contract has no further reading material.

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
