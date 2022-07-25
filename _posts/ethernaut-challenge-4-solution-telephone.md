---
title: 'Ethernaut Challenge #4 Solution —  Telephone'
excerpt: 'This is Part 4 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>

For this challenge, our end goal is to be able to claim the ownership of the contract.
'
coverImage: 
  url: '/assets/blog/ethernaut/telephone.svg'
  credit: 
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-05T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/telephone.svg'
---

This is Part 4 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #4: Telephone

> Claim ownership of the contract below to complete this level.
>
> Level author: [Kyle Riley](https://github.com/syncikin)

For this challenge, our end goal is to be able to claim the ownership of the contract.

## Study the contracts

The `Telephone` contract is pretty small, so it will be fast to read and understand how to solve the challenge.

The `owner` state variable is initialized in the `constructor`. The only function that will update the `owner` is `changeOwner` :

`function changeOwner(address _owner) public`

It is a public function that take only one parameter `address _owner`.
If the `tx.origin` value is different from `msg.sender` it will update the `owner` with the function input parameter `_owner`.

To solve this challenge, we need to understand what are `msg.sender` and `tx.origin`.

If we look at the [Block and Transaction Properties](https://docs.soliditylang.org/en/v0.8.15/units-and-global-variables.html?highlight=tx.origin#block-and-transaction-properties) documentation page from the Solidity official doc, we find this definition:

- `tx.origin` (`address`): sender of the transaction (full call chain)
- `msg.sender` (`address`): sender of the message (current call)

Both `tx.origin` and `msg.sender` are "_special variables_" which always exist in the global namespace and are mainly used to provide information about the blockchain or are general-use utility functions.

But we need to pay attention to this:

- The values of all members of `msg`, including `msg.sender` and `msg.value` can change for every **external** function call. This includes calls to library functions.
- `tx.origin` will return the address that have sent (in origin) the transaction, while `msg.sender` will return the value that have originated the `external` call.

What does this mean?

Let's make an example and see the different values for both of them

**Scenario A**: Alice (EOA) call directly `Telephone.changeOwner(Bob)`

- `tx.origin`: Alice address
- `msg.sender`: Alice address

**Scenario B:** Alice (EOA) call a smart contract `Forwarder.forwardChangeOwnerRequest(Bob)` that will call `Telephone.changeOwner(Bob)`

Inside `Forwarder.forwardChangeOwnerRequest`

- `tx.origin`: Alice address
- `msg.sender`: Alice address

Inside `Telephone.changeOwner(Bob)`

- `tx.origin`: Alice address
- `msg.sender`: Forwarder (contract) address

This happens because while `tx.origin` will **always** return the address that have created the transaction, `msg.sender` will return the address who made the last external call.

## Solution code

We just need to create a contract that will be in the middle of the call to the `Telephone` contract.

```solidity
contract Exploiter {
    function exploit(Telephone level) public {
        level.changeOwner(msg.sender);
    }
}
```

And in our solution code, just deploy it and call it

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    Exploiter exploiter = new Exploiter();

    vm.stopPrank();
}
```

If you have paid attention to our previous blog post, you already saw the `startPrank` cheat code. `startPrank` has another overloaded version

```solidity
// Sets all subsequent calls' msg.sender to be the input address until `stopPrank` is called
function startPrank(address) external;

// Sets all subsequent calls' msg.sender to be the input address until `stopPrank` is called, and the tx.origin to be the second input
function startPrank(address, address) external;
```

In this case, we are using the second one because we need to also override the initial `tx.orgin` that otherwise would be `address(this)`: the address of the **test contract** itself!

You can read the full solution of the challenge opening [Telephone.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Telephone.t.sol)

## Further reading

- [Block and Transaction Properties](https://docs.soliditylang.org/en/v0.8.15/units-and-global-variables.html?highlight=tx.origin#block-and-transaction-properties)
- [SWC-115: Authorization through tx.origin](https://swcregistry.io/docs/SWC-115)
- [Security Consideration about `tx.origin` ](https://docs.soliditylang.org/en/v0.8.15/security-considerations.html?highlight=tx.origin#tx-origin) from Solidity docs
- [Consensys Ethereum Smart Contract Best Practices: tx.origin](https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/tx-origin/)
- [Vitalik Buterin: Do NOT assume that tx.origin will continue to be usable or meaningful](https://ethereum.stackexchange.com/questions/196/how-do-i-make-my-dapp-serenity-proof/200#200)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
