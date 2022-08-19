---
title: 'EthernautDAO CTF 7 — Switch'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>The goal of the challenge is to gain ownership of the contract, overriding the value of the `owner` state variable.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-08-19T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1558814930920431617](https://twitter.com/EthernautDAO/status/1558814930920431617)

## CTF 7: Switch

For this challenge, we have to deal only with a single Smart Contract called [Switch](https://goerli.etherscan.io/address/0xa5343165d51ea577d63e1a550b1f3c872adc58e4#code).
The goal of the challenge is to gain ownership of the contract, overriding the value of the `owner` state variable.

## Study the contracts

Let's start by reviewing the code. It's not very complex, but the amount of knowledge that you need to understand how to exploit it, how to properly implement a "fixed version" and everything around the key concepts of the exploit is **HUGE!**

```solidity
/**
 *Submitted for verification at Etherscan.io on 2022-08-13
 */

// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0;

/**
 * @title Claim ownership of the contract below to complete this level
 * @dev Implement one time hackable smart contract (Switch)
 */
contract Switch {
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Changes the ownership of the contract. Can only be called by the owner
    function changeOwnership(address _owner) public onlyOwner {
        owner = _owner;
    }

    // Allows the owner to delegate the change of ownership to a different address by providing the owner's signature
    function changeOwnership(
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        require(ecrecover(generateHash(owner), v, r, s) != address(0), "signer is not the owner");
        owner = msg.sender;
    }

    // Generates a hash compatible with EIP-191 signatures
    function generateHash(address _addr) private pure returns (bytes32) {
        bytes32 addressHash = keccak256(abi.encodePacked(_addr));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", addressHash));
    }
}

```

The [Elliptic Curve Digital Signature Algorithm (ECDSA)](https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm) is the algorithm used by Ethereum to sign transaction. Every time you interact with Ethereum blockchain, you are signing the transaction with your private key. This is a key concept to understand because signing something with your private key allows a third party to **verify** that that specific transaction has been signed with a specific **public key** (yours).

**Note:** Contracts in Ethereum do not have a private key, so they cannot sign messages.

Now let's see what this contract tries to do.
If you look at the `function changeOwnership(uint8 v, bytes32 r, bytes32 s)` you will see this specific comment left from the developer `Allows the owner to delegate the change of ownership to a different address by providing the owner's signature`.

You would assume (from the comment) that only a **specific** delegate approved by the owner with some kind of offline signed hashed data would be able to gain the ownership of the contract.

The concept per se is **damn cool**, and it's base of [EIP-2612: permit – 712-signed approvals](https://eips.ethereum.org/EIPS/eip-2612) and everything you could do via [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712).

The problem is that in this contract, everything is implemented in the worst possible way. Let's look at all the problems we can find in this function.

From the [Solidity Docs about the ecrecover](https://docs.soliditylang.org/en/latest/units-and-global-variables.html?highlight=ecrecover#mathematical-and-cryptographic-functions) we know that

> `ecrecover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) returns (address)` is a native function used to recover the address associated with the public key from elliptic curve signature or return zero on error.
> The function parameters correspond to ECDSA values of the signature:
>
> - `r` = first 32 bytes of signature
> - `s` = second 32 bytes of signature
> - `v` = final 1 byte of signature

Under the explanation, there's also a **huge warning**:

> If you use `ecrecover`, be aware that a valid signature can be turned into a different valid signature without requiring knowledge of the corresponding private key. In the Homestead hard fork, this issue was fixed for _transaction_ signatures (see [EIP-2](https://eips.ethereum.org/EIPS/eip-2#specification)), but the ecrecover function remained unchanged.
>
> This is usually not a problem unless you require signatures to be unique or use them to identify items. OpenZeppelin have a [ECDSA helper library](https://docs.openzeppelin.com/contracts/2.x/api/cryptography#ECDSA) that you can use as a wrapper for `ecrecover` without this issue.

Now that we know what the `ecrecover` is and what's used for, we can return to the function. The **only** requirement that we can see is that the `ecrecover` do not return `address(0)` and usually this mean that the `r`, `s`, `v` values provided do not adhere to a valid signature.

But as you can see from the code and the only check:

- there's no check that the **current owner** was the one signing the hash
- there's no check on which should be the delegated user that can gain the ownership
- there's no check that the signed message has been already used previously. Can the delegated user use multiple time the signed message and gain ownership over and over?
- there's no check on the deadline of the signed message. Can the delegated user get the ownership whenever (in time) he/she wants?
- there's no check on the `chainId` so if the contract has been deployed on multiple chains, the user would be able to get ownership on all of them
- probably I'm missing some other checks that should be there

So with all these problems, how can we gain the ownership of the contract? You just need to execute this code:

```solidity
uint256 privateKey = 123456;
bytes32 hashedMessage = bytes32(0);

// sign the hashed message
(uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hashedMessage);

// exploit the level
level.changeOwnership(v, r, s);
```

As you can see, I have used **deliberately** empty and random values to demonstrate that you just need valid values for the `v`, `r`, and `s` signature values. Anyone with a private key would be able to sign a random payload, get those values and call `changeOwnership`!

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
function testCompleteLevel() public {
    address player = users[0];
    vm.startPrank(player);

    uint256 privateKey = 123456;
    bytes32 hashedMessage = bytes32(0);

    // sign the hashed message
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, hashedMessage);

    // exploit the level
    level.changeOwnership(v, r, s);

    vm.stopPrank();

    // Assert that the level has completed
    assertEq(level.owner(), player);
}
```

Here is the command I have used to run the test: `forge test --match-contract SwitchTest --fork-url <your_rpc_url> --fork-block-number 7399228 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [Switch.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/Switch.t.sol)

## Further reading

- [Vitalik Buterin: Exploring Elliptic Curve Pairings](https://medium.com/@VitalikButerin/exploring-elliptic-curve-pairings-c73c1864e627)
- [Immunify: Intro to Cryptography and Signatures in Ethereum](https://medium.com/immunefi/intro-to-cryptography-and-signatures-in-ethereum-2025b6a4a33d)
- [Alex Papageorgiou - B002: Solidity EC Signature Pitfalls](https://0xsomeone.medium.com/b002-solidity-ec-signature-pitfalls-b24a0f91aef4)
- [Solidity Developer: What is ecrecover in Solidity?](https://soliditydeveloper.com/ecrecover)
- [Ethereum EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [Ethereum EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-2612: Permit - 712-signed approvals](https://eips.ethereum.org/EIPS/eip-2612)
- [SWC-122: Lack of Proper Signature Verification](https://swcregistry.io/docs/SWC-122)
- [SWC-121: Missing Protection against Signature Replay Attacks](https://swcregistry.io/docs/SWC-121)
- [SWC-117: Signature Malleability](https://swcregistry.io/docs/SWC-117)
- OpenZeppelin [ECDSA](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA), [SignatureChecker](https://docs.openzeppelin.com/contracts/4.x/api/utils#SignatureChecker) and [EIP712](https://docs.openzeppelin.com/contracts/4.x/api/utils#EIP712)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
