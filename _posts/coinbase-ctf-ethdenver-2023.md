---
title: 'Coinbase CTF for ETHDenver 2023 - Riddle Bounty'
excerpt: Riddle Bounty is a CTF developed by Coinbase for the ETH Denver 2023 conference.</br></br>Are you ready to solve some riddles and learn more about signature security?.
coverImage:
  url: '/assets/blog/BuildOnBase.jpeg'
  credit:
    name: BuildOnBase
    url: https://twitter.com/BuildOnBase
date: '2023-03-06T18:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/BuildOnBase.jpeg'
---

Riddle Bounty is a CTF developed by [@BuildOnBase](https://twitter.com/BuildOnBase) for the ETH Denver 2023 conference.

[Base](https://base.org/) is a new Ethereum L2, incubated by Coinbase and built on the open-source OP Stack. We have no plans to issue a new network token.

The CTF is composed of three little riddle games, where to solve each challenge you need to guess the answer to a riddle and find a way to submit it by circumnavigating the requirements of each smart contract's function.

The main topic of this CTF is about hashing functions, how signature works and how you should and should not use them in your own implementation.

The CTF itself is pretty easy and not very fun, not because it is not well-made, but because the riddle part is straightforward to solve and does not add anything special to the challenge. In addition to that, I think that most of the CTFs are fun when they are applied to real-world context, by solving them you understand how things have gone wrong (or could have gone wrong) and you can learn a new pattern to apply to your future audit or smart contract development.

- [Original @BuildOnBase twitter thread about the CTF](https://twitter.com/BuildOnBase/status/1631799257639313409)
- [Coinbase CTF landing page](https://www.coinbase.com/it/bounty/ethdenver23)
- [GitHub repo with the full solution](https://github.com/StErMi/coinbase-ctf-ethdenver-2023)

Enough chit-chat, let's get into the real business!

## `RiddleBounty` contract

Before deep diving into each challenge solution, let's take a look at the contract.

We can see that they are using OpenZeppelin libraries and specifically the contract is inheriting the `Ownable` abstract contract and using the `ECDSA` OZ implementation for something inside the logic.

They have some management state variables like `isOpenFlag` to open/close the challenge and other little things that I'll skip because they are not relevant for the CTF itself.

The only part that we are interested in is this:

```solidity
bytes32 private constant RIDDLE_1_HASH = 0x3896ee3a8be6143be3fa1938adbae827fc724b5ff649501e7fd8c0c5352cbafa;
bytes32 private constant RIDDLE_2_HASH = 0x9c611b41c1f90946c2b6ddd04d716f6ec349ac4b4f99612c3e629db39502b941;
bytes32 private constant RIDDLE_3_HASH = 0x3cd65f6089844a3c6409b0acc491ca0071a5672c2ab2a071f197011e0fc66b6a;

/// @dev calculated as ECDSA.toEthSignedMessageHash(RIDDLE_3_HASH)
bytes32 private constant RIDDLE_3_ETH_MESSAGE_HASH =
    0x20a1626365cea00953c957fd02ddc4963990d404232d4e58acb66f46c59d9887;

mapping(address => bytes) public previousSignature;
mapping(address => address) public userWhoUsedSigner;
```

Each riddle answer has been hashed in some way (probably by using `keccak256`) and from the `@dev` comment we can assume that they are using some sort of signature logic.

To recap

- They are using OpenZeppelin libraries
- They are using some hashing for the riddle answer part
- They are using some signature logic at some point

### Challenge 1

This is the riddle content of the first challenge

> In the new world there's a curious thing,
> A tap that pours coins, like a magical spring
> A free-for-all place so vast,
> A resource that fills your wallet fast (cccccc)

The answer to this riddle is pretty easy and is "**faucet**". If you don't know, a faucet is a Web3 tool that provides a small amount of crypto funds. Usually, it's useful when you need to interact with testnet blockchains to obtain just a little amount of ETH needed to deploy smart contract or execute test transactions.

To be able to submit our answer, we need to interact with the main contract and call the `solveChallenge1`. Let's look at the code

```solidity
function solveChallenge1(string calldata riddleAnswer) external isOpen {
    if (RIDDLE_1_HASH == keccak256(abi.encodePacked(riddleAnswer))) {
        solvedChallenge1[msg.sender] = true;
    }
}
```

`isOpen` can be ignored because it's just an internal `modifier` needed to prevent the submission of the answer once the CTF is closed.

`RIDDLE_1_HASH` is a constant variable defined inside the smart contract `bytes32 private constant RIDDLE_1_HASH = 0x3896ee3a8be6143be3fa1938adbae827fc724b5ff649501e7fd8c0c5352cbafa;`

So, to solve the challenge, the hash of our answer must be equal to the `RIDDLE_1_HASH` content. At the end, this `require` is just checking that we have provided the correct answer. Hashing the real answer via `kekkak256` to be later tested is the only way to be able to do that without providing the "clear" answer directly into the contract. The "problem" is that you could just look at any other transaction previously made to the contract to solve this challenge and just copy/paste their `riddleAnswer` input parameter to solve it 😁

Here's the code from our test contract to solve the challenge and test that we have passed it

```solidity
string memory riddleOneAnswer = "faucet";

vm.prank(player1Address);
challenge.solveChallenge1(riddleOneAnswer);

assertTrue(challenge.hasSolvedChallenge1(player1Address));
```

### Challenge 2

This is the riddle content of the second challenge

> Onward we journey, through sun and rain
> A path we follow, with hope not in vain
> Guided by the Beacon Chain, with unwavering aim
> Our destination approaches, where two become the same (Ccc Ccccc)
>
> @dev These may be helpful: https://docs.ethers.org/v5/api/utils/hashing/ and
> https://docs.ethers.org/v5/api/signer/#Signer-signMessage

Like for the first riddle, the answer is pretty easy to guess, and they provide a "hint" to know which is the correct low/upper case form to use. Have you guessed it? It's "**The Merge**".

Now let's see if the challenge is a little bit more difficult compared to the first one

```solidity
function solveChallenge2(string calldata riddleAnswer, bytes calldata signature) external isOpen {
    bytes32 messageHash = keccak256(abi.encodePacked(riddleAnswer));

    require(RIDDLE_2_HASH == messageHash, "riddle not solved yet");

    require(msg.sender == ECDSA.recover(ECDSA.toEthSignedMessageHash(messageHash), signature), "invalid signature");

    if (solvedChallenge1[msg.sender]) {
        solvedChallenge2[msg.sender] = true;
    }
}
```

The function takes our answer as the first parameter and a `bytes calldata` signature.
The first `require` is like the one we have seen before, it just validates that we have provided the correct answer.

I hope to find someone to share my life with at some point in the future. I don't want to live without leaving anything behind me.

The second `require` statement that we see is basically checking that the `msg.sender` is the `signer` of the hashed message `ECDSA.toEthSignedMessageHash(messageHash)`.

`ECDSA.toEthSignedMessageHash` is a utility function that returns an "Ethereum Signed Message" which standard is defined by the [EIP-191](https://eips.ethereum.org/EIPS/eip-191). The docs of the OpenZeppelin function further explain it

> @dev Returns an Ethereum Signed Message, created from a `hash`.
> This produces hash corresponding to the one signed with the [JSON-RPC method](https://eth.wiki/json-rpc/API#eth_sign[`eth_sign`]) as part of EIP-191.

To solve the challenge, we just need to provide the signature (signed by us) of the "Ethereum Signed Message" of the answer to the riddle (in this very specific case of the hash of the answer)

```solidity
string memory riddleTwoAnswer = "The Merge";

// Use the foundry cheatcode to sign a message via a private key
bytes32 riddleTwoAnswerHashed = keccak256(abi.encodePacked(riddleTwoAnswer));
(uint8 v, bytes32 r, bytes32 s) = vm.sign(
    player1PrivateKey,
    ECDSA.toEthSignedMessageHash(riddleTwoAnswerHashed)
);

// The challenge does not support the direct usage of v/r/s and we need to provide the final signature
bytes memory riddleTwoSignature = abi.encodePacked(r, s, v);

// execute the challenge function
vm.prank(player1Address);
challenge.solveChallenge2(riddleTwoAnswer, riddleTwoSignature);

assertTrue(challenge.hasSolvedChallenge1(player1Address));
```

### Challenge 3

This is the riddle content of the third challenge

> A proposal was formed, a new blob in the land,
> To help with the scale, and make things more grand
> A way to improve the network's high fees,
> And make transactions faster, with greater ease (CCC-NNNN)
>
> @dev These may be helpful: https://docs.ethers.org/v5/api/utils/hashing/ and
> https://docs.ethers.org/v5/api/signer/#Signer-signMessage

To answer the riddle, we just need to find some proper keyword and perform a Google search. By looking at the riddle's content, I can guess that they are talking about some kind of EIP (Ethereum Improvement Proposal) about "blob". The first Google result of searching "EIP blob" just forward us to the [EIP-4844: Shard Blob Transactions](https://eips.ethereum.org/EIPS/eip-4844). The answer to the third and final riddle is "**EIP-4844**".

Let's take a look at the function that we need to call to submit our answer. It's much beefier compared to the previous two, so probably will be much harder to solve?

```solidity
function solveChallenge3(
    string calldata riddleAnswer,
    address signer,
    bytes calldata signature
) external isOpen {
    require(signer != address(0), "signer cannot be zero address");

    bytes32 messageHash = keccak256(abi.encodePacked(riddleAnswer));
    require(RIDDLE_3_HASH == messageHash, "riddle answer incorrect");

    require(
        signer == ECDSA.recover(RIDDLE_3_ETH_MESSAGE_HASH, signature),
        "invalid signature, message must be signed by signer"
    );

    if (previousSignature[signer].length == 0) {
        previousSignature[signer] = signature;
        userWhoUsedSigner[signer] = msg.sender;
        return;
    }

    require(userWhoUsedSigner[signer] == msg.sender, "solution was used by someone else");

    require(
        keccak256(abi.encodePacked(previousSignature[signer])) != keccak256(abi.encodePacked(signature)),
        "you have already used this signature, try submitting a different one"
    );

    if (solvedChallenge2[msg.sender] && (finishingTimes[msg.sender] == 0)) {
        finishingTimes[msg.sender] = block.timestamp;
        leaderboard.push(msg.sender);
    }
}
```

The function accepts three different input parameters

- `string calldata riddleAnswer` that should be the riddle's answer
- `address signer` some kind of signer?
- `bytes calldata signature` a signature that I would assume has been signed by the `signer` also provided as an input parameter

Let's apply the "divide and conquer" concept and look into each `require` to understand what we need to do to complete the challenge

The first `require` check that `signer != address(0)`. It does make sense in general that the `signer` of a signature cannot be the `address(0)` because it can't sign anything, and usually, it's a common check that you would perform anyway.

The second `require` check `RIDDLE_3_HASH == messageHash` where `messageHash` is the hash of the riddle's answer we have provided. Like the first and second function we have seen, this check is done just to confirm that we have provided the second answer.

The third `require` is similar to the one we have seen for the second challenge, but a little bit different.

```solidity
require(
	signer == ECDSA.recover(RIDDLE_3_ETH_MESSAGE_HASH, signature),
	"invalid signature, message must be signed by signer"
);
```

While the second challenge required that the `signer` that have signed the message was `msg.sender` (the player who was submitting the answer) in this case it checks that the `signer` provided as `solveChallenge3` input is the one that has signed the hashed message. This is just more broad compared to the second challenge because we just need to provide a signature that has been signed by some signer. Let's see it makes more sense in the rest of the code.

At this point, there's an `if` branch that interacts with the `previousSignature` state variable

```solidity
if (previousSignature[signer].length == 0) {
	previousSignature[signer] = signature;
	userWhoUsedSigner[signer] = msg.sender;
	return;
}
```

`mapping(address => bytes) public previousSignature` is a `mapping` between an `address` and a `bytes` type (in this case the signature)

We enter the `if` case if the `signer` address has not been stored by these variables in the past. If that's the case, they initialize both the `previousSignature[signer]` and `userWhoUsedSigner[signer]` state variable.

Basically, if that `signer`'s signature has never been provided as an input of `solveChallenge3` they store both the `signature` and the `msg.sender` and finish the execution of the transaction flow.

This means that to be able to finish the challenge, we must call again the `solveChallenge3` function...

Ok, let's keep going with the logic of the function. Let's assume we have called a second time the function with the same parameters.

The fifth `require` checks that `userWhoUsedSigner[signer] == msg.sender` and this should pass because with the previous execution, we have stored ourselves (`msg.sender`) inside that mapping by executing the part of the logic inside the `if`.

The sixth and final `require` is maybe the more complex one to understand. It checks that `keccak256(abi.encodePacked(previousSignature[signer])) != keccak256(abi.encodePacked(signature))` and the error message says, "you have already used this signature, try submitting a different one".

The challenge wants that signature that has been provided with the previous execution of the function **must be** different from the one that we have provided again.

It's pretty obvious that this challenge is about **signature malleability**. Usually, you want to allow the usage of a signed message to be used only once and then "burn" the possibility to replay it again (on top of other tons of checks, but this depends on your own contract's logic).

The first thing that came to my mind was another CTF that I have performed that was using a modified version of the ECDSA library from OpenZeppelin (see [EthernautDAO CTF 9 — EtherWallet](https://stermi.xyz/blog/ethernautdao-ctf-etherwallet-solution)) that allows a special case of function malleability ("s-values in the upper range") but this should not be the case. As far as I can see, the `RiddleBounty` contract is using the official version of the library from OpenZeppelin.

If we look at the very beginning of the contract, we see a specific natspec comment left from some of the developer.

> /// @dev Using OpenZeppelin 4.7.0 contracts

Well, yes they are using the official OpenZeppelin implementation, but at the time of writing this blog post the last release of the library is the `v4.8.2` and the last one for the `4.7.x` version was `4.7.3`. Usually, each "patch" release means a security fix or some kind of bug fix.

At this point, the first thing that I would do is to search for "OpenZeppelin signature malleability" in Google and try to see if there have been any security fix specific for this exploit.
Well, one of the first results from Google confirmed my suspect and forwarded us to [OpenZeppelin Contracts vulnerable to ECDSA signature malleability](https://github.com/advisories/GHSA-4h98-2769-gh6h). The affected version of this security issue is the one `>= 4.1.0, < 4.7.3` and `RiddleBounty` is using one of the versions in that specific range.

Let's see what the issue is all about

> The functions `ECDSA.recover` and `ECDSA.tryRecover` are vulnerable to a kind of signature malleability due to accepting EIP-2098 compact signatures in addition to the traditional 65 byte signature format. This is only an issue for the functions that take a single `bytes` argument, and not the functions that take `r, v, s` or `r, vs` as separate arguments.
>
> The potentially affected contracts are those that implement signature reuse or replay protection by marking the signature itself as used rather than the signed message or a nonce included in it. A user may take a signature that has already been submitted, submit it again in a different form, and bypass this protection.

The [ERC-2098: Compact Signature Representation](https://eips.ethereum.org/EIPS/eip-2098) aims to provide a "compact" version of the "normal" 65 bytes representation of the signature and the main motivation behind this EIP is to simplify handling transactions in client code, reduce gas costs and reduce transaction sizes.

Because `solveChallenge3` accept a `signature` that can be both in standard and compact version and because they are using a version of OpenZeppelin's ECDSA library that allows the compact version of the signature without reverting, we can indeed exploit the contract by providing the same `signature` but in a compact version format.

If you are eager to know more about the vulnerability and how OpenZeppelin has fixed it, I would suggest you to look into these links

- [OpenZeppelin Contracts vulnerable to ECDSA signature malleability](https://github.com/advisories/GHSA-4h98-2769-gh6h)
- [OpenZeppelin PR: Fix ECDSA signature malleability](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/3610)

We can now craft the compact version of the same signature and complete the challenge

```solidity
string memory riddleThreeAnswer = "EIP-4844";

bytes32 riddleThreeAnswerHashed = keccak256(abi.encodePacked(riddleThreeAnswer));
(v, r, s) = vm.sign(player1PrivateKey, ECDSA.toEthSignedMessageHash(riddleThreeAnswerHashed));

// The challenge does not support the direct usage of v/r/s and we need to provide the final signature
bytes memory riddleThreeSignature = abi.encodePacked(r, s, v);

// execute the challenge function the first time to "enter" the `if` branch and store signature
// data inside the `previousSignature` and `userWhoUsedSigner` state variables
vm.prank(player1Address);
challenge.solveChallenge3(riddleThreeAnswer, player1Address, riddleThreeSignature);

// Generate the compact version of the signature
// See https://static.ricmoo.com/peep-an-eip-2098.pdf
uint256 compactS = uint256(s);
if (v == 28) {
    compactS |= (1 << 255);
}
bytes memory riddleThreeCompactSignature = abi.encodePacked(r, bytes32(compactS));

// call for a second time the function and finish the challenge
// by using the "compact version" of the same signature
vm.prank(player1Address);
challenge.solveChallenge3(riddleThreeAnswer, player1Address, riddleThreeCompactSignature);

assertTrue(challenge.isOnLeaderboard(player1Address));
```

If you want to see the full test, just head over to the [RiddleBountyTest.t.sol](https://github.com/StErMi/coinbase-ctf-ethdenver-2023/blob/master/test/RiddleBountyTest.t.sol) test file on my public GitHub repository.

## Further reading

- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [ERC-2098: Compact Signature Representation](https://eips.ethereum.org/EIPS/eip-2098)
- [OpenZeppelin ECDSA implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/ECDSA.sol)
- [SWC-117 Signature Malleability](https://swcregistry.io/docs/SWC-117)
- [Inherent Malleability of ECDSA Signatures](https://www.derpturkey.com/inherent-malleability-of-ecdsa-signatures/)
- [Bitcoin Transaction Malleability](https://eklitzke.org/bitcoin-transaction-malleability)
- [B002: Solidity EC Signature Pitfalls](https://0xsomeone.medium.com/b002-solidity-ec-signature-pitfalls-b24a0f91aef4)
- [ECDSA signature malleability example in solidity](https://github.com/0xbok/malleable-signature-demo)

Here you can find more information about the OpenZeppelin signature malleability problem related to the "compact signature"

- [GitHub Advisory Report about OpenZeppelin ECDSA signature malleability related to compact signature](https://github.com/advisories/GHSA-4h98-2769-gh6h)
- [OpenZeppelin PR to fix ECDSA signature malleability related to compact signature](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/3610)

Here is instead an [OpenZeppelin PR](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/1622) to fix another signature malleability problem related to the `v` value of the signature (see the Ether Wallet CTF).

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
