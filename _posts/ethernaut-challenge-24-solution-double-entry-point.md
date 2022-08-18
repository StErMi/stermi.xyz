---
title: 'Ethernaut Challenge #24 Solution — Double Entry Point'
excerpt: This is Part 24 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of the challenge is to figure out where the bug is in `CryptoVault` and protect it from being drained out of tokens.
coverImage:
  url: '/assets/blog/ethernaut/double-entry-point.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-18T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/double-entry-point.svg'
---

This is Part 24 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.xyz/blog/lets-play-openzeppelin-ethernaut) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #24: Double Entry Point

> This level features a `CryptoVault` with special functionality, the `sweepToken` function. This is a common function to retrieve tokens stuck in a contract. The `CryptoVault` operates with an `underlying` token that can't be swept, being it an important core's logic component of the `CryptoVault`, any other token can be swept.
>
> The underlying token is an instance of the DET token implemented in `DoubleEntryPoint` contract definition and the `CryptoVault` holds 100 units of it. Additionally the `CryptoVault` also holds 100 of `LegacyToken LGT`.
>
> In this level you should figure out where the bug is in `CryptoVault` and protect it from being drained out of tokens.
>
> The contract features a `Forta` contract where any user can register its own `detection bot` contract. Forta is a decentralized, community-based monitoring network to detect threats and anomalies on DeFi, NFT, governance, bridges and other Web3 systems as quickly as possible. Your job is to implement a `detection bot` and register it in the `Forta` contract. The bot's implementation will need to raise correct alerts to prevent potential attacks or bug exploits.
>
> Things that might help:
>
> - How does a double entry point work for a token contract ?
>
> Level author(s): [OpenZeppelin](https://openzeppelin.com/), [Forta](https://forta.org/)

The goal of the challenge is to figure out where the bug is in `CryptoVault` and protect it from being drained out of tokens.

## Study the contracts

This challenge seems to be a join venture between OpenZeppelin and Forta, a Real-time security & operational monitoring. As far as I can see, it's a challenge that try to explain to you how you should integrate the Forta system to monitor your contracts. Let's see how it goes.

From the description of the challenge (that tbh is not clear) we have two tokens: `LegacyToken` that as the name imply was a token that has been "deprecated" (does this happen in real life?) in favor of a new one called `DoubleEntryPoint`.

We also have a Vault called `CryptoVault` that has some functionalities (not relevant in the scope of the challenge) and offers a utility method called `sweepToken(IERC20 token)` that allows anyone to "sweep" (transfer) toward `sweptTokensRecipient` (an address defined at deployment time) tokens that have been sent to the Vault accidentally. The only check inside that function is that you cannot sweep the `underlying` token of the Vault.

At deployment time, we start with this configuration:

- `CryptoVault` holds **100 DET** (`DoubleEntryToken`)
- `CryptoVault` holds **100 LGT** (`LegacyToken`)

Our goal is to create a **Forta DetectionBot** that monitor the contracts and prevent an external attacker to drain the `CryptoVault` from draining tokens that should not be drained.

Let's review each contract and see if we can find some vector of attack.

### `LegacyToken.sol`

```solidity
contract LegacyToken is ERC20("LegacyToken", "LGT"), Ownable {
    DelegateERC20 public delegate;

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function delegateToNewContract(DelegateERC20 newContract) public onlyOwner {
        delegate = newContract;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (address(delegate) == address(0)) {
            return super.transfer(to, value);
        } else {
            return delegate.delegateTransfer(to, value, msg.sender);
        }
    }
}
```

It's an `ERC20` token that inherit from `Ownable`. The `owner` of the contract can `mint` new tokens and update the value of the `delegate` variable by calling `delegateToNewContract`.

The strange part is inside the `transfer` function that has overridden the default one offered by the `ERC20` standard.

If there's no delegate defined (`address(delegate) == address(0)`) the contract use the default logic of the `ERC20` standard; otherwise it executes `return delegate.delegateTransfer(to, value, msg.sender)`.

In this case, `delegate` is the `DoubleEntryPoint` contract itself. What does it mean? That when you perform a transfer on `LegacyToken` in reality it is forwarding the operation to execute `DoubleEntryPoint.delegateTransfer`. Let's switch to the other token code to see what's going on

### `DoubleEntryPoint.sol`

```solidity
contract DoubleEntryPoint is ERC20("DoubleEntryPointToken", "DET"), DelegateERC20, Ownable {
    address public cryptoVault;
    address public player;
    address public delegatedFrom;
    Forta public forta;

    constructor(
        address legacyToken,
        address vaultAddress,
        address fortaAddress,
        address playerAddress
    ) public {
        delegatedFrom = legacyToken;
        forta = Forta(fortaAddress);
        player = playerAddress;
        cryptoVault = vaultAddress;
        _mint(cryptoVault, 100 ether);
    }

    modifier onlyDelegateFrom() {
        require(msg.sender == delegatedFrom, "Not legacy contract");
        _;
    }

    modifier fortaNotify() {
        address detectionBot = address(forta.usersDetectionBots(player));

        // Cache old number of bot alerts
        uint256 previousValue = forta.botRaisedAlerts(detectionBot);

        // Notify Forta
        forta.notify(player, msg.data);

        // Continue execution
        _;

        // Check if alarms have been raised
        if (forta.botRaisedAlerts(detectionBot) > previousValue) revert("Alert has been triggered, reverting");
    }

    function delegateTransfer(
        address to,
        uint256 value,
        address origSender
    ) public override onlyDelegateFrom fortaNotify returns (bool) {
        _transfer(origSender, to, value);
        return true;
    }
}
```

The contract is a normal `ERC20` token that inherit from both `DelegateERC20` and `Ownable`. `DelegateERC20` is an interface that forces the contract to implement the `function delegateTransfer(address to, uint256 value, address origSender)` function needed by `LegacyToken` token.

At `constructor` time, some state variable are set and `100` tokens are minted to the `CryptoVault`.

Before jumping into the `delegateTransfer` function, let's review the `fortaNotify` function modifier

```solidity
modifier fortaNotify() {
    address detectionBot = address(forta.usersDetectionBots(player));

    // Cache old number of bot alerts
    uint256 previousValue = forta.botRaisedAlerts(detectionBot);

    // Notify Forta
    forta.notify(player, msg.data);

    // Continue execution
    _;

    // Check if alarms have been raised
    if (forta.botRaisedAlerts(detectionBot) > previousValue) revert("Alert has been triggered, reverting");
}
```

What this modifier does is to trigger some logic implemented by the Forta detection system. It stores locally the number of alerts raised **before** executing the code function and compare that number with the number of alerts raised **after** executing the body of the function that call the function modifier.

If the number of alerts has increased, the transaction will **revert** with the message `"Alert has been triggered, reverting"`.

Let's review the important function that is also used by the `LegacyToken` token when the "legacy" `LegacyToken.transfer` is called.

```solidity
function delegateTransfer(
    address to,
    uint256 value,
    address origSender
) public override onlyDelegateFrom fortaNotify returns (bool) {
    _transfer(origSender, to, value);
    return true;
}
```

If you look at the list of function modifiers, you see that

- `onlyDelegateFrom` allows only the `delegateFrom` to call this function. In this case, only `LegacyToken` contract is allowed to call this function that otherwise would allow anyone to call `_transfer` (that is the low-level ERC20 transfer) from `origSender`
- `fortaNotify` is a special function modifiers that trigger some specific Forta logic like we have seen before

The function itself is pretty simple, it calls the ERC20 internal implementation of the `_transfer` function. Bear in mind that `_transfer` only check that `to` and `origSender` are not `address(0)` and that `origSender` has enough tokens to transfer to `to` (it also checks under/overflow conditions) but it does not check that `origSender` is `msg.sender` or that the spender has enough allowance. That's why we have the `onlyDelegateFrom` modifier.

### `CryptoVault.sol`

```solidity
contract CryptoVault {
    address public sweptTokensRecipient;
    IERC20 public underlying;

    constructor(address recipient) public {
        sweptTokensRecipient = recipient;
    }

    function setUnderlying(address latestToken) public {
        require(address(underlying) == address(0), "Already set");
        underlying = IERC20(latestToken);
    }

    /*
    ...
    */

    function sweepToken(IERC20 token) public {
        require(token != underlying, "Can't transfer underlying token");
        token.transfer(sweptTokensRecipient, token.balanceOf(address(this)));
    }
}
```

The contract should implement the logic of a normal crypto Vault system. That part of the logic is not interesting for the scope of the challenge.

As any vault also `CryptoVault` has an underlying token that in this case is `DoubleEntryPoint`.

The `sweepToken` function, that can be called by anyone, allow the vault to transfer the whole vault balance of an arbitrary `token` (specified as an input parameter) to `sweptTokensRecipient`. The recipient should be secure, given that is initialized by the deployer of the contract at `constructor` time.

As you can see from the code, the only check that is done is to prevent the Vault to transfer the `underlying` token.

### Find the exploit and prevent it by deploying a Forta DetectionBot

By combining all the information we have gathered, have you spot which is the bug we can exploit? To recap the current knowledge we have:

- `CryptoVault`'s `underlying` token is `DoubleEntryPoint`. The contract offers a `sweepToken` to transfers tokens in the Vault, but it prevents to sweep the `DoubleEntryPoint` token (because it's the `underlying`)
- `DoubleEntryPoint` token is an ERC20 token that implements a custom `delegateTransfer` function callable only by `LegacyToken` token and that is monitored by Forta by executing the `fortaNotify` function modifier. The function allows the delegator to transfer an amount of token from `origSpender` to an arbitrary recipient
- `LegacyToken` is an ERC20 token that has been "deprecated". When the `transfer(address to, uint256 value)` function is called the `DoubleEntryPoint` (the "new release" of the token) `delegate.delegateTransfer(to, value, msg.sender)` is called

Where's the problem? Because `LegacyToken.transfer` is "mirroring" `DoubleEntryPoint.transfer` this mean that when you ask you try to transfer 1 `LegacyToken` in reality you are transferring 1 `DoubleEntryPoint` token (to be able to do so you must have both of them in your balance)

The `CryptoVault` contains 100 of both tokens, but the `sweepToken` is preventing only the transfer of the `underlying` `DoubleEntryPoint`.

But by knowing how `LegacyToken` works, we can easily sweep all the `DoubleEntryPoint` tokens by calling `CryptoVault.sweep(address(legacyTokenContract))`.

Now that we know how to exploit it, how can we leverage the Forta integration to **prevent** the exploit and revert the transaction? We can build a contract that extends Forta `IDetectionBot` and plug it into the `DoubleEntryPoint`. By doing that, we should be able to prevent the exploit when the Vault `sweepToken` trigger the `LegacyToken.transfer` that will trigger the `DoubleEntryPoint.delegateTransfer` that will trigger (before executing the function code) the `fortaNotify` function modifier. Yes, I know the chain of execution is pretty deep, but bear with me, we got this!

The `IDetectionBot` contract interface has only one function signature `function handleTransaction(address user, bytes calldata msgData) external;` that will be called directly by the `DoubleEntryPoint.delegateTransfer` with these parameters `forta.notify(player, msg.data)`.

Inside the `DetectionBot` we will raise an alert only if both of these conditions are true:

- the original sender (who is calling `DoubleEntryPoint.delegateTransfer`) is `CryptoVault`
- the signature of the calling function (first 4 bytes of the `calldata`) is equal to `delegateTransfer` signature

Let's extract the `origSender` value from `msgData` (remember that in this case, that parameter value is equal to `msg.data`). If you look at the Solidity Documentation for [Block and Transaction Properties](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#block-and-transaction-properties) under the Special Variables and Functions section, you see that `msg.data` is a `bytes calldata` type of data that represents the **complete calldata**. What does it mean? That inside those bytes you will have both the function selector (4 bytes) and the function payload.

To extract the parameters, we can simply use the `abi.decode` like this `(address to, uint256 value, address origSender) = abi.decode(msgData[4:], (address, uint256, address));`. An important note: we are assuming that inside those bytes there are three values of those specific types in those specific orders. We are making a really **hard assumption**. That's why we need to combine this information with the fact that the function signature match the one from `delegateTransfer` that enforce these type and order requirements.

The second part is pretty easy, we just reconstruct the calling signature by merging the first 4 bytes of the `msgData` like this `bytes memory callSig = abi.encodePacked(msgData[0], msgData[1], msgData[2], msgData[3]);` and we compare it to what we know is the correct signature of `delegateTransfer` → `abi.encodeWithSignature("delegateTransfer(address,uint256,address)")`

## Solution code

Let's see the whole code of the detection `DetectionBot`

```solidity
contract DetectionBot is IDetectionBot {
    address private monitoredSource;
    bytes private monitoredSig;

    constructor(address _monitoredSource, bytes memory _monitoredSig) public {
        monitoredSource = _monitoredSource;
        monitoredSig = _monitoredSig;
    }

    function handleTransaction(address user, bytes calldata msgData) external override {
        (address to, uint256 value, address origSender) = abi.decode(msgData[4:], (address, uint256, address));

        bytes memory callSig = abi.encodePacked(msgData[0], msgData[1], msgData[2], msgData[3]);

        if (origSender == monitoredSource && keccak256(callSig) == keccak256(monitoredSig)) {
            IForta(msg.sender).raiseAlert(user);
        }
    }
}
```

Inside the constructor, the first parameter will be the source we want to monitor that in this case is the address of the `CryptoVault` and the second one will be the signature of the function we intend to monitor that in this case is `abi.encodeWithSignature("delegateTransfer(address,uint256,address)")`.

Now we just need to deploy the bot passing the correct parameters and plug the bot inside the Forta system and solve the challenge. Let's go!

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Create and deploy the `DetectionBot` with the correct constructor paramter
    // The first one is the source we want to monitor
    // The second one is the signature of the function we want to match
    DetectionBot bot = new DetectionBot(
        level.cryptoVault(),
        abi.encodeWithSignature("delegateTransfer(address,uint256,address)")
    );

    // add the bot to the Forta network detection system that monitor the `DoubleEntryPoint` contract
    level.forta().setDetectionBot(address(bot));

    vm.stopPrank();
}
```

You can read the full solution of the challenge opening [DoubleEntryPoint.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/DoubleEntryPoint.t.sol)

## Further reading

- [Forta Documentation](https://docs.forta.network/en/latest/quickstart/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
