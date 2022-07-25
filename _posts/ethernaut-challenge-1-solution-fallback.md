---
title: 'Ethernaut Challenge #1 Solution — Fallback'
excerpt: 'This is Part 1 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>

The goal of this challenge is to claim ownership of the `Fallback` contract and reduce its balance to 0.
'
coverImage: 
  url: '/assets/blog/ethernaut/fallback.svg'
  credit: 
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-06-30T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/fallback.svg'
---

This is Part 1 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #1: Fallback

> Look carefully at the contract's code below.
>
> You will beat this level if
>
> 1.  you claim ownership of the contract
> 2.  you reduce its balance to 0
>     Things that might help
>
> - How to send ether when interacting with an ABI
> - How to send ether outside of the ABI
> - Converting to and from wei/ether units (see help() command)
> - Fallback methods
>
> Level author(s): [Alejandro Santander](https://github.com/ajsantander)

The goal of this challenge is to claim ownership of the `Fallback` contract and reduce its balance to 0.

## Study the contracts

First thing that we notice, the Solidity compiler version used is `< 0.8.x`. This mean that the contract would be prone to math underflow and overflow bugs.

This contract is importing and using OpenZeppelin [SafeMath](https://docs.openzeppelin.com/contracts/4.x/api/utils#SafeMath) library, but they are not using it. There is still no way to exploit it by overflow, at least in this specific case.

The only way to drain the contract is via the `withdraw` function that can be called only if the `msg.sender` equal to the value of the variable `owner` (see the `onlyOwner` function modifier). This function will transfer to the `owner` address, **all** the funds in the contract.

Let's look at the code:

```solidity
function withdraw() public onlyOwner {
    owner.transfer(address(this).balance);
}
```

So if we find a way to change the `owner` value to our address, we will be able to drain all the ether from the contract.

There are actually two places in the contract where the `owner` variable is updated with `msg.sender`

1. The `contribute` function
2. The `receive` function

### The `contribute` function

```solidity
function contribute() public payable {
    require(msg.value < 0.001 ether);
    contributions[msg.sender] += msg.value;
    if (contributions[msg.sender] > contributions[owner]) {
        owner = msg.sender;
    }
}
```

This function allows the `msg.sender` to send `wei` to the contract. Those `wei` will be added to the user's balance, tracked by the `contributions` mapping variable.

If the total contribution made by the user is greater than the one made by the actual owner (`contributions[msg.sender] > contributions[owner]`) the `msg.sender` will become the new owner.

The problem is that the contribution made by the owner is equal to `1000 ETH`. It's not written anywhere in the description of the challenge, but we can think that our user will start with a limited amount of ETH, an amount that does not allow us to contribute more than the `owner`. So, we need to find another way.

### The `receive` function

This is a "special" function that is called "automatically" when someone sends some ether to a contract without specifying anything in the "data" field of the transaction.

Quoting from the official [Solidity blog post](https://blog.soliditylang.org/2020/03/26/fallback-receive-split/) when the function has been introduced:

> A contract can now have only one `receive` function, declared with the syntax: `receive() external payable {…}` (without the `function` keyword).
> It executes on calls to the contract with no data (`calldata`), e.g. calls made via `send()` or `transfer()`.
> The function cannot have arguments, cannot return anything and must have `external` visibility and `payable` state mutability.

Here's the code:

```solidity
receive() external payable {
    require(msg.value > 0 && contributions[msg.sender] > 0);
    owner = msg.sender;
}
```

In the `receive` function, the `owner` is updated with `msg.sender` only if the amount of `wei` sent with the transaction is `> 0` and our contribution in `contributions[msg.sender]` is `> 0`

At this point, we have all the pieces to build the puzzle and win the challenge. Let's see the solution!

## Solution code

Here's what we need to do:

1. Contribute to the contract with at max `0.001 ether` (to pass the `require` check) calling the `contribute` function so the `contributions[msg.sender]` will be greater than zero
2. Send `1 wei` directly to the contract to trigger the `receive` function and become the new `owner`
3. Call `withdraw` and bring home all the `ETH` stored in the contract!

And here's the Solidity code:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player);

    // send the minimum amount to become a contributor
    level.contribute{value: 0.0001 ether}();

    // send directly to the contract 1 wei, this will allow us to become the new owner
    (bool sent, ) = address(level).call{value: 1}("");
    require(sent, "Failed to send Ether to the level");

    // now that we are the owner of the contract withdraw all the funds
    level.withdraw();

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Fallback.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Fallback.t.sol)

## Further reading

- OpenZeppelin [SafeMath library](https://docs.openzeppelin.com/contracts/4.x/api/utils#SafeMath) (**only needed with `Solidity < 0.8`**)
- The `receive` function [Solidity blog post](https://blog.soliditylang.org/2020/03/26/fallback-receive-split/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
