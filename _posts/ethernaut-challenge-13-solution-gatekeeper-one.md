---
title: 'Ethernaut Challenge #13 Solution — Gatekeeper One'
excerpt: This is Part 12 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>To solve this challenge we need to open three diffent "gates", each one with a different requirement. Bear with me because they are pretty tough.
coverImage:
  url: '/assets/blog/ethernaut/gatekeeper-one.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-07-25T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/gatekeeper-one.svg'
---

This is Part 13 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #13: Gatekeeper One

> Make it past the gatekeeper and register as an entrant to pass this level.
>
> Things that might help:
>
> - Remember what you've learned from the Telephone and Token levels.
> - You can learn more about the special function `gasleft()`, in Solidity's documentation (see [here](https://docs.soliditylang.org/en/v0.8.3/units-and-global-variables.html) and [here](https://docs.soliditylang.org/en/v0.8.3/control-structures.html#external-function-calls)).
>
> Level author(s): [0age](https://github.com/0age)

To solve this challenge we need to open three diffent "gates", each one with a different requirement. Bear with me because they are pretty tough.

## Study the contracts

The contract per se is pretty short

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract GatekeeperOne {
    using SafeMath for uint256;
    address public entrant;

    modifier gateOne() {
        require(msg.sender != tx.origin);
        _;
    }

    modifier gateTwo() {
        require(gasleft().mod(8191) == 0);
        _;
    }

    modifier gateThree(bytes8 _gateKey) {
        require(uint32(uint64(_gateKey)) == uint16(uint64(_gateKey)), "GatekeeperOne: invalid gateThree part one");
        require(uint32(uint64(_gateKey)) != uint64(_gateKey), "GatekeeperOne: invalid gateThree part two");
        require(uint32(uint64(_gateKey)) == uint16(tx.origin), "GatekeeperOne: invalid gateThree part three");
        _;
    }

    function enter(bytes8 _gateKey) public gateOne gateTwo gateThree(_gateKey) returns (bool) {
        entrant = tx.origin;
        return true;
    }
}
```

As you can see we need to solve three different little puzzle inside those three function modifier otherwise the contract will revert.

Let's split the explanation in three different parts

### Gate 1: `msg.sender` and `tx.origin`

To open this gate we need to understand what `msg.sender` and `tx.origin` are and which are the difference between them.

Let's see what Solidity Docs say about those [Global Variables](https://docs.soliditylang.org/en/latest/cheatsheet.html?#global-variables):

- `msg.sender` (`address`): sender of the message (current call)
- `tx.origin` (`address`): sender of the transaction (full call chain)

When the transaction is made by an EOA and it directly interact with a smart contract those variables will have the same value.
But if if interact with a middle-man contract `A` that then interact with another contract `B` via a direct call (not a `delegatecall`) those values will be different.

In this case:

- `msg.sender` will have the EOA address
- `tx.origin` will have the address of the `A` contract

Because for `gateOne` to not revert we need to have `msg.sender != tx.origin` this mean that we need to call `enter` from a smart contract and not directly from the player's EOA.

It's not part of the challenge but I suggest you to read what I have listed in Further Reading about some security concerns and best practice about `tx.orgin` and when you **shouldn't** use it.

### Gate 2: `gasleft()`

From the Solidity Docs about [Global Variables](https://docs.soliditylang.org/en/latest/cheatsheet.html?#global-variables) we know that `gasleft() returns (uint256)` is a function that returns the **remaining gas** left for the transaction.

It's important to know that each Solidity instruction is in reality an highlevel representation of a series of lowlevel EVM Opcodes. After executing the `GAS` opcode (read more on [EVM codes documentation site](https://www.evm.codes/#5a)) the returned value is the amount gas left **after** executing also the `GAS` opcode that costs at the moment **2 gas**.

Things get overcomplicated here because in order to pass the `gateTwo` checks you have to call `level.enter{gas: exactAmountOfGas}(gateKey)` with a very specific amount of gas that will make `gasleft().mod(8191)` return `0` (the gas left must be a multiple of 8191).

![](https://media.giphy.com/media/DHqth0hVQoIzS/giphy.gif)

You can't guess the number because you would need to translate all the Solidity code in EVM opcodes, calculate the gas consumed by each of them and waste ton of times (unless your goal is also to master EVM, but for this topic there are tons of other resources like [Let’s play EVM Puzzles — learning Ethereum EVM while playing!](https://stermi.medium.com/lets-play-evm-puzzles-learning-ethereum-evm-while-playing-43a8354a02b3)). You also need to remember that gas cost could differ depending on which Solidity compiler version has been used to compile the code into bytecode and which compile flags has been used during this process. It's a mess.

What can we do? Well, we can go and with the easy way and **brute force it!**
Following [cmichel](https://cmichel.io/ethernaut-solutions/) suggestion we can leverage the fact that we are using a local test envionment (or a forked one).

We know that the gas used by the `enter` transaction must be at least 8191 plus all the gas spent to execute those opcodes. We can make a range guess and brute force it until it works. This is the code example:

```solidity
for (uint256 i = 0; i <= 8191; i++) {
    try victim.enter{gas: 800000 + i}(gateKey) {
        console.log("passed with gas ->", 800000 + i);
        break;
    } catch {}
}
```

You start with a base gas value just to be sure that the transaction will not revert because of Out of Gas exeception and you try to find which value of gas will make the transaction succed.

In our case (solidity compiler + optimization flags) the correct gas value is: **802929**

### Gate 3: how casting works in Solidity

To solve the final gate we need first to understand how casting from a type to a different type and downcasting works. The Solidity documentations explain it very well:

- [Solidity Docs: Conversions between Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-elementary-types)
- [Solidity Docs: Conversions between Literals and Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-literals-and-elementary-types)

When you cast from a smaller type to a bigger one there's no problem. All the high order bits are filled with zero and the value does not change. The problem is when you cast a bigger type to smaller one. Depending on the value you could encounter in data loss because those high order bits are lost and truncated. For example `uint16(0x0101)` is `257` in decimal but if you down cast it to `uint8` it will be `1` in decimal!

At this point we need to find one `_gateKey` value that satisfies at the same time all these requirements:

```solidity
require(uint32(uint64(_gateKey)) == uint16(uint64(_gateKey)), "GatekeeperOne: invalid gateThree part one");
require(uint32(uint64(_gateKey)) != uint64(_gateKey), "GatekeeperOne: invalid gateThree part two");
require(uint32(uint64(_gateKey)) == uint16(tx.origin), "GatekeeperOne: invalid gateThree part three");
```

In solidity you can solve this challenge applying a "mask" to the input with the `AND` operator.
This operator will put the input binary value in the output position if the mask has a `1` (binary) and a `0` (doesn't metter what we have as input) if in the mask there's a `0`.

If you need a well made exaplantion of this solution you can look at [0xSage solution](https://medium.com/coinmonks/ethernaut-lvl-13-gatekeeper-1-walkthrough-how-to-calculate-smart-contract-gas-consumption-and-eb4b042d3009).

Let's start with the first requirement: `uint32(uint64(_gateKey)) == uint16(uint64(_gateKey))`.
The less important `2 bytes` must equal the less important `4 bytes`. This means that we want to "remove" the 2 more important bytes of those 4 bytes but maintain the value of the less important one. Because what we want is to make `0x11111111` be equal to `0x00001111` the mask to accomplish this is equal to `0x0000FFFF`.

The second requirement say that the less important `8 bytes` of the input must be different compared to the less important `4 bytes`. We need to remember that we also need to maintain the first requirement. We need to make `0x00000000001111 != 0xXXXXXXXX00001111`
To achieve that we need to update our mask to make all the first 4 bytes "pass" to the output
Our new mask will be `0xFFFFFFFF0000FFFF`

Now we just need to apply that mask to our `tx.origin` casted to a `bytes8` (an address is a 20 bytes type).

The key to solve this third gate will be equal to `bytes8(uint64(uint160(address(player)))) & 0xFFFFFFFF0000FFFF`.

## Solution code

In order to solve the challenge we need to first deploy "middle" contract. By doing so `tx.origin` will have a different value compared to `msg.sender` and the first gate check will pass.

```solidity
contract Exploiter is Test {
    GatekeeperOne private victim;
    address private owner;

    constructor(GatekeeperOne _victim) public {
        victim = _victim;
        owner = msg.sender;
    }

    function exploit(bytes8 gateKey) external {
        victim.enter{gas: 802929}(gateKey);
    }
}
```

Now we can call the test function and solve it

```solidity
function exploitLevel() internal override {
	// calculate the key needed to solve the third gate
    bytes8 key = bytes8(uint64(uint160(address(player)))) & 0xFFFFFFFF0000FFFF;

    // deploy the middle man contract to make `msg.sender != tx.origin`
    Exploiter exploiter = new Exploiter(level);

    vm.prank(player, player);

    // call the exploit function to solve the challenge
    exploiter.exploit(key);

    // Check we have solved the challenge
    assertEq(level.entrant(), player);
}
```

You can read the full solution of the challenge opening [GatekeeperOne.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/GatekeeperOne.t.sol)

## Further reading

- [Solidity Docs: tx.origin and msg.sender, gasleft() as Global Variables](https://docs.soliditylang.org/en/latest/cheatsheet.html?#global-variables)
- [Solidity Docs: never use tx.origin for authorization](https://docs.soliditylang.org/en/latest/security-considerations.html#tx-origin)
- [Consensys Ethereum Smart Contract Best Practices - Avoid using tx.origin](https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/tx-origin/)
- [SigmaPrime - tx.origin](https://github.com/sigp/solidity-security-blog#tx-origin)
- [Solidity Docs: Conversions between Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-elementary-types)
- [Solidity Docs: Conversions between Literals and Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-literals-and-elementary-types)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
