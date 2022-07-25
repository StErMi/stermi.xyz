---
title: 'Ethernaut Challenge #9 Solution — King'
excerpt: This is Part 9 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>Our goal for this challenge is to **break** the smart contract to make it impossible for someone else to gain the kingship again in the future.
coverImage:
  url: '/assets/blog/ethernaut/king.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-15T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/king.svg'
---

This is Part 9 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #9: King

> The contract below represents a very simple game: whoever sends it an amount of ether that is larger than the current prize becomes the new king. On such an event, the overthrown king gets paid the new prize, making a bit of ether in the process! As ponzi as it gets xD
> Such a fun game. Your goal is to break it.
> When you submit the instance back to the level, the level is going to reclaim kingship. You will beat the level if you can avoid such a self proclamation.
>
> Level author: [Alejandro Santander](https://github.com/ajsantander)

Our goal for this challenge is to **break** the smart contract to make it impossible for someone else to gain the kingship again in the future.

## Study the contracts

**State variables**

- `address payable king` the address of the current king. When a new King will take the reign, the old king will receive the `msg.value` sent to the `receive` function
- `uint public prize;` the minimum value that you need to send to the contract if you want to become the new King
- `address payable public owner` the owner of the contract

**`constructor() public payable`**

```solidity
constructor() public payable {
  owner = msg.sender;
  king = msg.sender;
  prize = msg.value;
}
```

It just set up the contract's variables. The `owner` and current `king` is the `msg.sender` (deployer of the contract) and set the `prize` that the new user need to send if he/she want to become the new King

**`function _king() public view returns (address payable)`**

This function just return the current King

**`receive() external payable`**

This is the main function that interest us. As we already know the `receive` function is a **special** function that allow the contract to receive directly Ethers from external contract or EOA. Let's review its code:

```solidity
receive() external payable {
  require(msg.value >= prize || msg.sender == owner);
  king.transfer(msg.value);
  king = msg.sender;
  prize = msg.value;
}
```

The first thing that we see is `require(msg.value >= prize || msg.sender == owner)`.
This check allows the `owner` of the contract to always take the kingship of the contract, resetting all the values.

From a security standpoint, this is a huge concern in general because this function allows the `owner` to reset everything without repaying the current `king` and leaving funds stuck in the contract. Let's make an example

- Alice is the `owner` of the contract
- At some point we have Bob that send `1 ETH` to the contract and become the new King

Normally, if Simon wanted to become the new king would send `>= 1 ETH` to the contract and the previous `king` (Bob) would receive the `msg.value` sent along with the transaction.
But the `owner` can send **0 ETH**, become the new King and that `1 ETH` that Bob sent previously will never go back to him. The second problem is that `1 ETH` will always be stuck inside the contract!

But this is not the main problem that will let us exploit the contract and solve the challenge.

The problem is inside the `king.transfer(msg.value)` instruction. The `transfer` function allow a contract to transfer X amount of ETH from an `sender` to a receiver. Before explaining which is the problem, let's review all the possible way we have to do this operation.

Solidity give us three different methods to send an amount of ETH from an account to another

- `receiverAddress.transfer(amount)`: This function consumes `2300` gas and send `amount` of Ether from the caller to `receiverAddress`. The `transfer` function fails if the balance of the current contract is not large enough or if the Ether transfer is rejected by the receiving account. The `transfer` function reverts on failure.
- `receiverAddress.send(amount)`: This function consumes `2300` gas and send `amount` of Ether from the caller to `receiverAddress`. Send is the low-level counterpart of `transfer`. If the execution fails, the current contract will not stop with an exception, but `send` will return `false`.
- `(bool sent, bytes memory data) = receiverAddress.call{value: amount}("");`: this is the low-level function of the previous two that gives a lot of flexibility but introduce also numerous possible problems like **re-entrancy**. By default, `call` forward the whole gas if you don't specify it. If the call to the `receiverAddress` fails, `sent` will return `false`

So now we know that `transfer` allows you to send Ether to an address, consuming `2300` gas and **reverting** if it was not possible to perform the transaction.

Why is it a problem if the "transfer Ether to" transaction revert? Well, because if the `transfer` revert also our `receive` function **revert!**
And by reverting it will make the **Contract unusable**, no one can become the new King!

One possible solution is to just create a `Contract` that will not accept any kind of Ether transfer toward it. Let's see a code example in the solution section and how we could avoid to fall in this security problem.

## Solution code

First, we need to create and deploy a contract that does not accept Ether.

```solidity
contract Exploiter {
    constructor(address payable to) public payable {
        (bool success, ) = address(to).call{value: msg.value}("");
        require(success, "we are not the new king");
    }
}
```

The only purpose of this contract is to become the new King and stop accepting Ether. By not implementing any `payable` functions, `fallback` or `receive` no one can send to this contract Ether. Well, they can send it via a `selfdestroy` but this is not the case!

The rest of the code is pretty easy:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Create and deploy a contract that become the new King but will not accept any incoming Ether
    Exploiter exploiter = new Exploiter{value: level.prize() + 1}(payable(address(level)));

    // assert that we are the new king!
    assertEq(level._king(), address(exploiter));

    vm.stopPrank();
}
```

How could the `King` contract prevent this problem from happening?

Well, the first thing would be to adopt a **pull-over-push pattern** where you store the amount that the old king can withdraw and create a function that allows them to withdraw later.

You can read the full solution of the challenge opening [King.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/King.t.sol)

## Further reading

- [Solidity Docs: Sending and Receiving Ether](https://docs.soliditylang.org/en/v0.8.13/security-considerations.html#sending-and-receiving-ether)
- [Solidity Docs: Withdrawal from Contracts](https://docs.soliditylang.org/en/latest/common-patterns.html#withdrawal-from-contracts)
- [SWC-113: DoS with Failed Call](https://swcregistry.io/docs/SWC-113)
- [ConsenSys Smart Contract Best Practices: Don't use `transfer()` or `send()`](https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/#dont-use-transfer-or-send)
- [ConsenSys Smart Contract Best Practices: Favor _pull_ over _push_ for external calls](https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/#favor-pull-over-push-for-external-calls)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
