---
title: 'Aave v3 bug bounty part 1: Security concerns and improvements about the `executeFlashLoan` function'
excerpt: During the flashloan action, Aave is incorrectly calculating the flash loans fees `totalPremiums` that the user has to repay after the execution  when the user has decided that for that specific asset it will **open a borrow position**.
coverImage:
  url: '/assets/blog/aave.png'
  credit:
    name: Aave.com
    url: https://aave.com/
date: '2023-08-20T19:27:00.000Z'
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

When the user performs a flashloan action that ends up **opening a borrowing position** (instead of later repaying the flashloan), Aave is passing to the `receiver` the wrong amount of fees that the `receiver` needs to repay.

In this specific case, the user **does not have** to repay any flashloan fees. While Aave is not requesting back those premiums, they anyway tell to the `receiver` that it have to approve more tokens that are needed (flash loan amount + wrongly calculated premium that should instead be equal to zero). Because of this, the `receiver` could end up over-approving the Aave protocol. For more detail about the consequences and all the possible side effects, keep reading the blog post because I'm going very deep into the woods 😁

## `FlashloanLogic.executeFlashLoan` logic

[`FlashloanLogic.executeFlashLoan`](https://github.com/aave/aave-v3-core/blob/94e571f3a7465201881a59555314cd550ccfda57/contracts/protocol/libraries/logic/FlashLoanLogic.sol#L70-L167)  allows the user to take flashloan and for each asset flashloaned decide to return the flashloaned amount or create a borrow position for the same amount flashloaned.

The function also handles a `premium` amount that the user has to repay on top of the loaned `amount`.

This premium percentage used to calculate the premium amount that the user has to repay on top of the amount flashloaned is stored inside `vars.flashloanPremiumTotal` and is calculated like this

```solidity
(vars.flashloanPremiumTotal, vars.flashloanPremiumToProtocol) = params.isAuthorizedFlashBorrower
  ? (0, 0)
  : (params.flashLoanPremiumTotal, params.flashLoanPremiumToProtocol);
```

This variable is then used to calculate, for each flashloan asset in the request, the amount of premium that the user has to repay. The amount is stored in `vars.totalPremiums[vars.i]` and is calculated like this `vars.totalPremiums[vars.i] = vars.currentAmount.percentMul(vars.flashloanPremiumTotal);`

Let's see the logic executed

```solidity
for (vars.i = 0; vars.i < params.assets.length; vars.i++) {
  vars.currentAmount = params.amounts[vars.i];
  vars.totalPremiums[vars.i] = vars.currentAmount.percentMul(vars.flashloanPremiumTotal);
  IAToken(reservesData[params.assets[vars.i]].aTokenAddress).transferUnderlyingTo(
    params.receiverAddress,
    vars.currentAmount
  );
}
```

For each asset requested to be flashloaned, Aave performs the following actions:

- store the amount of underlying to send to the `receiver` (the smart contract that will receive the loan, execute the internal logic and then repay the loan)
- calculate and store the total premium that must be repaid
- send the underlying amount to the `receiverAddress`

After transferring the assets, it executes the `vars.receiver.executeOperation` in which the `receiver` must repay the amount received plus the premium or (depending on what has been chosen) Aave will open a borrow position for the `amount` sent to the `receiver`.

```solidity
require(
  vars.receiver.executeOperation(
    params.assets,
    params.amounts,
    vars.totalPremiums,
    msg.sender,
    params.params
  ),
  Errors.INVALID_FLASHLOAN_EXECUTOR_RETURN
);
```

The action performed by the `receiver` to comply with the Aave logic will be based on all the parameters that have been sent by Aave as inputs parameter of the `executeOperation` function.

After that, Aave will execute the part of the logic that, based on the user's flashloan parameter, will

- Verify if the `amount` has been repaid plus the `premium` if for the asset the user has specified `DataTypes.InterestRateMode(params.interestRateModes[vars.i]) == DataTypes.InterestRateMode.NONE`
- Otherwise open a borrow position equal to the `amount` flashloaned (that the user does not need to repay)

In the first case (repay the flashloan directly) Aave will call

```solidity
IERC20(params.asset).safeTransferFrom(
  params.receiverAddress,
  reserveCache.aTokenAddress,
  amountPlusPremium
);
```

but in the second case it will execute

```solidity
BorrowLogic.executeBorrow(
  reservesData,
  reservesList,
  eModeCategories,
  userConfig,
  DataTypes.ExecuteBorrowParams({
    asset: vars.currentAsset,
    user: msg.sender,
    onBehalfOf: params.onBehalfOf,
    amount: vars.currentAmount,
    interestRateMode: DataTypes.InterestRateMode(params.interestRateModes[vars.i]),
    referralCode: params.referralCode,
    releaseUnderlying: false,
    maxStableRateBorrowSizePercent: params.maxStableRateBorrowSizePercent,
    reservesCount: params.reservesCount,
    oracle: IPoolAddressesProvider(params.addressesProvider).getPriceOracle(),
    userEModeCategory: params.userEModeCategory,
    priceOracleSentinel: IPoolAddressesProvider(params.addressesProvider)
      .getPriceOracleSentinel()
  })
);
```

Because the underlying amount has been already sent to the `receiver` the `BorrowLogic.executeBorrow` function is executed with the option `releaseUnderlying` equal to `false`

## The premium amount to be repaid is wrongly calculated

In all this logic, there are two cases where the user **does not have to repay** the `premium` amount.

1. The user is part of the "flash borrower" list
2. The user has decided that for that specific asset flashloan it will open a borrow position

The difference is that, while in both cases users do not have to repay it, Aave is telling to a normal user (who is not part of the "flash borrower" list) that the `premium` amount to be repaid is greater than zero when that premium is passed down as an input of

```solidity
vars.receiver.executeOperation(
	params.assets,
	params.amounts,
	vars.totalPremiums,
	msg.sender,
	params.params
)
```

The wrong calculation is done inside this code snippet

```solidity
for (vars.i = 0; vars.i < params.assets.length; vars.i++) {
  vars.currentAmount = params.amounts[vars.i];
  vars.totalPremiums[vars.i] = vars.currentAmount.percentMul(vars.flashloanPremiumTotal);
  IAToken(reservesData[params.assets[vars.i]].aTokenAddress).transferUnderlyingTo(
    params.receiverAddress,
    vars.currentAmount
  );
}
```

### Conclusion and possible fix

A possible solution for the exposed calculation problem could be this one

```solidity
bool requirePremium = DataTypes.InterestRateMode(params.interestRateModes[vars.i]) == DataTypes.InterestRateMode.NONE;
vars.totalPremiums[vars.i] = requirePremium ? vars.currentAmount.percentMul(vars.flashloanPremiumTotal) : 0;
```

With this modification, if the user is in the "borrow list" list (`flashloanPremiumTotal` is already equal to zero) or if the user is opening a borrow position with the flashloan the premium that must be approved to be repaid after the flashloan will be `0`.

While I think that the wrong calculation of the premium amount does not impact directly the Aave security, Aave should anyway resolve the issue because of the possible side effects caused to integrators.

## Consequences on the integrator side

Let's assume that the integrator is **not part** of the "borrow list" list and use the flashloan to both create borrow positions and as a "normal" flashloan logic.

One problem that I could see is that the integrator that develop its flashloan receiver smart contract based on the [Aave mock example](https://github.com/aave/aave-v3-core/blob/master/contracts/mocks/flashloan/MockFlashLoanReceiver.sol) is that will **"over approve"** the amount that should be approved to the pool in the case of a flashloan-to-borrow scenario.

Let's assume that the integrator uses the mock example as the base of their contract, but makes some modification to know it needs to also approve the amount. The callback implementation will result in something like this

```solidity
  function executeOperation(
    address[] memory assets,
    uint256[] memory amounts,
    uint256[] memory premiums,
    address initiator,
    bytes calldata params
  ) public override returns (bool) {
    bool executeBorrow = abi.decode(params, (bool));

    for (uint256 i = 0; i < assets.length; i++) {
      //check the contract has the specified balance
      require(
        amounts[i] <= IERC20(assets[i]).balanceOf(address(this)),
        'Invalid balance for the contract'
      );

      // if I'm using borrow do not send the amount flashloaned
      uint256 amountToReturn = executeBorrow ? premiums[i] : amounts[i] + premiums[i];

      IERC20(assets[i]).safeApprove(address(POOL), amountToReturn);
    }

    emit ExecutedWithSuccess(assets, amounts, premiums);

    return true;
  }
```

As I already showcased in the previous part, when the `Pool.flashloan` is called with `amount = X` and interest mode equal to 1 (stable) or 2 (variable) Aave will pass to the callback `amounts = X` and `premiums = X % premiumPercent` while it should be (in this specific context of flasloan-to-borrow) equal to zero instead.

In this case, two problems arise

1. The integrator will approve the `premium` that will never be consumed by Aave during the borrowing process
2. The `ExecutedWithSuccess` logging (that I assume some integrator will have) logs a wrong value for premium that should be an array of 0 while instead will contain premium values greater than zero

## Edge case with `USDT` and `USDT`-token-like

An even bigger problem exists with tokens like `USDT` that

1. will make the integrator reverts because they do not follow the `ERC20` standard (`USDT`-like tokens, do not return `bool` as the result of the execution). An integrator that bases their code on the Aave example mock will probably revert if they interact with these kinds of tokens
2. will make the integrator reverts because the approval amount has not been consumed by Aave. `USDT` is known (at least on Ethereum) to revert if the user approves an `amount > 0` and the allowance is already greater than zero. User can only
   1. Approve 0 amount if the allowance is > 0 (to reset the allowance)
   2. Approve amount > 0 if the allowance is 0

### Solve `ERC20` tokens that do not follow the `ERC20` standard

To solve the first issue, the integrator should avoid using the mock example that does no handle correctly tokens that do not follow the `ERC20` standard.

The mock example uses `GPv2SafeERC20.sol` that do not implement a `safeApprove` like [OpenZeppelin SafeERC20](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol#L38-L54) or [Solmate SafeTransferLib](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol#L38-L54)

## Solve `USDT` approve specific `approve`

Let's assume that Aave has not fixed the `premiumAmount > 0` problem we have discussed before.

In this case, the integrator should implement something like this

```solidity
if( !executeBorrow ) {
  uint256 amountToReturn = amounts[i] + premiums[i];
  IERC20(assets[i]).safeApprove(address(POOL), amountToReturn);
}
```

If Aave fixes the `premiumAmount` the integrator could have a more flexible code like

```solidity
uint256 amountToReturn = executeBorrow ? premiums[i] : amounts[i] + premiums[i];
if (amountToReturn > 0) {
  IERC20(assets[i]).safeApprove(address(POOL), amountToReturn);
}
```

This solution would be ideal in the case Aave requires the integrator to pay some premium, even in the case of a flashloan-to-borrow operation.

# Final Recap

1. Aave should correctly calculate the `vars.totalPremiums[vars.i]` premium amount to be paid for each flashloan operation
2. Aave should update their [MockFlashLoanReceiver.sol](https://github.com/aave/aave-v3-core/blob/master/contracts/mocks/flashloan/MockFlashLoanReceiver.sol) receiver contract that could be used by integrator as the base of their receiver smart contract. The new version should correctly handle `ERC20` tokens that do not follow the `ERC20` standard and token like `USDC` that reverts when the `msg.sender` tries to approve `amount > 0` when `allowance > 0`

## Flashloan test

Please see also the other contracts needed to execute the test

### `FlashloanTest.t.sol`

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import 'forge-std/Test.sol';
import {ProtocolV3TestBase} from '../ProtocolV3TestBase.sol';
import {AaveV3Ethereum, AaveV3EthereumAssets} from 'aave-address-book/AaveV3Ethereum.sol';

import {IPoolAddressesProvider, IPool, DataTypes} from 'aave-address-book/AaveV3.sol';
import './MockFlashLoanReceiverBorrow.sol';
import './MockFlashLoanReceiverBorrowGnosisBased.sol';

import {IERC20} from 'solidity-utils/contracts/oz-common/interfaces/IERC20.sol';

import {MathUtils} from 'aave-v3-core/contracts/protocol/libraries/math/MathUtils.sol';
import {WadRayMath} from 'aave-v3-core/contracts/protocol/libraries/math/WadRayMath.sol';
import {PercentageMath} from 'aave-v3-core/contracts/protocol/libraries/math/PercentageMath.sol';

contract FlashloanTest is ProtocolV3TestBase {
  using WadRayMath for uint256;
  using PercentageMath for uint256;
  IPool private pool;

  // address not present in the utility list of addresses
  address private constant USDT_UNDERLYING = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

  function setUp() public {
    vm.createSelectFork('mainnet', 16725414);

    pool = IPool(AaveV3Ethereum.POOL);
  }

  function testFlashloanWithSafeApprove() public {
    address user1 = address(3);
    vm.label(user1, 'Aave User 1');

    // Deploy the flashloan receiver
    vm.startPrank(user1);
    MockFlashLoanReceiverBorrow flashloanReceiver = new MockFlashLoanReceiverBorrow(
      IPoolAddressesProvider(pool.ADDRESSES_PROVIDER())
    );
    vm.label(address(flashloanReceiver), 'MockFlashLoanReceiverBorrow');
    vm.stopPrank();

    // user1 supply 1000 WETH to be able to open a borrow position
    executeSupply(user1, AaveV3EthereumAssets.WETH_UNDERLYING, 1000 ether);

    // Mint and send 10_000 USDC to our contract so it can repay for the premium if needed
    deal(USDT_UNDERLYING, address(flashloanReceiver), 1000 * 10**6);

    // execute the flashloan
    executeFlashloan(user1, address(flashloanReceiver), USDT_UNDERLYING, 100 * 10**6, 2);

    // execute the flashloan again
    // this will revert with `APPROVE_FAILED` message because it's the revert message of `SafeTransferLib.safeApprove`
    // it reverts because we try to call USDC.approve when there's already an allowance > 0
    // Because Aave has not consumed the allowance given that the borrow logic of aave does not consume it
    // but the premium amount was > 0 and we tried to approve it
    vm.expectRevert(bytes('APPROVE_FAILED'));
    executeFlashloan(user1, address(flashloanReceiver), USDT_UNDERLYING, 100 * 10**6, 2);
  }

  function testFlashloanWithoutSafeApprove() public {
    address user1 = address(3);
    vm.label(user1, 'Aave User 1');

    // Deploy the flashloan receiver
    vm.startPrank(user1);
    MockFlashLoanReceiverBorrowGnosisBased flashloanReceiver = new MockFlashLoanReceiverBorrowGnosisBased(
        IPoolAddressesProvider(pool.ADDRESSES_PROVIDER())
      );
    vm.label(address(flashloanReceiver), 'MockFlashLoanReceiverBorrowGnosisBased');
    vm.stopPrank();

    // user1 supply 1000 WETH to be able to open a borrow position
    executeSupply(user1, AaveV3EthereumAssets.WETH_UNDERLYING, 1000 ether);

    // Mint and send 10_000 USDC to our contract so it can repay for the premium if needed
    deal(USDT_UNDERLYING, address(flashloanReceiver), 1000 * 10**6);

    // execute the flashloan
    // this will revert from the start because the `MockFlashLoanReceiverBorrowGnosisBased` which is based on the
    // Aave flashloan receiver mock example uses Gnosis GPv2SafeERC20 library that do no implement a "safe" version
    // of the `approve` function
    // USDC does not follow the ERC20 token standard because it does not return `bool` as the operation result
    // The problem is that  `IERC20` does expect that and tries to decode something that is not returned
    // That's the reason no matter what the receiver contract will revert on the `approve` call
    vm.expectRevert(bytes(''));
    executeFlashloan(user1, address(flashloanReceiver), USDT_UNDERLYING, 100 * 10**6, 2);
  }

  function executeSupply(
    address user,
    address asset,
    uint256 amount
  ) private {
    // deal to the user X amount of underlying to be able to supply
    deal(asset, user, amount);

    // Approve the pool to be able to execute transferFrom
    vm.prank(user);
    IERC20(asset).approve(address(pool), amount);

    // supply to the pool to be able to take a borrow position
    vm.prank(user);
    pool.supply(asset, amount, user, 0);
  }

  function executeFlashloan(
    address user,
    address flashloanReceiver,
    address asset,
    uint256 amount,
    uint256 interestRateMode
  ) private {
    address[] memory flashloanAssets = new address[](1);
    uint256[] memory flashloanAmounts = new uint256[](1);
    uint256[] memory flashloanBorrowRates = new uint256[](1);

    flashloanAssets[0] = asset;
    flashloanAmounts[0] = amount;
    flashloanBorrowRates[0] = interestRateMode;

    bool executeBorrow = true;
    bytes memory flashloanParams = abi.encode(executeBorrow);

    vm.prank(user);
    pool.flashLoan(
      address(flashloanReceiver),
      flashloanAssets,
      flashloanAmounts,
      flashloanBorrowRates,
      user,
      flashloanParams,
      0
    );
  }
}
```

### `MockFlashLoanReceiverBorrow.sol`

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {FlashLoanReceiverBase} from 'aave-v3-core/contracts/flashloan/base/FlashLoanReceiverBase.sol';
import {IERC20} from 'solidity-utils/contracts/oz-common/interfaces/IERC20.sol';
import {IPoolAddressesProvider} from 'aave-address-book/AaveV3.sol';
import './SafeTransferLib.sol';

contract MockFlashLoanReceiverBorrow is FlashLoanReceiverBase {
  using SafeTransferLib for IERC20;

  event ExecutedWithSuccess(address[] _assets, uint256[] _amounts, uint256[] _premiums);

  address private owner;

  constructor(IPoolAddressesProvider provider) FlashLoanReceiverBase(provider) {
    owner = msg.sender;
  }

  function executeOperation(
    address[] memory assets,
    uint256[] memory amounts,
    uint256[] memory premiums,
    address initiator,
    bytes calldata params
  ) public override returns (bool) {
    require(initiator == owner, 'Only the owner can initiate the flashloan call');

    bool executeBorrow = abi.decode(params, (bool));

    for (uint256 i = 0; i < assets.length; i++) {
      //check the contract has the specified balance
      require(
        amounts[i] <= IERC20(assets[i]).balanceOf(address(this)),
        'Invalid balance for the contract'
      );

      // if I'm using borrow do not send the amount flashloaned
      uint256 amountToReturn = executeBorrow ? premiums[i] : amounts[i] + premiums[i];

      IERC20(assets[i]).safeApprove(address(POOL), amountToReturn);
    }

    emit ExecutedWithSuccess(assets, amounts, premiums);

    return true;
  }
}
```

### `MockFlashLoanReceiverBorrowGnosisBased.sol`

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {FlashLoanReceiverBase} from 'aave-v3-core/contracts/flashloan/base/FlashLoanReceiverBase.sol';
import {IERC20} from 'solidity-utils/contracts/oz-common/interfaces/IERC20.sol';
import {IPoolAddressesProvider} from 'aave-address-book/AaveV3.sol';

/// @title Gnosis Protocol v2 Safe ERC20 Transfer Library
/// @author Gnosis Developers
/// @dev Gas-efficient version of Openzeppelin's SafeERC20 contract.
library GPv2SafeERC20 {
  /// @dev Wrapper around a call to the ERC20 function `transfer` that reverts
  /// also when the token returns `false`.
  function safeTransfer(
    IERC20 token,
    address to,
    uint256 value
  ) internal {
    bytes4 selector_ = token.transfer.selector;

    // solhint-disable-next-line no-inline-assembly
    assembly {
      let freeMemoryPointer := mload(0x40)
      mstore(freeMemoryPointer, selector_)
      mstore(add(freeMemoryPointer, 4), and(to, 0xffffffffffffffffffffffffffffffffffffffff))
      mstore(add(freeMemoryPointer, 36), value)

      if iszero(call(gas(), token, 0, freeMemoryPointer, 68, 0, 0)) {
        returndatacopy(0, 0, returndatasize())
        revert(0, returndatasize())
      }
    }

    require(getLastTransferResult(token), 'GPv2: failed transfer');
  }

  /// @dev Wrapper around a call to the ERC20 function `transferFrom` that
  /// reverts also when the token returns `false`.
  function safeTransferFrom(
    IERC20 token,
    address from,
    address to,
    uint256 value
  ) internal {
    bytes4 selector_ = token.transferFrom.selector;

    // solhint-disable-next-line no-inline-assembly
    assembly {
      let freeMemoryPointer := mload(0x40)
      mstore(freeMemoryPointer, selector_)
      mstore(add(freeMemoryPointer, 4), and(from, 0xffffffffffffffffffffffffffffffffffffffff))
      mstore(add(freeMemoryPointer, 36), and(to, 0xffffffffffffffffffffffffffffffffffffffff))
      mstore(add(freeMemoryPointer, 68), value)

      if iszero(call(gas(), token, 0, freeMemoryPointer, 100, 0, 0)) {
        returndatacopy(0, 0, returndatasize())
        revert(0, returndatasize())
      }
    }

    require(getLastTransferResult(token), 'GPv2: failed transferFrom');
  }

  /// @dev Verifies that the last return was a successful `transfer*` call.
  /// This is done by checking that the return data is either empty, or
  /// is a valid ABI encoded boolean.
  function getLastTransferResult(IERC20 token) private view returns (bool success) {
    // NOTE: Inspecting previous return data requires assembly. Note that
    // we write the return data to memory 0 in the case where the return
    // data size is 32, this is OK since the first 64 bytes of memory are
    // reserved by Solidy as a scratch space that can be used within
    // assembly blocks.
    // <https://docs.soliditylang.org/en/v0.7.6/internals/layout_in_memory.html>
    // solhint-disable-next-line no-inline-assembly
    assembly {
      /// @dev Revert with an ABI encoded Solidity error with a message
      /// that fits into 32-bytes.
      ///
      /// An ABI encoded Solidity error has the following memory layout:
      ///
      /// ------------+----------------------------------
      ///  byte range | value
      /// ------------+----------------------------------
      ///  0x00..0x04 |        selector("Error(string)")
      ///  0x04..0x24 |      string offset (always 0x20)
      ///  0x24..0x44 |                    string length
      ///  0x44..0x64 | string value, padded to 32-bytes
      function revertWithMessage(length, message) {
        mstore(0x00, '\x08\xc3\x79\xa0')
        mstore(0x04, 0x20)
        mstore(0x24, length)
        mstore(0x44, message)
        revert(0x00, 0x64)
      }

      switch returndatasize()
      // Non-standard ERC20 transfer without return.
      case 0 {
        // NOTE: When the return data size is 0, verify that there
        // is code at the address. This is done in order to maintain
        // compatibility with Solidity calling conventions.
        // <https://docs.soliditylang.org/en/v0.7.6/control-structures.html#external-function-calls>
        if iszero(extcodesize(token)) {
          revertWithMessage(20, 'GPv2: not a contract')
        }

        success := 1
      }
      // Standard ERC20 transfer returning boolean success value.
      case 32 {
        returndatacopy(0, 0, returndatasize())

        // NOTE: For ABI encoding v1, any non-zero value is accepted
        // as `true` for a boolean. In order to stay compatible with
        // OpenZeppelin's `SafeERC20` library which is known to work
        // with the existing ERC20 implementation we care about,
        // make sure we return success for any non-zero return value
        // from the `transfer*` call.
        success := iszero(iszero(mload(0)))
      }
      default {
        revertWithMessage(31, 'GPv2: malformed transfer result')
      }
    }
  }
}

contract MockFlashLoanReceiverBorrowGnosisBased is FlashLoanReceiverBase {
  using GPv2SafeERC20 for IERC20;

  event ExecutedWithSuccess(address[] _assets, uint256[] _amounts, uint256[] _premiums);

  address private owner;

  constructor(IPoolAddressesProvider provider) FlashLoanReceiverBase(provider) {
    owner = msg.sender;
  }

  function executeOperation(
    address[] memory assets,
    uint256[] memory amounts,
    uint256[] memory premiums,
    address initiator,
    bytes calldata params
  ) public override returns (bool) {
    require(initiator == owner, 'Only the owner can initiate the flashloan call');

    bool executeBorrow = abi.decode(params, (bool));

    for (uint256 i = 0; i < assets.length; i++) {
      //check the contract has the specified balance
      require(
        amounts[i] <= IERC20(assets[i]).balanceOf(address(this)),
        'Invalid balance for the contract'
      );

      // if I'm using borrow do not send the amount flashloaned
      uint256 amountToReturn = executeBorrow ? premiums[i] : amounts[i] + premiums[i];

      IERC20(assets[i]).approve(address(POOL), amountToReturn);
    }

    emit ExecutedWithSuccess(assets, amounts, premiums);

    return true;
  }
}
```

### `SafeTransferLib` (copy/paste from the solmate repo)

```solidity
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.8.0;

import {IERC20} from 'solidity-utils/contracts/oz-common/interfaces/IERC20.sol';

/// @notice Safe ETH and ERC20 transfer library that gracefully handles missing return values.
/// @author Solmate (https://github.com/transmissions11/solmate/blob/main/src/utils/SafeTransferLib.sol)
/// @dev Use with caution! Some functions in this library knowingly create dirty bits at the destination of the free memory pointer.
/// @dev Note that none of the functions in this library check that a token has code at all! That responsibility is delegated to the caller.
library SafeTransferLib {
  /*//////////////////////////////////////////////////////////////
                             ETH OPERATIONS
    //////////////////////////////////////////////////////////////*/

  function safeTransferETH(address to, uint256 amount) internal {
    bool success;

    /// @solidity memory-safe-assembly
    assembly {
      // Transfer the ETH and store if it succeeded or not.
      success := call(gas(), to, amount, 0, 0, 0, 0)
    }

    require(success, 'ETH_TRANSFER_FAILED');
  }

  /*//////////////////////////////////////////////////////////////
                            ERC20 OPERATIONS
    //////////////////////////////////////////////////////////////*/

  function safeTransferFrom(
    IERC20 token,
    address from,
    address to,
    uint256 amount
  ) internal {
    bool success;

    /// @solidity memory-safe-assembly
    assembly {
      // Get a pointer to some free memory.
      let freeMemoryPointer := mload(0x40)

      // Write the abi-encoded calldata into memory, beginning with the function selector.
      mstore(freeMemoryPointer, 0x23b872dd00000000000000000000000000000000000000000000000000000000)
      mstore(add(freeMemoryPointer, 4), from) // Append the "from" argument.
      mstore(add(freeMemoryPointer, 36), to) // Append the "to" argument.
      mstore(add(freeMemoryPointer, 68), amount) // Append the "amount" argument.

      success := and(
        // Set success to whether the call reverted, if not we check it either
        // returned exactly 1 (can't just be non-zero data), or had no return data.
        or(and(eq(mload(0), 1), gt(returndatasize(), 31)), iszero(returndatasize())),
        // We use 100 because the length of our calldata totals up like so: 4 + 32 * 3.
        // We use 0 and 32 to copy up to 32 bytes of return data into the scratch space.
        // Counterintuitively, this call must be positioned second to the or() call in the
        // surrounding and() call or else returndatasize() will be zero during the computation.
        call(gas(), token, 0, freeMemoryPointer, 100, 0, 32)
      )
    }

    require(success, 'TRANSFER_FROM_FAILED');
  }

  function safeTransfer(
    IERC20 token,
    address to,
    uint256 amount
  ) internal {
    bool success;

    /// @solidity memory-safe-assembly
    assembly {
      // Get a pointer to some free memory.
      let freeMemoryPointer := mload(0x40)

      // Write the abi-encoded calldata into memory, beginning with the function selector.
      mstore(freeMemoryPointer, 0xa9059cbb00000000000000000000000000000000000000000000000000000000)
      mstore(add(freeMemoryPointer, 4), to) // Append the "to" argument.
      mstore(add(freeMemoryPointer, 36), amount) // Append the "amount" argument.

      success := and(
        // Set success to whether the call reverted, if not we check it either
        // returned exactly 1 (can't just be non-zero data), or had no return data.
        or(and(eq(mload(0), 1), gt(returndatasize(), 31)), iszero(returndatasize())),
        // We use 68 because the length of our calldata totals up like so: 4 + 32 * 2.
        // We use 0 and 32 to copy up to 32 bytes of return data into the scratch space.
        // Counterintuitively, this call must be positioned second to the or() call in the
        // surrounding and() call or else returndatasize() will be zero during the computation.
        call(gas(), token, 0, freeMemoryPointer, 68, 0, 32)
      )
    }

    require(success, 'TRANSFER_FAILED');
  }

  function safeApprove(
    IERC20 token,
    address to,
    uint256 amount
  ) internal {
    bool success;

    /// @solidity memory-safe-assembly
    assembly {
      // Get a pointer to some free memory.
      let freeMemoryPointer := mload(0x40)

      // Write the abi-encoded calldata into memory, beginning with the function selector.
      mstore(freeMemoryPointer, 0x095ea7b300000000000000000000000000000000000000000000000000000000)
      mstore(add(freeMemoryPointer, 4), to) // Append the "to" argument.
      mstore(add(freeMemoryPointer, 36), amount) // Append the "amount" argument.

      success := and(
        // Set success to whether the call reverted, if not we check it either
        // returned exactly 1 (can't just be non-zero data), or had no return data.
        or(and(eq(mload(0), 1), gt(returndatasize(), 31)), iszero(returndatasize())),
        // We use 68 because the length of our calldata totals up like so: 4 + 32 * 2.
        // We use 0 and 32 to copy up to 32 bytes of return data into the scratch space.
        // Counterintuitively, this call must be positioned second to the or() call in the
        // surrounding and() call or else returndatasize() will be zero during the computation.
        call(gas(), token, 0, freeMemoryPointer, 68, 0, 32)
      )
    }

    require(success, 'APPROVE_FAILED');
  }
}
```
