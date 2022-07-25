---
title: 'Ethernaut Challenge #7 Solution — Force'
excerpt: This is Part 7 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>Our only goal is to **find a way to send ETH** to the `Force` contract.
coverImage:
  url: '/assets/blog/ethernaut/force.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-12T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/force.svg'
---

This is Part 7 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #7: Force

> Some contracts will simply not take your money `¯\_(ツ)_/¯`
> The goal of this level is to make the balance of the contract greater than zero.
>
> Things that might help:
>
> - Fallback methods
> - Sometimes the best way to attack a contract is with another contract.
> - See the Help page above, section "Beyond the console"
>
> Level author: [Alejandro Santander](https://github.com/ajsantander)

Our only goal is to **find a way to send ETH** to the `Force` contract.

## Study the contracts

Well, the contract is pretty simple to study. It's **completely empty!** Take a look:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract Force {/*

                   MEOW ?
         /\_/\   /
    ____/ o o \
  /~____  =ø= /
 (______)__m_m)

*/}
```

To solve this challenge, we need to lean all the possible way for which a contract can receive ETH.

There are currently four different way to send Ether to a contract:

1. The contract implements at least a `payable` function, and we send some ether along with the function call.
2. The contract implements a `receive` function. See [Solidity Docs: Receive Ether Function](https://docs.soliditylang.org/en/latest/contracts.html?highlight=receive#receive-ether-function 'Permalink to this heading') for more information about this special function.
3. The contract implements a `payable` `fallback` function. See [Solidity Docs: Fallback Function](https://docs.soliditylang.org/en/latest/contracts.html?highlight=receive#fallback-function) for more information about this special function.
4. The last and more "strange" way that can and has created various security problem is via `selfdestruct()`
5. Bonus point: a contract without a `receive` Ether function can also receive Ether as a recipient of a *coinbase transaction* (aka *miner block reward*)

By looking at the contract, it's pretty obvious that the only we can solve the challenge is by using the `selfdestruct()` method. Before viewing the solution, let's review what does this function do.

What does the `selfdestruct` EVM opcode do? From the Solidity Docs section about [Deactivate and Self-destruct](https://docs.soliditylang.org/en/v0.8.15/introduction-to-smart-contracts.html?highlight=selfdestruct#deactivate-and-self-destruct) you will learn that

1. It's the only way to remove the code of your contract from the blockchain
2. The remaining Ether stored at the contract address is sent to a designated target recipient
3. The storage and code (after sending Ether) is removed from the state

There are two important notes to also remember:

> Even if a contract is removed by `selfdestruct`, it is still part of the history of the blockchain and probably retained by most Ethereum nodes. So using `selfdestruct` is not the same as deleting data from a hard disk.

> Even if a contract’s code does not contain a call to `selfdestruct`, it can still perform that operation using `delegatecall` or `callcode`.

Now that we know how it works, we can proceed with the solution. We need to create a custom Contract that will have the only purpose to receive Ether, call `selfdestruct` and send the Ether to the `Force` contract to solve the challenge!

## Solution code

The solution code is pretty straightforward at this point.
Here's the code of the custom Contract that we will deploy to send Ether to the `Force` contract:

```solidity
contract Exploiter {
    constructor(address payable to) public payable {
        // redirect all the `msg.value` to `to` when selfdestructing
        selfdestruct(to);
    }
}
```

And here's the code of the solution

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Deploy the custom contract and send them 1 wei in the process
    new Exploiter{value: 1}(payable(address((level))));

    // Assert that the level contract has received 1 wei
    assertEq(address(level).balance, 1);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Force.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Force.t.sol)

## Further reading

- [Solidity Docs: Receive Ether Function](https://docs.soliditylang.org/en/latest/contracts.html?highlight=receive#receive-ether-function 'Permalink to this heading')
- [Solidity Docs: Fallback Function](https://docs.soliditylang.org/en/latest/contracts.html?highlight=receive#fallback-function)
- [Solidity Docs: Deactivate and Self-destruct](https://docs.soliditylang.org/en/v0.8.15/introduction-to-smart-contracts.html?highlight=selfdestruct#deactivate-and-self-destruct)
- [Solidity Blog Post: Solidity 0.6.x features: fallback and receive functions](https://blog.soliditylang.org/2020/03/26/fallback-receive-split/)
- [SWC-132:Unexpected Ether balance](https://swcregistry.io/docs/SWC-132)
- [Consensys Best Practices: Forcibly Sending Ether](https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/force-feeding/)
- [Sigmaprime: Unexpected Ether](https://blog.sigmaprime.io/solidity-security.html#ether)
- [Gridlock (a smart contract bug)](https://medium.com/@nmcl/gridlock-a-smart-contract-bug-73b8310608a9)
- [Vitalik about selfdestruct](https://twitter.com/VitalikButerin/status/1489769962252091393)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
