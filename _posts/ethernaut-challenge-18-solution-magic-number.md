---
title: 'Ethernaut Challenge #18 Solution — Magic Number'
excerpt: This is Part 18 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>To solve this challenge, we need to create and deploy a smart contract that weight less than 10 bytes and answer `42` when `whatIsTheMeaningOfLife` function is called.
coverImage:
  url: '/assets/blog/ethernaut/magic-number.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-05T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/magic-number.svg'
---

This is Part 18 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #18 Magic Number

> To solve this level, you only need to provide the Ethernaut with a `Solver`, a contract that responds to `whatIsTheMeaningOfLife()` with the right number.
>
> Easy right? Well... there's a catch.
>
> The solver's code needs to be really tiny. Really reaaaaaallly tiny. Like freakin' really really itty-bitty tiny: 10 opcodes at most.
>
> Hint: Perhaps its time to leave the comfort of the Solidity compiler momentarily, and build this one by hand O_o. That's right: Raw EVM bytecode.
>
> Good luck!
>
> Level author(s): [Alejandro Santander](https://github.com/ajsantander)

To solve this challenge, we need to create and deploy a smart contract that weight less than 10 bytes and answer `42` when `whatIsTheMeaningOfLife` function is called.

## Study the contracts

You can't understand how much excited I was when I saw this challenge. All the effort and knowledge I gained while deep diving into the EVM was paying off.

If you want to follow the EVM rabbit all while playing, checkout my article [Let’s play EVM Puzzles — learning Ethereum EVM while playing!](https://stermi.xyz/blog/lets-play-evm-puzzles)

This challenge is very tricky, I think that without knowing how EVM works and how to write manual EVM bytecode you will not be able to solve it or even understand the solution, but here we go anyway.

To solve this challenge, we have two requirements that can be seen in the `MagicNumFactory` contract. That is the contract that simply create a new instance of the level and then check whether the level has been correctly solved or not.

```solidity
// Query the solver for the magic number.
bytes32 magic = solver.whatIsTheMeaningOfLife();
if (magic != 0x000000000000000000000000000000000000000000000000000000000000002a) return false;

// Require the solver to have at most 10 opcodes.
uint256 size;
assembly {
    size := extcodesize(solver)
}
if (size > 10) return false;
```

As you can see, our smart contract must:

1. have a `whatIsTheMeaningOfLife` function that answer `0x000000000000000000000000000000000000000000000000000000000000002a` (bytes32) when called. This is the hex conversion of 42 in decimal.
2. Our contract's code must be less than 10 bytes

These requirements seem impossible to achieve, even having the raw bytecode to define a function, handle the function selector and so on would be much more than 10 bytes of code.

But do we really need to have that function? At the end, we have to shape the code of the contract to just pass the challenge. What if our contract, no matter how it's executed, **only and always** return **42**?

That's the trick! If you think about it is like having a Solidity smart contract than only have a `fallback` function, no matter which function you try to low-level call it will always and only execute the `fallback` function.

### EVM bytecode to return 42

The first step is to create a minimal smart contract that only return `0x2a`. No matter what, our code will always and only return **42**. What's the time? 42! Are going to rain tomorrow? 42! What's the meaning of life? 42!!!

```
[00]    PUSH1   2a
[02]    PUSH1   00
[04]    MSTORE
[05]    PUSH1   20
[07]    PUSH1   00
[09]    RETURN
```

The final bytecode of the runtime part of the contract is `0x602A60005260206000F3`. You can play with it on this [EVM Playground link](https://www.evm.codes/playground?unit=Wei&codeType=Mnemonic&code='z0x4wMSTORE~3wRETURN'~yzzPUSH1%20y%5Cnw2~0y%01wyz~_).

### EVM bytecode to deploy the contract

Now we need to deploy the minimal contract we have just written in the section before. When a smart contract is created (via `CREATE` or `CREATE2` opcode), the EVM will execute the constructor code once and the code of the deployed smart contract will be returned by the `RETURN` opcode (this returned code is called runtime code, it's the code that will be executed when you interact with a smart contract).

In our case, we just need to push the raw bytecode of the smart contract into the EVM memory and return it.

```
[00]    PUSH10  602A60005260206000F3
[0b]    PUSH1   00
[0d]    MSTORE
[0e]    PUSH1   0A
[10]    PUSH1   16
[12]    RETURN
```

The final bytecode of the deployment part of the contract is `0x69602A60005260206000F3600052600A6016F3`. You can play with it on this [EVM Playground link](https://www.evm.codes/playground?unit=Wei&codeType=Bytecode&code='69z2A~20z00F3~0Az16F3'~z0052zz60%01z~_).

### Deploy the bytecode that will create the smart contract

This code to deploy the raw bytecode is inspired by the [OpenZeppelin Clones contract](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Clones.sol) utils. It's the implementation of the [EIP 1167](https://eips.ethereum.org/EIPS/eip-1167) that is the standard defined by the Ethereum Foundation for deploying minimal bytecode smart contract implementation.

```solidity
address deployedContractAddress;
assembly {
    let ptr := mload(0x40)
    mstore(ptr, shl(0x68, 0x69602A60005260206000F3600052600A6016F3))
    deployedContractAddress := create(0, ptr, 0x13)
}
```

## Solution code

Here's the solution code

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Deploy the raw bytecode via the `create` yul function
    address solverInstance;
    assembly {
        let ptr := mload(0x40)
        mstore(ptr, shl(0x68, 0x69602A60005260206000F3600052600A6016F3))
        solverInstance := create(0, ptr, 0x13)
    }

    // Set the contract deployed as the level's solver
    level.setSolver(solverInstance);

    // Assert that the deployed contract correctly return `0x2a`
    // when `whatIsTheMeaningOfLife` is executed
    assertEq(
        Solver(solverInstance).whatIsTheMeaningOfLife(),
        0x000000000000000000000000000000000000000000000000000000000000002a
    );

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [MagicNum.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/MagicNum.t.sol)

## Further reading

- [Let’s play EVM Puzzles — learning Ethereum EVM while playing!](https://stermi.xyz/blog/lets-play-evm-puzzles)
- [EVM codes](https://www.evm.codes/)
- [OpenZeppelin Clones utils](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Clones.sol)
- [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
