---
title: 'Ethernaut Challenge #6 Solution — Delegation'
excerpt: This is Part 6 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>In this challenge, we don't need any token/ETH to solve it. Our only goal is to **claim ownership** of the `Delegation` contract.
coverImage:
  url: '/assets/blog/ethernaut/delegation.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-08T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/delegation.svg'
---

This is Part 6 of the ["Let's play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

# Challenge #6: Delegation

> The goal of this level is for you to claim ownership of the instance you are given.
> Things that might help:
>
> - Look into Solidity's documentation on the `delegatecall` low level function, how it works, how it can be used to delegate operations to on-chain libraries, and what implications it has on execution scope.
> - Fallback methods
> - Method ids
>
> Level author: [Alejandro Santander](https://github.com/ajsantander)

In this challenge, we don't need any token/ETH to solve it. Our only goal is to **claim ownership** of the `Delegation` contract.

The `DelegationFactory` deploy two contracts:

- `Delegate.sol`
- `Delegation.sol` the contract that we need to claim ownership of

## Study the contracts

### `Delegate.sol`

The delegate contract is really minimal.

It has a `address public owner` state variable, a `constructor(address _owner)` that set the initial value of the `owner` variable.

Then we have a strange function called `pwn` with this code

```solidity
function pwn() public {
    owner = msg.sender;
}
```

The callee of the function will become the owner of the contract. This alone is not significant for us because we don't need to gain ownership of this contract, but just keep it in mind for what's coming next.

### `Delegation.sol`

This is the contract we have direct access to. Let's take a look.
It has two state variables:

- `address public owner` a public variable to store the owner of the contract
- `Delegate delegate` a reference to the `Delegate` contract we just saw

The `constructor` of the contract take `address _delegateAddress` as the only input parameter, initialize the `delegate` state variable with it and initialize the owner with `msg.sender`.

Then we have the `fallback` function. Before reviewing its code, let's find out what a fallback function really is.

The `fallback` function it's a "special" function that each contract can have. You can only declare **one** `fallback` function for each contract. This is how the Solidity Docs describe it:

> The fallback function is executed on a call to the contract if none of the other functions match the given function signature, or if no data was supplied at all and there is no [receive Ether function](https://docs.soliditylang.org/en/latest/contracts.html#receive-ether-function). The fallback function always receives data, but in order to also receive Ether it must be marked `payable`.
>
> For the whole documentation read the [Solidity Docs for `fallback` function](https://docs.soliditylang.org/en/latest/contracts.html#fallback-function).

Basically, this function would be automatically called in two scenarios:

1. The contract receive some ether, but there is no `receive` function and there's a `fallback payable` function
2. The callee call a contract's function, but that function does not exist. In this case, the `fallback` function is called passing the original `calldata` to it.

We can now review its code:

```solidity
fallback() external {
    (bool result, ) = address(delegate).delegatecall(msg.data);
    if (result) {
        this;
    }
}
```

When it's called, it forwards the `msg.data` payload (the transaction `calldata`) via `delegatecall` to the `Delegate` contract.

It stores the success of the `delegatecall` into the `result` variable and keep going with the contract's code.

So at the end of the day, what it does it just forward the whole transaction data to the `Delegate` contract.

If someone tried to call `delegationContract.someFunction(1, 2, 3)` the fallback function would have forwarded that call to `delegateContract.someFunction(1, 2, 3)`.

But there's another important thing to remember! `delegatecall` is a **special** opcode that. Let's read it again from the Solidity Docs for delegatecall:

> The code at the target address is executed in the context (i.e. at the address) of the calling contract and `msg.sender` and `msg.value` do not change their values.
> This means that a contract can dynamically load code from a different address at runtime. Storage, current address and balance still refer to the calling contract, only the code is taken from the called address.

This mean that it's true that `Delegation.someFunction` implementation will be executed, but it will be executed with the `Delegate` contract context. This mean that that implementation will use the original `msg.sender`, `msg.value` and `Delegate`'s storage!

What does it mean? This mean that, if for example, we execute the `pwn()` function of `Delegation` contract that update the `owner` variable that is stored in `slot0` of the contract it **will not** update the `Delegate`'s storage `slot0` but it will update **the `Delegation`'s storage slot0**!

`delegatecall` is powerful but if not used correctly could result in this kind of security problems!

Now that we have all the pieces, and we understood how `fallback` function and `delegatecall` works, let's solve the challenge.

## Solution code

The solution code is pretty straightforward at this point

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // trigger the level's fallback function to solve the challenge
    (bool success, ) = address(level).call(abi.encodeWithSignature("pwn()"));

    // Check that the `call` did not revert
    require(success, "call not successful");

    // Check that the player is the new owner of the level
    assertEq(level.owner(), player);

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [Delegation.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Delegation.t.sol)

## Further reading

- [Solidity Docs: fallback function](https://docs.soliditylang.org/en/latest/contracts.html#fallback-function)
- [solidity-by-example: fallback function](https://solidity-by-example.org/fallback)
- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [SWC-112: Delegatecall to Untrusted Callee](https://swcregistry.io/docs/SWC-112)
- [Sigma Prime, Solidity Security: Comprehensive list of known attack vectors and common anti-patterns: delegatecall](https://blog.sigmaprime.io/solidity-security.html#delegatecall)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
