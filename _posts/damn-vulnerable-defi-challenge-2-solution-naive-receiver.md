---
title: 'Damn Vulnerable DeFi Challenge #2 Solution — Naive receiver'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>Our end goal here is to attack the user contract and drain all their funds. Draining doesn’t mean necessarily stealing those funds, it could simply mean, like in this case, to move user’s funds from their contract without their will.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2022-04-04T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

[Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.

Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #2  —  Naive receiver

> There’s a lending pool offering quite expensive flash loans of Ether, which has 1000 ETH in balance.  
> You also see that a user has deployed a contract with 10 ETH in balance, capable of interacting with the lending pool and receiveing flash loans of ETH.  
> Drain all ETH funds from the user’s contract. Doing it in a single transaction is a big plus ;)

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/naive-receiver)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/naive-receiver/naive-receiver.challenge.js)

### The attacker end goal

Our end goal here is to attack the user contract and drain all their funds. Draining doesn’t mean necessarily stealing those funds, it could simply mean, like in this case, to move user’s funds from their contract without their will.

### Study the contracts

### `NaiveReceiverLenderPool`

The contract is a lending pool that allows flash loans with a fixed fee of 1 ether (as the comment says, it’s not so cheap!).

What does it mean? That after doing a flash loan we must repay our debt plus 1 ether.

Let’s look at the `flashLoan` function that takes two parameters:

- `borrower` that is the smart contract address that will receive the borrow
- `borrowAmount` the amount of ether that will be sent to the `borrower` contract

The function will:

- Check that the balance of the contract is greater than the requested borrowed amount
- That the borrower is a contract and not an EOA. This is needed because the lending pool is going to send the borrow amount calling a specific callback that must be implemented by the contract.
- Call `receiveEther` on the borrower with the fee amount as the parameter. The amount is sent with the receiveEther callback using `functionCallWithValue` utility function from OpenZeppelin’s Address library.
- After the flashloan is executed, the contract s checking that the new updated balance of the contract is greater or equal to the balance before the flashloan plus the 1 ether fee.

The contract seems fine.

### `FlashLoanReceiver`

This is the user’s contract that interact with the lending pool that offer the flash loan. The main function to look for is receiveEther that is the callback function called by the lending pool when the user’s request for a flash loan.

### `receiveEther`

Has a single parameter called `fee` that is the amount of fee that the user needs to repay the lending pool for the flash loan.

The function has some security/validation checks:

- That the `msg.sender` is indeed the lending pool address the user expect to call the callback
- That the contract has enough balance to repay both the loan and the loan’s fee
- After checking that it will execute the internal logic that will benefit from the loan calling `_executeActionDuringFlashLoan` and will repay the loan sending back the borrowed amount plus fee

Do you see where the problem is? While the contract’s is correctly checking that the function can be called only by the lending pool, it is not checking that the flash loan has been requested by the owner of the contract.

This mean that everyone could call the lending pool saying that the user’s contract wants to execute a flash loan. **By doing that, anyone will be able to make the user’s contract pay the flash loan fee!**

## Solution code

At this point, the solution is pretty easy. The user’s contract has 10 ethers, the flash loan fee is 1 ether, so we just need to call the 10 times in the same transaction to drain all the user’s funds from the contract.

Here are two possible

```solidity
// Easy solution

vm.startPrank(attacker);
for( uint256 i = 0; i < 10; i++ ) {
    pool.flashLoan(address(receiver), 0);
}
vm.stopPrank();

// General purpose solution

vm.startPrank(attacker);
uint256 flashFee = pool.fixedFee();
while( true ) {
    uint256 flashAmount = address(receiver).balance - flashFee;
    pool.flashLoan(address(receiver), flashAmount);

    // we have consumed all the ETH from the poor receiver :(
    if( address(receiver).balance == 0 ) break;
}
vm.stopPrank();
```

You can find the full solution on GitHub, looking at [NaiveReceiver.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/naivereceiver/NaiveReceiver.t.sol)

If you want to try yourself locally, just execute `forge test — match-contract NaiveReceiverTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
