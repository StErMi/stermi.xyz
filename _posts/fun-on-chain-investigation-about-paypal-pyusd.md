---
title: 'A fun on-chain investigation about PayPal `PYUSD` smart contract'
excerpt: Do you want to know more about the odd things I have found while digging this dark forest? Buckle up and follow me into this rabbit hole!
coverImage:
  url: '/assets/blog/pyusd.png'
  credit:
    name: PayPal PYUSD
    url: https://paypal.com/
date: '2023-08-31T17:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/pyusd.png'
---

When PayPal [announced the release of PyUSD](https://newsroom.paypal-corp.com/2023-08-07-PayPal-Launches-U-S-Dollar-Stablecoin) on Ethereum, I was pretty excited and curious to see the codebase behind the stable coin.

I had plenty of questions on my mind that needed an answer:

1. Was the code written from scratch?
2. Was it secure and optimized?
3. Has the code been audited?
4. What centralization and upgradability tradeoff have been made?

Everyone rushed to look at the code and released those tweets. At the time, I was working hard on an audit, and I was unable to invest so much time, so I missed the wave on initial engagement. What a bummer 😭

At this point, it was pretty useless to tweet something that was already known, and I wanted to try something different. I wanted to dig very deep down the whole codebase and deployment process and see if I could find something interesting from this investigation.

Do you want to know more about the odd things I have found while digging this dark forest? Buckle up and follow me into this rabbit hole!

## General project information

PayPal USD (PYUSD) is fully backed by U.S. dollar deposits, short-term U.S. treasuries and similar cash equivalents, and can be redeemed 1:1 for U.S. dollars. You can read more about it from the [PayPal official Newsroom announcement](https://newsroom.paypal-corp.com/2023-08-07-PayPal-Launches-U-S-Dollar-Stablecoin).

- GitHub Repository: https://github.com/paxosglobal/pyusd-contract
- PYUSD Proxy: [`0x6c3ea9036406852006290770bedfcaba0e23a0e8`](https://etherscan.io/address/0x6c3ea9036406852006290770bedfcaba0e23a0e8)
- PYUSD Implementation (the current one used by the Proxy): [`0xe17b8adf8e46b15f3f9ab4bb9e3b6e31db09126e`](https://etherscan.io/address/0xe17b8adf8e46b15f3f9ab4bb9e3b6e31db09126e)

The `ERC20` contract has been developed (?) by Paxos that is the entity that centrally mints and burns those tokens (see [Contract Specification](https://github.com/paxosglobal/pyusd-contract#contract-specification))

The "stub" ERC20 contract Hopper (XYZ) has been [audited by Trail of Bits between December 12 to December 16, 2022](https://github.com/paxosglobal/pyusd-contract/blob/master/audit-reports/Trail_of_Bits_Audit_Report.pdf). It seems that Paxos has developed a base ERC20 contract that later has been used to deploy all of their ERC20 contracts.

Bonus question: **have been any changes to the codebase between what has been audited by Trail of Bits and what has been deployed?** I had not enough time to invest into this question, but it could be an interesting side quest for the future.

## Follow the rabbit hole of proxy upgrades

The first thing that was very odd to me was that if you queried the `pyUSD.EIP712_DOMAIN_HASH()` function (that returns the value of the state variable `EIP712_DOMAIN_HASH`) it would return `0x0000000000000000000000000000000000000000000000000000000000000000` (bytes32).

That's very odd... That value seems not initialized, and it could revert all the operations that are based on the [EIP-712 standard (Typed structured data hashing and signing)](https://eips.ethereum.org/EIPS/eip-712). To be specific, `EIP712_DOMAIN_HASH` is used inside the `_betaDelegatedTransfer` function that is called by both `betaDelegatedTransferBatch` and `betaDelegatedTransfer`.

Those functions allow the caller to perform an atomic transfer (or a batch of them, depending on which one you call) on behalf of the `from` address(s), identified by their signature(s).
I have not tested them locally, but I'm pretty confident that those function will revert because `EIP712_DOMAIN_HASH` is equal to `0x` and has not been initialized correctly.

Probably it's not a huge deal because those functions seem to be in "beta" and can be called only by addresses that have been whitelisted in the `betaDelegateWhitelist` mapping.

The main question that started the whole rabbit hole was this one: why is `EIP712_DOMAIN_HASH` state variable not initialized, and how is it possible? A small question like this was able to create a waterfall of another one hundred of them that made everything super complicated.

### How is `EIP712_DOMAIN_HASH` calculated and where is initialized?

Usually, this value is calculated based on some constant/immutable parameter and needs to be re-calculated if those parameters changes during the upgrade process. It mostly depends on what type of contract we are talking about.

If we look at the current implementation used by the proxy, we see that `EIP712_DOMAIN_HASH` is initialized in the `initializeDomainSeparator` **private** function that is called by `initialize()` function during the initialization phase (remember, this is an upgradable contract).

```solidity
    /**
     * @dev sets 0 initials tokens, the owner, and the supplyController.
     * this serves as the constructor for the proxy but compiles to the
     * memory model of the Implementation contract.
     */
    function initialize() public {
        require(!initialized, "MANDATORY VERIFICATION REQUIRED: The proxy has already been initialized, verify the owner and supply controller addresses.");
        owner = msg.sender;
        assetProtectionRole = address(0);
        totalSupply_ = 0;
        supplyController = msg.sender;
        initializeDomainSeparator();
        initialized = true;
    }

    /**
     * The constructor is used here to ensure that the implementation
     * contract is initialized. An uncontrolled implementation
     * contract might lead to misleading state
     * for users who accidentally interact with it.
     */
    constructor() public {
        initialize();
        pause();
    }

    /**
     * @dev To be called when upgrading the contract using upgradeAndCall to add delegated transfers
     */
    function initializeDomainSeparator() private {
        // hash the name context with the contract address
        EIP712_DOMAIN_HASH = keccak256(abi.encodePacked(// solium-disable-line
                EIP712_DOMAIN_SEPARATOR_SCHEMA_HASH,
                keccak256(bytes(name)),
                bytes32(address(this))
            ));
    }
```

By looking at the code, we could assume that

1. When the implementation contract is deployed, the `EIP712_DOMAIN_HASH` is initialized
2. When the proxy contract is initialized (by manually calling `initialize()`) the `EIP712_DOMAIN_HASH` is initialized
3. `EIP712_DOMAIN_HASH` is initialized by using the `name` variable value of the implementation contract. `name` is a `string public constant` defined at the implementation level and, at least for the current implementation contract, is equal to `"PayPal USD"`

Given that the contract has been initialized (if you look at the `initialized` value it's indeed equal to `true`) how in the hell is it possible that `EIP712_DOMAIN_HASH` is equal to `0x`?

This question bootstrapped the whole rabbit hole. If you were wondering why I made all those tweets, that's the answer 😁

- https://twitter.com/StErMi/status/1695065463259017616
- https://twitter.com/StErMi/status/1694396767452733745
- https://twitter.com/StErMi/status/1694607920866935126
- https://twitter.com/StErMi/status/1694360204442296677
- https://twitter.com/StErMi/status/1694008223085289970

### Trying to fetch more than 550000 blocks

What I had to do was to traverse the whole upgrade history of `PYUSD` and see all the transactions that have been executed on each implementation.

I'll be honest, it was not an easy task because the current ecosystem of tools that allows you to do that does not offer an easy way to do it. These are all the approaches I have tried to come up with:

- I have tried to build a test suite with Foundry, loop all the forks and collects all the different implementations (plus other useful information) used by the proxy between the current block and the deployment block of the contract. It was painfully slow, and I ran out-of-gas countless times (probably because of Solidity memory-expansion)
- I have tried to implement the same logic, but by using Typescript and the Alchemy SDK. Performing an `alchemy.core.call` for each block was also slow, and it took too many times (we are talking about days)

I ditched these more automated approaches because **the number of blocks I had to traverse was more than ~550000**! It took too much time (I would say days), I would have probably hit the free alchemy plan limitation and it was not an elegant solution.

I have also tried to use some more "UI" tools like poking around Etherscan list of transactions and internal transaction, but I was unable to properly filter them as much as I wanted.

I also tried to use [evm.storage](https://evm.storage/), a really nice and handy tool that had just released the perfect feature for this task. You can now query the history of the values that a variable (storage slot) has assumed during the whole lifetime of the contract. In theory, it was perfect for what I had to do, but in practice it didn't do the trick. I'm certain that they guys from [smlXL](https://twitter.com/smlxldotio) are still working on the tool and will fix it in the near future.

### A more reasonable solution: using `trace_filter`

I won't lie to you, there have been multiple times when I was this close to just rage-quit and delete everything I have done so far. In the end, this is just a fun but useless side project that no one paid me to do. I could have used all those hours to play a game or do some bug hunting, but when I have a problem that bugs my mind like this one, I can't help myself to keep going until I find a good enough answer.

Ok, let's keep going. I remembered from a past project that Alchemy had another low-level API call that could be useful. Instead of fetching all those blocks, I could have just filtered all the transactions to select those ones that have interacted with only the `PYUSD` proxy.

The API I'm referring to is called [`trace_filter`](https://docs.alchemy.com/reference/trace-filter) and returns all the low-level traces that match a set of filters that you can specify.

Ok, time to code and extract all those juicy traces. I think that I have wasted more hours getting around the Alchemy timeouts and failure compared to the time needed to implement the code to achieve the result.

After gathering all the traces and saving them into a `JSON` file I was looking at more than 2363 records! That's because those traces also include the `transfer`, `approve` and so on.

At this point, it was time to further filter them by only looking at those transactions that made sense to me. I had to look at the transaction calldata and filter them by the function's signature to only save those that were executing one of the following functions:

- `upgradeTo`
- `upgradeToAndCall`
- `changeAdmin`
- `disregardProposeOwner`
- `pause`
- `unpause`
- `freeze`
- `unfreeze`
- `claimOwnership`
- `setBetaDelegateWhitelister`
- `setSupplyController`
- `setAssetProtectionRole`
- `decreaseSupply`
- `increaseSupply`
- `initialize`
- `whitelistBetaDelegate`
- `unwhitelistBetaDelegate`
- `reclaimPYUSD`
- `proposeOwner`
- `wipeFrozenAddress`

After applying the advanced filter, I was able to skim the records to just 37 plus the proxy deployment transaction that initialize the proxy with the very first `implementation` contract to be sued. Nice!

## The upgrade history of `PYUSD`

If we look at those transactions, and we filter them to only the execution of `upgradeTo` and `upgradeToAndCall` we can re-build the whole "upgrade" history of the `proxy` implementation addresses. On top of this, we need to remember that the very first `implementation` contract used is the one that is passed to the Proxy as the `constructor` argument when the Proxy is deployed.

Let's see what we got

| Order | From                                                                                                                    | Function                         | Implementation Address                                                                                                  | Date        | Transaction                                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) | `constructor` (Proxy Deployment) | [`0xfac98fbe68a4153be8eed8de289a9ccdec8b1674`](https://etherscan.io/address/0xfac98fbe68a4153be8eed8de289a9ccdec8b1674) | Nov-08-2022 | [`0xd2660a80f27d6bdea7760e6f0866debe9b11b33f072cc66e8b447d77410dcf0d`](https://etherscan.io/tx/0xd2660a80f27d6bdea7760e6f0866debe9b11b33f072cc66e8b447d77410dcf0d) |
| 1     | [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) | `upgradeTo`                      | [`0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a`](https://etherscan.io/address/0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a) | Jan-23-2023 | [`0xc2ec3bd3e4ac3c7fab3780ebc6dedbd79133a381ed6fae5fd556c13bf3c868f8`](https://etherscan.io/tx/0xc2ec3bd3e4ac3c7fab3780ebc6dedbd79133a381ed6fae5fd556c13bf3c868f8) |
| 2     | [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) | `upgradeTo`                      | [`0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020`](https://etherscan.io/address/0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020) | Aug-03-2023 | [`0x34dcf26b3ad5a982f73617a8199c771ef86f8943482ae1e37d435afda60f6b9d`](https://etherscan.io/tx/0x34dcf26b3ad5a982f73617a8199c771ef86f8943482ae1e37d435afda60f6b9d) |
| 3     | [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) | `upgradeTo`                      | [`0xe17b8aDF8E46b15f3F9aB4Bb9E3b6e31Db09126E`](https://etherscan.io/address/0xe17b8aDF8E46b15f3F9aB4Bb9E3b6e31Db09126E) | Aug-07-2023 | [`0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f`](https://etherscan.io/tx/0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f) |

What can we see from this data?

- The proxy's implementation has been changed 3 times (not including the first one used for the proxy deployment)
- The very proxy has been deployed almost one year before the `PYUSD` announcement

Now we need to answer some questions:

1. Why has the proxy (and the old implementations) has been deployed almost a year before the official announcement?
2. Why all those upgrades during the previous years, and what are the differences between those implementation contracts?
3. How was it possible that the `EIP712_DOMAIN_HASH` variable has never been properly initialized during all those upgrades?

Let's start peeking under the hood of those contracts and see what we can discover.

### The first implementation contract

The `PYUSD` announcement has been made by PayPal on Aug. 7, 2023 but the `PYUSD` proxy (and implementation) has been **deployed on Nov. 08, 2022**. Almost a year ago. What's the reason to deploy the contract so long time ago instead of just deploying it a couple of days before the announcements and performing only the transactions needed to correctly set up it?

Let's look at the implementation [0xfac98fbe68a4153be8eed8de289a9ccdec8b1674](https://etherscan.io/address/0xfac98fbe68a4153be8eed8de289a9ccdec8b1674) that is the one used when the Proxy has been deployed. Well... the contract has not been verified on Etherscan, and we only have the **raw byte code** of it...

Let's open our handy Dedaub Contract Library tool to try to decode this nasty raw byte code: https://library.dedaub.com/ethereum/address/0xfac98fbe68a4153be8eed8de289a9ccdec8b1674/decompiled

- The `name()` function returns `Hopper` instead of `PayPal USD` (what is returning right now by proxy calling the `PYUSD` contract)
- The `symbol()` function returns `XYZ` instead of `PYUSD` (what is returning right now by proxy calling the `PYUSD` contract)
- The `initialize()` function is different from the one used by the current implementation and does not `initializeDomainSeparator()` function

```solidity
function initialize() public nonPayable {
    require(!_initialize, Error('already initialized'));
    _owner = msg.sender;
    _assetProtectionRole = 0;
    _totalSupply = 0;
    _supplyController = msg.sender;
    _initialize = 1;
}
```

At this point, I would say that we know why probably the `EIP712_DOMAIN_HASH` returns `0x` if called by the `PYUSD` contract. If it was indeed initialized by this contract, it would have used the "wrong" `name` to set the `EIP712_DOMAIN_HASH` value used by the `betaDelegatedTransferBatch` and `betaDelegatedTransfer` functions.

I won't check which are the differences between the decoded version of this contract and the other one, or at least I'm not planning to do so in this blog post. If you think that it could be an interesting topic to deep dive, please let me know and I will consider it.

### The second implementation contract

On Jan. 23, 2023 the proxy has been updated to the second implementation contract deployed at [`0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a`](https://etherscan.io/address/0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a).

What's the differences between this implementation and the one currently used by the PYUSD Proxy? You can take a look by [clicking here](https://www.diffchecker.com/hOycr5u0/).

- The contract name has been changed from `XYZImplementation` to `PYUSDImplementation`
- The `name` constant has been changed from `Hopper` to `PayPal USD`
- The `symbol` constant has been changed from `XYZ` to `PYUSD`
- The `reclaimXYZ` function has been renamed to `reclaimPYUSD`
- Other small changes only related to comments and naming, but nothing about function's names or logic

### The third implementation contract

On Aug. 03, 2023 the proxy has been updated to the second implementation contract deployed at [`0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020`](https://etherscan.io/address/0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020).

What are the differences between the previous implementation and this one? You can take a look by [clicking here](https://www.diffchecker.com/c17GngL1/).

- The `name` constant has been changed from `Hopper` to `Hopper USD`
- Other changes on the comments, nothing about function's names or logic

## Recap of the upgrades and conclusion

What has changed from the very first implementation to the last one (currently used by PYUSD Proxy)?

- The `name` constant value has been changed from `Hopper` to `Hopper USD` to `PayPal USD`
- The `symbol` constant value has been changed from `XYZ` to `PYUSD`
- The `reclaimXYZ` has been renamed to `reclaimPYUSD`

And what about `EIP712_DOMAIN_HASH`? The state variable `EIP712_DOMAIN_HASH` has not been initialized, yet, so I assume that at some point there will be another upgrade that will allow the owner of the contract to call `initializeDomainSeparator` that right now is `private` (and has no auth checks).

Does all of this make sense to me? To be honest, no... I don't understand why to use an old, obfuscated and non-verified contract as the first implementation of the `PYUSD` proxy that has been upgraded just to fix those inconsistencies in the `name`, `symbol` and `reclaim` function. The cherry on top is that, even with all these upgrades, the `EIP712_DOMAIN_HASH` is still not initialized at all.

It would be interesting to hear all the behind-the-scenes from someone at Paxos or PayPal 😁

## The complete history of `PYUSD`

For completeness and just because I wasted so much time to get all the transactions that have been executed on the proxy itself, I **must** write down all of them. Bear with me just a little bit more, maybe you will find something interesting!

1. Nov-08-2022 [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) (marked as PayPal USD Deployer) has deployed the PayPal USD Proxy contract and initialized with the [`0xfac98fbe68a4153be8eed8de289a9ccdec8b1674`](https://etherscan.io/address/0xfac98fbe68a4153be8eed8de289a9ccdec8b1674) implementation contract | See transaction [`0xd2660a80f27d6bdea7760e6f0866debe9b11b33f072cc66e8b447d77410dcf0d`](https://etherscan.io/tx/0xd2660a80f27d6bdea7760e6f0866debe9b11b33f072cc66e8b447d77410dcf0d)
2. Nov-08-2022 [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) (marked as PayPal USD Deployer) executed `changeAdmin(0x137Dcd97872dE27a4d3bf36A4643c5e18FA40713)` on the proxy. I assume that [`0x137Dcd97872dE27a4d3bf36A4643c5e18FA40713`](https://etherscan.io/address/0x137Dcd97872dE27a4d3bf36A4643c5e18FA40713) is the PayPal/Paxos multi-sig that executes the "admin" function of the PYUSD contract | See transaction [`0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f`](https://etherscan.io/tx/0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f)
3. Nov-08-2022 [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) (marked as PayPal USD Deployer) executed `initialize()` on the Proxy Contract (at this point the proxy is using the not-verified implementation that **does not** set the `EIP712_DOMAIN_HASH` value) | See transaction [`0x36a4358e3106e4a2face8d733a603b77a49b4b1432b93f139a1d20a09ee99d1a`](https://etherscan.io/tx/0x36a4358e3106e4a2face8d733a603b77a49b4b1432b93f139a1d20a09ee99d1a)
4. Nov-08-2022 [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) (marked as PayPal USD Deployer) executed `setSupplyController(0xE25a329d385f77df5D4eD56265babe2b99A5436e)` setting a new supply controller that will be able to mint and burn tokens | See transaction [`0x6bc22250e7fbfbfc71977da778cf3081712b3fa65222dc08f424d7b9fb877b6c`](https://etherscan.io/tx/0x6bc22250e7fbfbfc71977da778cf3081712b3fa65222dc08f424d7b9fb877b6c)
5. Nov-08-2022 [`0x3b210c2a0cfcf237a48675b70626961be3e435db`](https://etherscan.io/address/0x3b210c2a0cfcf237a48675b70626961be3e435db) (marked as PayPal USD Deployer) executed `proposeOwner(0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33)` proposing a new owner of the token contract (not to be mistaken with the `admin` of the proxy) | See transaction [`0x99d72ebc4a714445bfce4677a09f11c2afc020bbf89c8355e233709288519d9e`](https://etherscan.io/tx/0x99d72ebc4a714445bfce4677a09f11c2afc020bbf89c8355e233709288519d9e)
6. Nov-08-2022 [`0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33`](https://etherscan.io/address/0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33) (the proposed owner, see previous tx) executed `claimOwnership()` setting a new supply controller that will be able to mint and burn tokens | See transaction [`0x40d453e2617705abf7644d6f0adbbd8de757c2f87b187b4abba7806009481fe2`](https://etherscan.io/tx/0x40d453e2617705abf7644d6f0adbbd8de757c2f87b187b4abba7806009481fe2)
7. Nov-08-2022 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1100336220000)` minting `1_100_336` of PYUSD | See transaction [`0x416b6ed913dba77f99fdc0dd022d28f71648f95702112f984b4aec1815f563d8`](https://etherscan.io/tx/0x416b6ed913dba77f99fdc0dd022d28f71648f95702112f984b4aec1815f563d8)
8. Nov-08-2022 [`0x0644bd0248d5f89e4f6e845a91d15c23591e5d33`](https://etherscan.io/address/0x0644bd0248d5f89e4f6e845a91d15c23591e5d33) (the contract owner) executed `setAssetProtectionRole(0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33)` setting **himself** as the new "Asset Protection Role" | See transaction [`0xcdbc5de8965a8472a31d7e7faa8cf32352f745dee12cdc06a1307795912e1317`](https://etherscan.io/tx/0xcdbc5de8965a8472a31d7e7faa8cf32352f745dee12cdc06a1307795912e1317)
9. Nov-10-2022 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(1000000)` burning `1` PYUSD | See transaction [`0x885055bf81bf8851cd30ff54fdff40e468f10b9bbb8a3697c2eff32627cdcbc1`](https://etherscan.io/tx/0x885055bf81bf8851cd30ff54fdff40e468f10b9bbb8a3697c2eff32627cdcbc1)
10. Nov-16-2022 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0x142ac7813b5e01f984e4ec5c86a09949eb821b5c0ed105bfd1da97987baf0b3d`](https://etherscan.io/tx/0x142ac7813b5e01f984e4ec5c86a09949eb821b5c0ed105bfd1da97987baf0b3d)
11. Jan-23-2023 [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) (the proxy admin) executed `upgradeTo(0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a)` upgrading the proxy to the new implementation [`0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a`](https://etherscan.io/address/0xa5324B1a3638E50f5E561f016f3D64Ddc277E36a) | See transaction [`0xc2ec3bd3e4ac3c7fab3780ebc6dedbd79133a381ed6fae5fd556c13bf3c868f8`](https://etherscan.io/tx/0xc2ec3bd3e4ac3c7fab3780ebc6dedbd79133a381ed6fae5fd556c13bf3c868f8)
12. Jan-24-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0xa3bf4a8fc8a68d4eebcf84e649bf42e95ac34906e48ebaf597daf0fb794d7701`](https://etherscan.io/tx/0xa3bf4a8fc8a68d4eebcf84e649bf42e95ac34906e48ebaf597daf0fb794d7701)
13. Jan-24-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(1000000)` burning `1` PYUSD | See transaction [`0x25636577412798ea556011ca14b239abeb51c78f9a3ff57610db525da584d189`](https://etherscan.io/tx/0x25636577412798ea556011ca14b239abeb51c78f9a3ff57610db525da584d189)
14. Jan-31-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0xe0e03ef7b09595c58028e3a93fa5c5c08e1d65602fa437d510f6713d71c1561a`](https://etherscan.io/tx/0xe0e03ef7b09595c58028e3a93fa5c5c08e1d65602fa437d510f6713d71c1561a)
15. Jan-31-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(26400719690000)` minting `26_400_719.690` PYUSD | See transaction [`0xe324b3a6cdd41ef2e04a6822667c74b147b396b2c628b40cb9ab00cc0508b3de`](https://etherscan.io/tx/0xe324b3a6cdd41ef2e04a6822667c74b147b396b2c628b40cb9ab00cc0508b3de)
16. Feb-23-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(25501056910000)` burning `25_501_056.910` PYUSD | See transaction [`0x658bd02d7b705122204e234aa9b6e00fcf0aa02cb79317890c30f2dda28de560`](https://etherscan.io/tx/0x658bd02d7b705122204e234aa9b6e00fcf0aa02cb79317890c30f2dda28de560)
17. Aug-02-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0x20c083241b1b2a35002f44ca0dc52b195378338570cfc879a2d5c6d6d913e4a1`](https://etherscan.io/tx/0x20c083241b1b2a35002f44ca0dc52b195378338570cfc879a2d5c6d6d913e4a1)
18. Aug-02-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(1000000)` burning `1` PYUSD | See transaction [`0x92fac8b00776766bf0f86a843fcf8153df230e41c889f5f0e8905fb922cc4ac4`](https://etherscan.io/tx/0x92fac8b00776766bf0f86a843fcf8153df230e41c889f5f0e8905fb922cc4ac4)
19. Aug-03-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0xe49dd9c785fde4fae19b9058ec500efaa8897d5066b3c334080d06a2b12ed955`](https://etherscan.io/tx/0xe49dd9c785fde4fae19b9058ec500efaa8897d5066b3c334080d06a2b12ed955)
20. Aug-03-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(1000000)` burning `1` PYUSD | See transaction [`0x1f83a3df01acf92ad32c6459f445dc48064aaaf1aa8079a418888fc3b9b84f35`](https://etherscan.io/tx/0x1f83a3df01acf92ad32c6459f445dc48064aaaf1aa8079a418888fc3b9b84f35)
21. Aug-03-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(24904995660000)` minting `24_904_995.660` PYUSD | See transaction [`0xecede3ce7a5c890196af5b456c8d59ee369495b0839cfb935eb69104e1dc9084`](https://etherscan.io/tx/0xecede3ce7a5c890196af5b456c8d59ee369495b0839cfb935eb69104e1dc9084)
22. Aug-03-2023 [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) (the proxy admin) executed `upgradeTo(0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020)` upgrading the proxy to the new implementation [`0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020`](https://etherscan.io/address/0xcaBB6024b77D50E0250b750C1f1Dc049E7eD6020) | See transaction [`0x34dcf26b3ad5a982f73617a8199c771ef86f8943482ae1e37d435afda60f6b9d`](https://etherscan.io/tx/0x34dcf26b3ad5a982f73617a8199c771ef86f8943482ae1e37d435afda60f6b9d)
23. Aug-04-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(1000000)` minting `1` PYUSD | See transaction [`0xddaac0cf9d9ac7110ab572e0adecf741d304a0b31d6d18f31c12839bb224c969`](https://etherscan.io/tx/0xddaac0cf9d9ac7110ab572e0adecf741d304a0b31d6d18f31c12839bb224c969)
24. Aug-04-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `decreaseSupply(1000000)` burning `1` PYUSD | See transaction [`0xaaf2b9dd07207da4e7d56c5f9b156e98cc78add804cd1e764c7232838187e82d`](https://etherscan.io/tx/0xaaf2b9dd07207da4e7d56c5f9b156e98cc78add804cd1e764c7232838187e82d)
25. Aug-04-2023 [`0xe25a329d385f77df5d4ed56265babe2b99a5436e`](https://etherscan.io/address/0xe25a329d385f77df5d4ed56265babe2b99a5436e) (the supply controller) executed `increaseSupply(10000000)` minting `10` PYUSD | See transaction [`0xf54992efde0ba3dc74afc00c256a6bc5fd91123d5f1360c0e88365969bb20db9`](https://etherscan.io/tx/0xf54992efde0ba3dc74afc00c256a6bc5fd91123d5f1360c0e88365969bb20db9)
26. Aug-07-2023 [`0x137dcd97872de27a4d3bf36a4643c5e18fa40713`](https://etherscan.io/address/0x137dcd97872de27a4d3bf36a4643c5e18fa40713) (the proxy admin) executed `upgradeTo(0xe17b8aDF8E46b15f3F9aB4Bb9E3b6e31Db09126E)` upgrading the proxy to the new implementation [`0xe17b8aDF8E46b15f3F9aB4Bb9E3b6e31Db09126E`](https://etherscan.io/address/0xe17b8aDF8E46b15f3F9aB4Bb9E3b6e31Db09126E) | See transaction [`0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f`](https://etherscan.io/tx/0xaac320d81132a42faa0f96b8c1db300a1e81c9deace0620b7ed553e351d8e26f)

After this transaction, I have collected another 11 transactions, but I'm not going to waste more time and space, they are just a bunch of `increaseSupply` and `decreaseSupply` that have happened after the date we were interested in (when the `PYUSD` contract was public released and finally upgraded). If you want to see all of them by yourself, you can dig into [this beefy JSON dump](https://gist.github.com/StErMi/97e53624c155c19b3d2137b96fc2582d) (note that the content format has been remodeled to feed my needs).

I wonder why they had to do all those supply increase/decrease (mint/burn) of the token **before** the actual release of the token to the public. Were they testing that everything was working correctly? Some of them were really in the past (November 2022)... Another question that only the people at PayPal or Paxos could answer for us...

For those of you that are interested in numbers, stats and information about the state of `PYUSD`, here is some info I have collected by aggregating those transactions. The last block I have collected data from is `18006261`.

- Total minted amount: `67_799_761_500_000 PYUSD` (~67.8 million dollars)
- Total burned amount: `2_550_1063_910_000 PYUSD` (~2.5 million dollars)
- Total supply amount: `42_298_697_590_000 PYUSD` (~42.3 million dollars)
- Proxy Address: [`0x6c3ea9036406852006290770bedfcaba0e23a0e8`](https://etherscan.io/token/0x6c3ea9036406852006290770bedfcaba0e23a0e8)
- Current Implementation used by `PYUSD` Proxy: [`0xe17b8adf8e46b15f3f9ab4bb9e3b6e31db09126e`](https://etherscan.io/address/0xe17b8adf8e46b15f3f9ab4bb9e3b6e31db09126e)
- Proxy Admin: [`0x137Dcd97872dE27a4d3bf36A4643c5e18FA40713`](https://etherscan.io/address/0x137Dcd97872dE27a4d3bf36A4643c5e18FA40713)
- PYUSD Owner: [`0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33`](https://etherscan.io/address/0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33)
- Supply Controller: [`0xE25a329d385f77df5D4eD56265babe2b99A5436e`](https://etherscan.io/address/0xE25a329d385f77df5D4eD56265babe2b99A5436e)
- Asset Protection Role: [`0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33`](https://etherscan.io/address/0x0644Bd0248d5F89e4F6E845a91D15c23591e5D33)

# Final Conclusion (for real this time)

First of all, I want to thank [Hari](https://twitter.com/_hrkrshnn) and [cmichel](https://twitter.com/cmichelio) for their support on Discord. They were so patient to listen to all my nonsense about this research 😁
Also, a shoutout to [devtooligan](https://twitter.com/devtooligan) and [emilebaizel](https://twitter.com/emilebaizel) that were both so kind to review the article and provide me some useful feedback about it.

At some point in the future, I will probably release the code that I used for the project. Currently, it's pretty messy because I was trying different paths to reach my goal and I would like to tidy it up a bit before sharing with you. So keep an eye on my Twitter account if you are interested in any updates on the matter!

I hope that you enjoyed this fun investigation I have made. Was it useful? Probably yes, at least for me. I was able to test some different approaches and tools and built an approach to deep dive into these kinds of investigations. The only regret that I have is that it took far more hours that I had anticipated, but I think that it's normal for the very first time in something... right?

Was it useful to you? As at least entertained a bit? Please let me know on my Twitter profile [@StErMi](https://twitter.com/StErMi)!
