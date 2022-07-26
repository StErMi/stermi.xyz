---
title: 'Ethernaut Challenge #14 Solution — Gatekeeper Two'
excerpt: This is Part 14 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>Similar to Gatekeeper One to solve this challenge we need to open three diffent "gates", each one with a different requirement. Bear with me because they are pretty tough.
coverImage:
  url: '/assets/blog/ethernaut/gatekeeper-two.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2020-07-26T07:53:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/gatekeeper-two.svg'
---

This is Part 14 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #14: Gatekeeper Two

> This gatekeeper introduces a few new challenges. Register as an entrant to pass this level.
>
> Things that might help:
>
> - Remember what you've learned from getting past the first gatekeeper - the first gate is the same.
> - The `assembly` keyword in the second gate allows a contract to access functionality that is not native to vanilla Solidity. See [here](http://solidity.readthedocs.io/en/v0.4.23/assembly.html) for more information. The `extcodesize` call in this gate will get the size of a contract's code at a given address - you can learn more about how and when this is set in section 7 of the [yellow paper](https://ethereum.github.io/yellowpaper/paper.pdf).
> - The `^` character in the third gate is a bitwise operation (XOR), and is used here to apply another common bitwise operation (see [here](http://solidity.readthedocs.io/en/v0.4.23/miscellaneous.html#cheatsheet)). The Coin Flip level is also a good place to start when approaching this challenge.
>
> Level author(s): [0age](https://github.com/0age)

Similar to [Gatekeeper One](https://stermi.xyz/blog/ethernaut-challenge-13-solution-gatekeeper-one) to solve this challenge we need to open three different "gates", each one with a different requirement. Bear with me because they are pretty tough.

## Study the contracts

Let's see the contract's code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract GatekeeperTwo {
    address public entrant;

    modifier gateOne() {
        require(msg.sender != tx.origin);
        _;
    }

    modifier gateTwo() {
        uint256 x;
        assembly {
            x := extcodesize(caller())
        }
        require(x == 0);
        _;
    }

    modifier gateThree(bytes8 _gateKey) {
        require(uint64(bytes8(keccak256(abi.encodePacked(msg.sender)))) ^ uint64(_gateKey) == uint64(0) - 1);
        _;
    }

    function enter(bytes8 _gateKey) public gateOne gateTwo gateThree(_gateKey) returns (bool) {
        entrant = tx.origin;
        return true;
    }
}

```

To solve the challenge, we need to unlock three different gates. Let's split the explanation to solve each gate separately.

### Gate 1: `msg.sender` and `tx.origin`

To open this gate, we have to understand what `msg.sender` and `tx.origin` are and which are the difference between them.

Let's see what Solidity Docs say about those [Global Variables](https://docs.soliditylang.org/en/latest/cheatsheet.html?#global-variables):

- `msg.sender` (`address`): sender of the message (current call)
- `tx.origin` (`address`): sender of the transaction (full call chain)

When the transaction is made by an EOA, and it directly interacts with a smart contract, those variables will have the same value.
But if it interacts with a middle-man contract `A` that then interact with another contract `B` via a direct call (not a `delegatecall`) those values will be different.

In this case:

- `msg.sender` will have the EOA address
- `tx.origin` will have the address of the `A` contract

Because for `gateOne` to not revert, we need to have `msg.sender != tx.origin` this mean that we have to call `enter` from a smart contract and not directly from the player's EOA.

It's not part of the challenge, but I suggest you to read what I have listed in Further Reading about some security concerns and best practice about `tx.orgin` and when you **shouldn't** use it.

### Gate 2: The mystery behind `extcodesize`

The second gate it's the perfect opportunity to learn more on how contracts are deployed and the lifecycle of a contract during the deployment process.

Let's see the code of the function:

```solidity
modifier gateTwo() {
    uint256 x;
    assembly {
        x := extcodesize(caller())
    }
    require(x == 0);
    _;
}
```

If this is the first time you see the `assembly` **keyword**, don't be afraid. This is how Solidity allow you to write code in a lower-level language called `Yul`. This is not the place to discuss this topic, but if you want to learn more, there are tons of content about Yul on the [Solidity Documentation site](https://docs.soliditylang.org/en/latest/yul.html).

Let's see what both of those opcodes do when executed:

- The [CALLER](https://www.evm.codes/#33) opcode returns the 20-byte address of the caller account. This is the account that did the last call (except [delegate call](https://www.evm.codes/#F4)).
- The [EXCODESIZE](https://www.evm.codes/#3b) opcode do when executed returns the code size in bytes of the address that is passed as parameter.

This gate required that the `code` size of the `caller` must be `0`.

If the `caller` was an EOA (Externally Owned Account) that would always return zero, but this cannot be the case because as we said the caller (`msg.sender`) must be a Smart Contract because of the first gate requirement.

How can a Smart Contract have zero code? Well, there's a special case when this is true.
A smart contract has two different byte codes when compiled.

- The **creation bytecode** is the bytecode needed by Ethereum to create the contract and execute the constructor only once
- The **runtime bytecode** is the real code of the contract, the one stored in the blockchain and that will be used to execute your smart contract functions

When the constructor is executed initializing the contract storage, it returns the runtime bytecode. Until the very end of the constructor the contract itself does not have any runtime bytecode, this mean that if you call `address(contract).code.length` it would return **0**!

If you want to read more about this at EVM level, you can have a deep dive into the OpenZeppelin blog post [Deconstructing a Solidity Contract — Part II: Creation vs. Runtime](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-ii-creation-vs-runtime-6b9d60ecb44c/)

For this reason, to pass the second gate, we just need to call `enter` from the `Exploiter` smart contract `constructor`!

### Gate 3: Casting, down casting and bit wise operations

The last gate is another gate that blow your minds. Are you ready?

We are talking again about converting between types and bit wise operations

Let's look at the requirement `uint64(bytes8(keccak256(abi.encodePacked(msg.sender)))) ^ uint64(_gateKey) == uint64(0) - 1`

The contract is compiled with a Solidity version before **0.8.x**, so it will not revert when it will perform the math operation `uint64(0) - 1`. This operation is an "old way" to express "give me the max number that a `uint64` can fit". You could express the same thing by doing `type(uint64).max`.

The `bytes8(keccak256(abi.encodePacked(msg.sender)))` part is taking the less important `8 bytes` from the `msg.sender` (that is the `Exploiter` contract in this case) and casting them to a `uint64`

The instruction `a ^ b` is the bit wise `XOR` operation. The `XOR` operation works like this: if the bit in the position are equal it will result in a `0` otherwise in a `1`. To make `a ^ b = type(uint64).max` (so all `1`) `b` must be the inverse of `a`.

This means that our `gateKey` must be the inverse of `bytes8(keccak256(abi.encodePacked(msg.sender)))`

In solidity, there's no "inverse" operation, but we can recreate it by doing the `XOR` between an input and a value with only `F`s inside of it.

This mean that we can calculate the correct `gateKey` by executing `bytes8(keccak256(abi.encodePacked(address(this)))) ^ 0xFFFFFFFFFFFFFFFF`

## Solution code

To solve the challenge, we need to first deploy "middle" contract. By doing so, `tx.origin` will have a different value compared to `msg.sender` and the first gate check will pass.

```solidity
contract Exploiter {
    address private owner;

    constructor(GatekeeperTwo victim) public {
        owner = msg.sender;

        bytes8 contractByte8 = bytes8(keccak256(abi.encodePacked(address(this))));
        bytes8 gateKey = contractByte8 ^ 0xFFFFFFFFFFFFFFFF;

        victim.enter(gateKey);
    }
}
```

Now we can call the test function and solve it

```solidity
function exploitLevel() internal override {
    vm.prank(player, player);

    // Deploy the middle contract that automatically call the `level` contract
    // Inside the `constructor`
    new Exploiter(level);

    // Assert that we have solved the challenge
    assertEq(level.entrant(), player);
}
```

You can read the full solution of the challenge opening [GatekeeperTwo.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/GatekeeperTwo.t.sol)

## Further reading

- [Solidity Docs: tx.origin and msg.sender, gasleft() as Global Variables](https://docs.soliditylang.org/en/latest/cheatsheet.html?#global-variables)
- [Solidity Docs: never use tx.origin for authorization](https://docs.soliditylang.org/en/latest/security-considerations.html#tx-origin)
- [Consensys Ethereum Smart Contract Best Practices - Avoid using tx.origin](https://consensys.github.io/smart-contract-best-practices/development-recommendations/solidity-specific/tx-origin/)
- [SigmaPrime - tx.origin](https://github.com/sigp/solidity-security-blog#tx-origin)
- [Solidity Docs: Conversions between Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-elementary-types)
- [Solidity Docs: Conversions between Literals and Elementary Types](https://docs.soliditylang.org/en/latest/types.html#conversions-between-literals-and-elementary-types)
- [Deconstructing a Solidity Contract — Part II: Creation vs. Runtime](https://blog.openzeppelin.com/deconstructing-a-solidity-contract-part-ii-creation-vs-runtime-6b9d60ecb44c/)
- [Solidity Documentation: Yul](https://docs.soliditylang.org/en/latest/yul.html)
- [XOR Opcode](https://www.evm.codes/#18)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
