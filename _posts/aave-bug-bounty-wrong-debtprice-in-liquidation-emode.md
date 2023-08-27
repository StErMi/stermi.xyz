---
title: 'Aave v3 bug bounty part 2: Aave liquidation process uses the wrong `debtPriceSource` if the user is in e-mode, the e-mode has a custom oracle and the debt token has been removed from the e-mode category'
excerpt: Learn more about how the liquidation process of Aave could end up using the wrong debt token price when the user is in e-mode and the debt token is removed from the e-mode category. If you like to think about edge case, this is the blog post for you!
coverImage:
  url: '/assets/blog/aave.png'
  credit:
    name: Aave.com
    url: https://aave.com/
date: '2023-08-27T17:00:00.000Z'
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

If the user is in [e-mode (efficiency mode)](https://docs.aave.com/faq/aave-v3-features#high-efficiency-mode-e-mode) it means that all the assets that have been supplied and borrowed belong to the same e-mode category of the user.

During the liquidation process, Aave is making the wrong assumption that, if the user is in e-mode and the e-mode category has been configured with a custom oracle, both the collateral and debt asset are using the same e-mode category custom oracle.

This assumption would be normally correct (if you are in e-mode you can only supply and borrow assets that are in the same e-mode category) but there are some specific edge cases where it would not be true.

If the borrowed asset depegs from the e-mode oracle price and Aave removes such asset from the e-mode category, two different scenarios could happen:

- Scenario 1: borrowed asset has a higher price compared to the e-mode oracle price. In this case, Aave will be left with bad debts because liquidators will not be incentivized to liquidate such debts
- Scenario 2: borrowed asset has a lower price compared to the e-mode oracle price. Liquidators would get more collateral than deserved to liquidate the debt

## How the amount of debt and collateral is calculated during a liquidation process

The [`LiquidationLogic.executeLiquidationCall`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/LiquidationLogic.sol#L85-L242) uses the following code to determine the `collateralAToken`, `collateralPriceSource`, `debtPriceSource` and `liquidationBonus` to be used during the liquidation process

```solidity
(
  vars.collateralAToken,
  vars.collateralPriceSource,
  vars.debtPriceSource,
  vars.liquidationBonus
) = _getConfigurationData(eModeCategories, collateralReserve, params);
```

If we look inside the code of [`_getConfigurationData`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/LiquidationLogic.sol#L395-L448) we can see that if the user has e-mode enabled (`userEModeCategory != 0`) the function checks if the price source to be used for the `collateralPriceSource` and `debtPriceSource` is the one from the e-mode or the default one of the asset itself.

```solidity
function _getConfigurationData(
  mapping(uint8 => DataTypes.EModeCategory) storage eModeCategories,
  DataTypes.ReserveData storage collateralReserve,
  DataTypes.ExecuteLiquidationCallParams memory params
)
  internal
  view
  returns (
    IAToken,
    address,
    address,
    uint256
  )
{
  IAToken collateralAToken = IAToken(collateralReserve.aTokenAddress);
  uint256 liquidationBonus = collateralReserve.configuration.getLiquidationBonus();

  address collateralPriceSource = params.collateralAsset;
  address debtPriceSource = params.debtAsset;

  if (params.userEModeCategory != 0) {
    address eModePriceSource = eModeCategories[params.userEModeCategory].priceSource;

    if (
      EModeLogic.isInEModeCategory(
        params.userEModeCategory,
        collateralReserve.configuration.getEModeCategory()
      )
    ) {
      liquidationBonus = eModeCategories[params.userEModeCategory].liquidationBonus;

      if (eModePriceSource != address(0)) {
        collateralPriceSource = eModePriceSource;
      }
    }

    // when in eMode, debt will always be in the same eMode category, can skip matching category check
    if (eModePriceSource != address(0)) {
      debtPriceSource = eModePriceSource;
    }
  }

  return (collateralAToken, collateralPriceSource, debtPriceSource, liquidationBonus);
}
```

In particular, we can see that if the user is in e-mode, the function assumes that if the `eModePriceSource != address(0)` the `debtPriceSource` must be equal to the price source used for the e-mode category.

This assumption is made because if the user is in e-mode, he **should be able** to borrow **only** assets that belong to the user's e-mode.

This is **not a correct assumption** because an asset could be removed from the e-mode (there's nothing that prevents it) by the `poolAdmin`.

Let's assume this scenario:

- e-mode is using a custom oracle to determine the price (`eModePriceSource != address(0)`)
- The debt asset that is being liquidated has been removed from e-mode

Given such premises, the liquidation function is going to use the wrong `debtPriceSource` to calculate the amount of collateral that the liquidator will receive by liquidating the debt. In the specific case, they will use the e-mode custom oracle price instead of **the current and real** asset's price.

Let's build some examples to explain the problem and see the consequences.
All the examples will start with a common scenario.

`DAI` and `USDC` belong to the same e-mode category. Let's assume that the category has the following parameters

- LTV: 98%
- LT: 98%
- LB: 0% (In the test case it's 1% because otherwise it would revert for misconfiguration, but it's fine for just showcasing here)
- Oracle Price: $1

Legends:

- LTV = Loan to Value
- LT = Liquidation Threshold
- LB = Liquidation Bonus
- HF = Health Factor

## Scenario 1: `USDC` depegs to $2, Aave left with bad debts that liquidators won't liquidate

- Alice supplies `100 DAI` worth $100
- Bob supplies `100 USDC` worth $100
- Alice borrows `98 USDC` worth $98 (LTV 98%, LT 98%)

At this point, the `USDC` price depegs from the e-mode category oracle price and increases to $2. Aave will remove `USDC` from the e-mode category list because the price has depegged, and it does not meet the same criteria to belong to an e-mode category.

I think that removing it from the e-mode is the only option because otherwise Aave would have to remove the oracle price and all the assets in the e-mode category would default to their original price. Considering that in the same e-category basket there are more than two assets (not like we have in our simple example) the side effects would be much worse than removing only one asset that has depegged (it's the one that diverge from the e-mode standard) is a better solution.

Because of `USDC` depegs going up to $2 and because it has been removed from the e-mode asset list, the new Alice's HF has been reduced, and it's lower than the `CLOSE_FACTOR_HF_THRESHOLD (0.95e18)` threshold. Because of this, Alice collateral can be fully liquidated at 100% (see [`_calculateDebt`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/LiquidationLogic.sol#L382-L392)). To be clear, the problem would still be there even if the close factor would be the default one (50%).

Let's follow the path of the liquidation process now via [`LiquidationLogic.executeLiquidationCall`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/LiquidationLogic.sol#L85-L242) where a liquidator tries to liquidate the `USDC` debt to get the `DAI` collateral of Alice.

After calculating the HF, the logic executes

```solidity
(vars.userVariableDebt, vars.userTotalDebt, vars.actualDebtToLiquidate) = _calculateDebt(
  vars.debtReserveCache,
  params,
  vars.healthFactor
);
```

- `userVariableDebt = 98 USDC`
- `userTotalDebt = 98 USDC`
- `actualDebtToLiquidate = 98 USDC`

`ValidationLogic.validateLiquidationCall` will pass because the user can be liquidated

At this point, the logic executes

```solidity
(
  vars.collateralAToken,
  vars.collateralPriceSource,
  vars.debtPriceSource,
  vars.liquidationBonus
) = _getConfigurationData(eModeCategories, collateralReserve, params);
```

As we already saw inside the function, we have the main issue where Aave assumes that if the user is in e-mode, it means that the borrowed asset price source is the same one used in the e-mode

```solidity
function _getConfigurationData(
  mapping(uint8 => DataTypes.EModeCategory) storage eModeCategories,
  DataTypes.ReserveData storage collateralReserve,
  DataTypes.ExecuteLiquidationCallParams memory params
)
  internal
  view
  returns (
    IAToken,
    address,
    address,
    uint256
  )
{
  IAToken collateralAToken = IAToken(collateralReserve.aTokenAddress);
  uint256 liquidationBonus = collateralReserve.configuration.getLiquidationBonus();

  address collateralPriceSource = params.collateralAsset;
  address debtPriceSource = params.debtAsset;

  if (params.userEModeCategory != 0) {
    address eModePriceSource = eModeCategories[params.userEModeCategory].priceSource;

    if (
      EModeLogic.isInEModeCategory(
        params.userEModeCategory,
        collateralReserve.configuration.getEModeCategory()
      )
    ) {
      liquidationBonus = eModeCategories[params.userEModeCategory].liquidationBonus;

      if (eModePriceSource != address(0)) {
        collateralPriceSource = eModePriceSource;
      }
    }

    // when in eMode, debt will always be in the same eMode category, can skip matching category check
    if (eModePriceSource != address(0)) {
      debtPriceSource = eModePriceSource;
    }
  }

  return (collateralAToken, collateralPriceSource, debtPriceSource, liquidationBonus);
}
```

To be specific, the problem is inside this part of the code

```solidity
    // when in eMode, debt will always be in the same eMode category, can skip matching category check
    if (eModePriceSource != address(0)) {
      debtPriceSource = eModePriceSource;
    }
```

The result of the execution is the following

- `collateralAToken` the `AToken` of the underlying collateral
- `collateralPriceSource` will be equal to the Oracle Price source (from `eModePriceSource`) (in our example) but it does not matter
- `debtPriceSource` will be equal to the Oracle Price source (from `eModePriceSource`), while **it should be equal to the `USDC` oracle price**
- `liquidationBonus` the LB that in this case comes from the e-mode category because `DAI` is in e-mode and matches the user's e-mode, but it is not relevant for the issue

Now we calculate the amount of collateral to be liquidated, the debt to be liquidated and the protocol fee

```solidity
(
  vars.actualCollateralToLiquidate,
  vars.actualDebtToLiquidate,
  vars.liquidationProtocolFeeAmount
) = _calculateAvailableCollateralToLiquidate(
  collateralReserve,
  vars.debtReserveCache,
  vars.collateralPriceSource,
  vars.debtPriceSource,
  vars.actualDebtToLiquidate,
  vars.userCollateralBalance,
  vars.liquidationBonus,
  IPriceOracleGetter(params.priceOracle)
);
```

Let's assume that there's no protocol fees (just remove complexity for the example) and see the calculation done by the function

```solidity
// This is the base collateral to liquidate based on the given debt to cover
vars.baseCollateral =
  ((vars.debtAssetPrice * debtToCover * vars.collateralAssetUnit)) /
  (vars.collateralPrice * vars.debtAssetUnit);

vars.maxCollateralToLiquidate = vars.baseCollateral.percentMul(liquidationBonus);

if (vars.maxCollateralToLiquidate > userCollateralBalance) {
  vars.collateralAmount = userCollateralBalance;
  vars.debtAmountNeeded = ((vars.collateralPrice * vars.collateralAmount * vars.debtAssetUnit) /
    (vars.debtAssetPrice * vars.collateralAssetUnit)).percentDiv(liquidationBonus);
} else {
  vars.collateralAmount = vars.maxCollateralToLiquidate;
  vars.debtAmountNeeded = debtToCover;
}
```

Following the calculation and simplifying things

`baseCollateral = (USDC_e-mode-oracle-price * 98 USDC) / DAI_e-mode-oracle-price = ($1 * 98 USDC) / $1 = 98 DAI` and in this case, we enter the `else` (but even entering the `if` would result in the same problem).

By following the calculation, `baseCollateral` will be equal to 98 DAI because `debtAssetPrice == $1` (it's using the e-mode category price oracle and not the `USDC` oracle price) so

- `vars.actualCollateralToLiquidate = 98 DAI` equal to $98
- `vars.actualDebtToLiquidate = 98 USDC` worth $196 (because the real USDC price is $2)
- `vars.liquidationProtocolFeeAmount = 0` (just for simplicity, as we explained)

In a normal scenario (without the bug) to repay `98 USDC` debt (worth $196) the liquidator would get `196 DAI` + the liquidation bonus (in this very specific case)

At this point, we follow the normal flow of the liquidation.

### Conclusion & Results about Scenario 1

The conclusion is that the liquidator to liquidate `98 USDC` worth $196 of debt would only get `98 DAI` worth $98.

No liquidator would want to liquidate that debt, and Aave would remain with all the bad debt generated by the `USDC` borrows made by the users. Without liquidating the debt, suppliers would not be able to withdraw the supplied `USDC`.

## Scenario 2: `USDC` depegs to $0.5, liquidators would get more collateral than deserved to liquidate the debt

- Alice supplies 100 `DAI` worth $100
- Alice supplies 1 `wETH` worth $1000
- Bob supplies 200 `USDC` worth $100
- Alice borrows 200 `USDC` worth $200

In this example, two things happen to be able to make Alice liquidable

- `USDC` price depegs and decreases to $0.5
- `wETH` just goes to $1 just to make the HF factor of Alice low enough to be able to be liquidated. But it really is not relevant, we just need to make Alice be liquidable for any reason.

At this point, Aave will follow the same procedure followed for the scenario explained before and will remove `USDC` from the asset that belongs to the e-mode category. Let's skip all the explanation done before because the problem is the same, and we will just look at the final calculations

```solidity
// This is the base collateral to liquidate based on the given debt to cover
vars.baseCollateral =
  ((vars.debtAssetPrice * debtToCover * vars.collateralAssetUnit)) /
  (vars.collateralPrice * vars.debtAssetUnit);

vars.maxCollateralToLiquidate = vars.baseCollateral.percentMul(liquidationBonus);

if (vars.maxCollateralToLiquidate > userCollateralBalance) {
  vars.collateralAmount = userCollateralBalance;
  vars.debtAmountNeeded = ((vars.collateralPrice * vars.collateralAmount * vars.debtAssetUnit) /
    (vars.debtAssetPrice * vars.collateralAssetUnit)).percentDiv(liquidationBonus);
} else {
  vars.collateralAmount = vars.maxCollateralToLiquidate;
  vars.debtAmountNeeded = debtToCover;
}
```

Like before `baseCollateral = (USDC_e-mode-oracle-price * 200 USDC) / DAI_e-mode-oracle-price = ($1 * 200 USDC) / $1`

In this case, would enter the `if` branch and recalculate the values because Alice has not enough collateral (she only owns `100 DAI` worth $100) and we end up with

`collateralAmount = 100 DAI`
`debtAmountNeeded = (DAI_e-mode-oracle-price * 100 DAI) / USDC_e-mode-oracle-price = ($1 * 100 DAI) / $1 = 100 USDC`

**This means that to repay a debt of `100 USDC` (worth $50) a liquidator would get back `100 DAI` (worth 100 dollars).**

Without the bug, USDC would be priced $0.5, and it would mean that `baseCollateral` would be equal to `$0.5 * 200 USDC / $1 = 100 DAI` so to cover `200 USDC` debt (worth $100) the liquidator would correctly get `100 DAI` (worth 100 dollars) + liquidation bonus

### Conclusion & Results about Scenario 2

The conclusion is that the liquidator, to liquidate `200 USDC`, worth $100 of debt, would get back `200 DAI` worth $200 (plus liquidation bonus). This means that liquidators would get far more than what they should deserve to liquidate the debt.

In this case, any liquidator would be willing to liquidate the debt, but the borrower would get its collateral liquidated by a factor much higher than it should be.

## How to resolve the issue

Inside the [`LiquidationLogic._getConfigurationData`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/LiquidationLogic.sol#L395-L448) Aave should not assume that the e-mode of the `debtAsset` is in the same e-mode as the user's e-mode and use the `eModePriceSource` only if the `debtReserve.configuration.getEModeCategory()` is equal to the user's e-mode category and if the `eModePriceSource != address(0)`

Here's an example of a possible solution

```diff
function _getConfigurationData(
  mapping(uint8 => DataTypes.EModeCategory) storage eModeCategories,
  DataTypes.ReserveData storage collateralReserve,
  DataTypes.ExecuteLiquidationCallParams memory params
)
  internal
  view
  returns (
    IAToken,
    address,
    address,
    uint256
  )
{
  // ..
  // OTHER CODE
  // ..

  if (params.userEModeCategory != 0) {
    address eModePriceSource = eModeCategories[params.userEModeCategory].priceSource;

    // ..
    // CHECK COLLATERAL CODE
    // ..

+    if (
+      EModeLogic.isInEModeCategory(
+        params.userEModeCategory,
+        debtReserve.configuration.getEModeCategory()
+      )
+    ) {
+
+      if (eModePriceSource != address(0)) {
+        debtPriceSource = eModePriceSource;
+      }
+    }

-    // when in eMode, debt will always be in the same eMode category, can skip matching category check
-    if (eModePriceSource != address(0)) {
-      debtPriceSource = eModePriceSource;
-    }
  }

  return (collateralAToken, collateralPriceSource, debtPriceSource, liquidationBonus);
}
```

## Test case for scenario 1

```typescript
import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../helpers/constants'
import { ProtocolErrors, RateMode } from '../helpers/types'
import { convertToCurrencyDecimals } from '../helpers/contracts-helpers'
import { makeSuite, TestEnv } from './helpers/make-suite'
import { getReserveData, getUserData } from './helpers/utils/helpers'
import './helpers/utils/wadraymath'
import { evmRevert, evmSnapshot, waitForTx } from '@aave/deploy-v3'

makeSuite(
  'POC USDC depeg to $2, AAVE left with bad debts that liquidators wont liquidate',
  (testEnv: TestEnv) => {
    const { INVALID_HF } = ProtocolErrors

    let snap: string

    const CATEGORY = {
      id: BigNumber.from('1'),
      ltv: BigNumber.from('9800'),
      lt: BigNumber.from('9800'),
      lb: BigNumber.from('10100'),
      oracle: ZERO_ADDRESS,
      label: 'STABLECOINS',
    }

    before(async () => {
      const { addressesProvider, oracle } = testEnv
      await waitForTx(await addressesProvider.setPriceOracle(oracle.address))
      snap = await evmSnapshot()
    })

    after(async () => {
      const { aaveOracle, addressesProvider } = testEnv
      await waitForTx(
        await addressesProvider.setPriceOracle(aaveOracle.address)
      )
    })

    it('POC EXECUTION', async () => {
      await evmRevert(snap)
      snap = await evmSnapshot()

      // TEST configuration
      const {
        helpersContract,
        oracle,
        configurator,
        pool,
        poolAdmin,
        dai,
        usdc,
        weth,
        aDai,
        users: [user1, user2],
      } = testEnv

      const EMODE_ORACLE_ADDRESS = user1.address
      await oracle.setAssetPrice(EMODE_ORACLE_ADDRESS, utils.parseUnits('1', 8))
      await oracle.setAssetPrice(dai.address, utils.parseUnits('0.99', 8))
      await oracle.setAssetPrice(usdc.address, utils.parseUnits('1.01', 8))

      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setEModeCategory(
            1,
            CATEGORY.ltv,
            CATEGORY.lt,
            CATEGORY.lb,
            EMODE_ORACLE_ADDRESS,
            CATEGORY.label
          )
      )

      const categoryData = await pool.getEModeCategoryData(CATEGORY.id)

      expect(categoryData.ltv).to.be.equal(
        CATEGORY.ltv,
        'invalid eMode category ltv'
      )
      expect(categoryData.liquidationThreshold).to.be.equal(
        CATEGORY.lt,
        'invalid eMode category liq threshold'
      )
      expect(categoryData.liquidationBonus).to.be.equal(
        CATEGORY.lb,
        'invalid eMode category liq bonus'
      )
      expect(categoryData.priceSource).to.be.equal(
        EMODE_ORACLE_ADDRESS,
        'invalid eMode category price source'
      )

      // Add Dai and USDC to category
      await configurator
        .connect(poolAdmin.signer)
        .setAssetEModeCategory(dai.address, CATEGORY.id)
      await configurator
        .connect(poolAdmin.signer)
        .setAssetEModeCategory(usdc.address, CATEGORY.id)
      expect(
        await helpersContract.getReserveEModeCategory(dai.address)
      ).to.be.eq(CATEGORY.id)
      expect(
        await helpersContract.getReserveEModeCategory(usdc.address)
      ).to.be.eq(CATEGORY.id)

      // user1 supply 100 DAI
      const daiSupplyAmount = utils.parseUnits('100', 18)
      expect(await dai.connect(user1.signer)['mint(uint256)'](daiSupplyAmount))
      expect(
        await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      )
      expect(
        await pool
          .connect(user1.signer)
          .supply(dai.address, daiSupplyAmount, user1.address, 0)
      )

      // user2 supply 100 USDC
      const usdcSupplyAmount = utils.parseUnits('100', 6)
      expect(
        await usdc
          .connect(user2.signer)
          ['mint(uint256)'](usdcSupplyAmount.mul(10))
      )
      expect(
        await usdc.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
      )
      expect(
        await pool
          .connect(user2.signer)
          .supply(usdc.address, usdcSupplyAmount, user2.address, 0)
      )

      // user1 activate e-mode
      expect(await pool.connect(user1.signer).setUserEMode(CATEGORY.id))

      // user1 borrow 98 USDC
      const userData = await pool.getUserAccountData(user1.address)
      const toBorrow = userData.availableBorrowsBase.div(100)
      expect(
        await pool
          .connect(user1.signer)
          .borrow(usdc.address, toBorrow, RateMode.Variable, 0, user1.address)
      )

      // Get user1 HF before
      const userGlobalDataBefore = await pool.getUserAccountData(user1.address)
      expect(userGlobalDataBefore.healthFactor).to.be.gte(
        utils.parseUnits('1', 18)
      )
      console.log('userGlobalDataBefore', userGlobalDataBefore)

      // USDC price goes to 2$
      await oracle.setAssetPrice(
        usdc.address,
        (await oracle.getAssetPrice(usdc.address)).mul(2)
      )

      // Aave remove USDC from e-mode
      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setAssetEModeCategory(usdc.address, 0)
      )
      expect(
        await helpersContract.getReserveEModeCategory(usdc.address)
      ).to.be.eq(0)

      // Get user1 HF after
      const userGlobalDataAfter = await pool.getUserAccountData(user1.address)
      expect(userGlobalDataAfter.healthFactor).to.be.lt(
        utils.parseUnits('1', 18),
        INVALID_HF
      )
      console.log('userGlobalDataAfter', userGlobalDataAfter)

      // user2 liquidate user1
      const balanceADAICollateralBefore = await aDai.balanceOf(user1.address)
      const balanceUSDCBefore = await usdc.balanceOf(user2.address)
      console.log(
        'user1 aDAI collateral balance before liquidation',
        utils.formatUnits(balanceADAICollateralBefore, 18)
      )
      console.log(
        'user2 USDC balance before liquidation',
        utils.formatUnits(balanceUSDCBefore, 6)
      )

      await pool
        .connect(user2.signer)
        .liquidationCall(
          dai.address,
          usdc.address,
          user1.address,
          toBorrow,
          false
        )

      const balanceADAICollateralAfter = await aDai.balanceOf(user1.address)
      const balanceUSDCAfter = await usdc.balanceOf(user2.address)
      console.log(
        'user1 aDAI collateral balance after liquidation',
        utils.formatUnits(balanceADAICollateralAfter, 18)
      )
      console.log(
        'user2 USDC balance after liquidation',
        utils.formatUnits(balanceUSDCAfter, 6)
      )

      const collateralLiquidated = balanceADAICollateralBefore.sub(
        balanceADAICollateralAfter
      )
      const usdcNeededToPerformLiquidation =
        balanceUSDCBefore.sub(balanceUSDCAfter)
      console.log(
        'collateralLiquidated',
        utils.formatUnits(collateralLiquidated, 18)
      )
      console.log(
        'user2 USDC used to repay debt',
        utils.formatUnits(usdcNeededToPerformLiquidation, 6)
      )
    })
  }
)
```

## Test case for scenario 2

```typescript
import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../helpers/constants'
import { ProtocolErrors, RateMode } from '../helpers/types'
import { convertToCurrencyDecimals } from '../helpers/contracts-helpers'
import { makeSuite, TestEnv } from './helpers/make-suite'
import { getReserveData, getUserData } from './helpers/utils/helpers'
import './helpers/utils/wadraymath'
import { evmRevert, evmSnapshot, waitForTx } from '@aave/deploy-v3'
import { parseUnits } from 'ethers/lib/utils'

makeSuite(
  'POC Scenario 2: USDC depeg to $0.5, liquidators would get more collateral than deserved to liquidate the debt',
  (testEnv: TestEnv) => {
    const {
      INCONSISTENT_EMODE_CATEGORY,
      HEALTH_FACTOR_LOWER_THAN_LIQUIDATION_THRESHOLD,
      COLLATERAL_CANNOT_COVER_NEW_BORROW,
      INVALID_EMODE_CATEGORY_PARAMS,
      INVALID_HF,
    } = ProtocolErrors

    let snap: string

    const CATEGORY = {
      id: BigNumber.from('1'),
      ltv: BigNumber.from('9800'),
      lt: BigNumber.from('9800'),
      lb: BigNumber.from('10100'),
      oracle: ZERO_ADDRESS,
      label: 'STABLECOINS',
    }

    before(async () => {
      const { addressesProvider, oracle } = testEnv
      await waitForTx(await addressesProvider.setPriceOracle(oracle.address))
      snap = await evmSnapshot()
    })

    after(async () => {
      const { aaveOracle, addressesProvider } = testEnv
      await waitForTx(
        await addressesProvider.setPriceOracle(aaveOracle.address)
      )
    })

    it('POC EXECUTION', async () => {
      await evmRevert(snap)
      snap = await evmSnapshot()

      // TEST configuration
      const {
        helpersContract,
        oracle,
        configurator,
        pool,
        poolAdmin,
        dai,
        usdc,
        weth,
        aDai,
        users: [user1, user2],
      } = testEnv

      const EMODE_ORACLE_ADDRESS = user1.address
      await oracle.setAssetPrice(EMODE_ORACLE_ADDRESS, utils.parseUnits('1', 8))

      await oracle.setAssetPrice(dai.address, utils.parseUnits('0.99', 8))
      await oracle.setAssetPrice(usdc.address, utils.parseUnits('1.01', 8))
      await oracle.setAssetPrice(weth.address, utils.parseUnits('1000', 8))

      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setEModeCategory(
            1,
            CATEGORY.ltv,
            CATEGORY.lt,
            CATEGORY.lb,
            EMODE_ORACLE_ADDRESS,
            CATEGORY.label
          )
      )

      const categoryData = await pool.getEModeCategoryData(CATEGORY.id)

      expect(categoryData.ltv).to.be.equal(
        CATEGORY.ltv,
        'invalid eMode category ltv'
      )
      expect(categoryData.liquidationThreshold).to.be.equal(
        CATEGORY.lt,
        'invalid eMode category liq threshold'
      )
      expect(categoryData.liquidationBonus).to.be.equal(
        CATEGORY.lb,
        'invalid eMode category liq bonus'
      )
      expect(categoryData.priceSource).to.be.equal(
        EMODE_ORACLE_ADDRESS,
        'invalid eMode category price source'
      )

      // Add Dai and USDC to category
      await configurator
        .connect(poolAdmin.signer)
        .setAssetEModeCategory(dai.address, CATEGORY.id)
      await configurator
        .connect(poolAdmin.signer)
        .setAssetEModeCategory(usdc.address, CATEGORY.id)
      expect(
        await helpersContract.getReserveEModeCategory(dai.address)
      ).to.be.eq(CATEGORY.id)
      expect(
        await helpersContract.getReserveEModeCategory(usdc.address)
      ).to.be.eq(CATEGORY.id)

      // user1 supply 100 DAI
      const daiSupplyAmount = utils.parseUnits('100', 18)
      expect(await dai.connect(user1.signer)['mint(uint256)'](daiSupplyAmount))
      expect(
        await dai.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      )
      expect(
        await pool
          .connect(user1.signer)
          .supply(dai.address, daiSupplyAmount, user1.address, 0)
      )

      // user1 supply 1 WETH
      const wethSupplyAmount = utils.parseUnits('1', 18)
      expect(
        await weth.connect(user1.signer)['mint(uint256)'](wethSupplyAmount)
      )
      expect(
        await weth.connect(user1.signer).approve(pool.address, MAX_UINT_AMOUNT)
      )
      expect(
        await pool
          .connect(user1.signer)
          .supply(weth.address, wethSupplyAmount, user1.address, 0)
      )

      // user2 supply 200 USDC
      const usdcSupplyAmount = utils.parseUnits('200', 6)
      expect(
        await usdc
          .connect(user2.signer)
          ['mint(uint256)'](usdcSupplyAmount.mul(10))
      )
      expect(
        await usdc.connect(user2.signer).approve(pool.address, MAX_UINT_AMOUNT)
      )
      expect(
        await pool
          .connect(user2.signer)
          .supply(usdc.address, usdcSupplyAmount, user2.address, 0)
      )

      // user1 activate e-mode
      expect(await pool.connect(user1.signer).setUserEMode(CATEGORY.id))

      // user1 borrow 200 USDC
      const userData = await pool.getUserAccountData(user1.address)
      const toBorrow = parseUnits('200', 6)
      expect(
        await pool
          .connect(user1.signer)
          .borrow(usdc.address, toBorrow, RateMode.Variable, 0, user1.address)
      )

      // Get user1 HF before
      const userGlobalDataBefore = await pool.getUserAccountData(user1.address)
      expect(userGlobalDataBefore.healthFactor).to.be.gte(
        utils.parseUnits('1', 18)
      )
      console.log('userGlobalDataBefore', userGlobalDataBefore)

      // USDC price goes to 0.5$
      await oracle.setAssetPrice(
        usdc.address,
        (await oracle.getAssetPrice(usdc.address)).div(2)
      )

      // WETH prices goes down just to be able to liquidate
      await oracle.setAssetPrice(weth.address, utils.parseUnits('1', 8))

      // Aave remove USDC from e-mode
      expect(
        await configurator
          .connect(poolAdmin.signer)
          .setAssetEModeCategory(usdc.address, 0)
      )
      expect(
        await helpersContract.getReserveEModeCategory(usdc.address)
      ).to.be.eq(0)

      // Get user1 HF after
      const userGlobalDataAfter = await pool.getUserAccountData(user1.address)
      expect(userGlobalDataAfter.healthFactor).to.be.lt(
        utils.parseUnits('1', 18),
        INVALID_HF
      )
      console.log('userGlobalDataAfter', userGlobalDataAfter)

      // user2 liquidate user1
      const balanceADAICollateralBefore = await aDai.balanceOf(user1.address)
      const balanceUSDCBefore = await usdc.balanceOf(user2.address)
      console.log(
        'user1 aDAI collateral balance before liquidation',
        utils.formatUnits(balanceADAICollateralBefore, 18)
      )
      console.log(
        'user2 USDC balance before liquidation',
        utils.formatUnits(balanceUSDCBefore, 6)
      )

      await pool
        .connect(user2.signer)
        .liquidationCall(
          dai.address,
          usdc.address,
          user1.address,
          toBorrow,
          false
        )

      const balanceADAICollateralAfter = await aDai.balanceOf(user1.address)
      const balanceUSDCAfter = await usdc.balanceOf(user2.address)
      console.log(
        'user1 aDAI collateral balance after liquidation',
        utils.formatUnits(balanceADAICollateralAfter, 18)
      )
      console.log(
        'user2 USDC balance after liquidation',
        utils.formatUnits(balanceUSDCAfter, 6)
      )

      const collateralLiquidated = balanceADAICollateralBefore.sub(
        balanceADAICollateralAfter
      )
      const usdcNeededToPerformLiquidation =
        balanceUSDCBefore.sub(balanceUSDCAfter)
      console.log(
        'collateralLiquidated',
        utils.formatUnits(collateralLiquidated, 18)
      )
      console.log(
        'user2 USDC used to repay debt',
        utils.formatUnits(usdcNeededToPerformLiquidation, 6)
      )
    })
  }
)
```
