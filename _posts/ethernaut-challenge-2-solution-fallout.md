---
title: 'Ethernaut Challenge #2 Solution —  Fallout'
excerpt: 'This is Part 2 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>

The goal of this challenge is to claim ownership of the `Fallout` contract.
'
coverImage: 
  url: '/assets/blog/ethernaut/fallout.svg'
  credit: 
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-06-30T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/fallout.svg'
---

This is Part 2 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #2: Fallout

> Claim ownership of the contract below to complete this level.
>
> Things that might help
>
> - Solidity Remix IDE
>
> Level author(s): [Alejandro Santander](https://github.com/ajsantander)

## Study the contracts

First thing that we notice, the Solidity compiler version used is `< 0.8.x`. This mean that the contract would be prone to math underflow and overflow bugs.

This contract is importing and using OpenZeppelin [SafeMath](https://docs.openzeppelin.com/contracts/4.x/api/utils#SafeMath) library, so they should be safe about overflow/underflow problems.

The challenge is pretty unique and if you are new to the Solidity security topic probably you will have a hard time to understand how to solve this challenge but only for one reason: this problem only existed **before** `Solidity 0.4.22`.

Before `Solidity 0.4.22` the only way to define a constructor for a contract was to define a function with the same name as the contract itself.
You can imagine what could go wrong... you think to have defined the constructor function that should have the name of the contract, but you make a typo while writing it... the function is never called automatically because it's not recognized as a constructor anymore and so the **contract is not initialized** at creation time.

After that Solidity version, they introduced a new `constructor` keyword to avoid this kind of mistake.

If you look at the code, the contract's name is `Fallout` but the constructor function is called `Fal1out`. Can you see the typo? They used a **1** instead of an **l**.
Because of that typo, when the contract is deployed, the constructor function is never executed at creation time and the `owner` variable is never updated. This is because `Fal1out` now is seen as a "normal" function.

## Solution code

The solution of this challenge is pretty easy. We just need to call the `Fal1out` function that has never been called.

```solidity
function exploitLevel() internal override {
    vm.startPrank(player);

    // Before Solidity 0.4.22 the only way to define a constructor for a contract was to define a function with the same name of the contract itself
    // After that version they introduced a new `constructor` keyword to avoid this kind of mistake
    // In this case the developer made the mistake to misstype the name of the constructor
    // Contract name -> Fallout
    // Constructor name -> Fal1out
    // The result of this is that the contract was never initialized, the owner was the address(0)
    // and we were able to call the `Fal1out` function that at this point is not a constructor (callable only once)
    // but a "normal" function. This also mean that anyone can call multiple time this function switching the owner of the contract.
    level.Fal1out();

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Fallout.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Fallout.t.sol)

## Further reading

- [SWC-118 - Incorrect Constructor Name](https://swcregistry.io/docs/SWC-118)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
