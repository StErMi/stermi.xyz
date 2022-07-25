---
title: 'Ethernaut Challenge #5 Solution — Token'
excerpt: 'This is Part 5 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>

For this challenge, our end goal is to be able to claim the ownership of the contract.
'
coverImage: '/assets/blog/ethernaut/token.svg'
date: '2020-07-07T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/token.svg'
---

This is Part 5 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #5: Token

> The goal of this level is for you to hack the basic token contract below.
> You are given 20 tokens to start with and you will beat the level if you somehow manage to get your hands on any additional tokens. Preferably a very large amount of tokens.
>
> Level author: [Alejandro Santander](https://github.com/ajsantander)

We start with a balance of 20 Token and to solve the challenge we need to gain at least 1 more token, but we will try to gain much, much more ;)

## Study the contracts

The `Token` contract is a simplified and stripped down version of an ERC20 Token.
The contract has these state variables:

- `mapping(address => uint256) balances` to map user balances
- `uint256 public totalSupply;` to track the total supply. The total supply could have been declared as `immutable` because is only initialized in the contract, and it is never updated.

Then we have the constructor method `constructor(uint256 _initialSupply) public` where the creator of the contract mint `_initialSupply` token updating the `totalSupply` and his/her balance to that value

We see two other function

- `function balanceOf(address _owner) public view returns (uint256 balance)` that simply returns the balance of the specified `_owner` address
- `function transfer(address _to, uint256 _value) public returns (bool)` that should transfer `_value` of tokens from the `msg.sender` to the `_to` address.

Well, as you might think, probably the problem of this contract will be in that specific function. Let's review its code:

```solidity
function transfer(address _to, uint256 _value) public returns (bool) {
    require(balances[msg.sender] - _value >= 0);
    balances[msg.sender] -= _value;
    balances[_to] += _value;
    return true;
}
```

Everything seems fine, right?

- check if the sender has enough balance to make the transfer
- update the sender balance
- update the receiver balance
- return true

Have you spotted the problem? I have already highlighted it in the previous blog post and in this one I just waited to arrive at this point to tell you about it!

The contract uses **Solidity 0.6.0**, but it is not using a library like **SafeMath** to handle under/overflow!

Let's make an example on how underflow work:

- Alice has a balance of `balances[alice] == 20`
- Alice call `transfer(Bob, 21)`
- The check `balances[msg.sender] - _value` done by `require` inside `transfer` will result in an underflow. The result of the operation is `uint256(-1)` that is equal to `(2**256) – 1`. Usually with Solidity >0.8 or with SafeMath that operation would result in a revert
- Because of the underflow, even if Alice does not own `21` tokens, they pass the check and the smart contract proceed with the balance update
- `balances[alice] = 20 - 21 = (2**256) – 1`
- `balances[bob] += 21`

**Side note:** as we said, the `transfer` method suffer from the under/overflow problem. This mean that an attacker could also break the balance of a user completely, resetting it!

If `bob` has `balances[bob] = (2**256) – 1` (equal to the max `uint256` value), `Alice` could make just a `transfer(bob, 1)` and the new `balances[bob]` would be **0**.

## Solution code

The solution is pretty straightforward:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // our balance is of 20 tokens
    // because the contract suffer of underflow this operation
    // will make our new balance equal to the max `uint256` value!
    level.transfer(address(levelFactory), 21);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Token.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Token.t.sol)

## Further reading

- [SWC-101: Integer Overflow and Underflow](https://swcregistry.io/docs/SWC-101)
- [Consensys Ethereum Smart Contract Best Practices: Insecure Arithmetic](https://consensys.github.io/smart-contract-best-practices/attacks/insecure-arithmetic/)
- [Solidity v0.8.0 Breaking Changes: Arithmetic operations revert to underflow and overflow](https://docs.soliditylang.org/en/v0.8.13/080-breaking-changes.html)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
