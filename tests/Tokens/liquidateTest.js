const {
  bnbGasCost,
  bnbUnsigned
} = require('../Utils/BSC');

const {
  makeAToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow,
  preApprove
} = require('../Utils/Annex');

const repayAmount = bnbUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.mul(4); // forced

async function preLiquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral) {
  // setup for success in liquidating
  await send(aToken.comptroller, 'setLiquidateBorrowAllowed', [true]);
  await send(aToken.comptroller, 'setLiquidateBorrowVerify', [true]);
  await send(aToken.comptroller, 'setRepayBorrowAllowed', [true]);
  await send(aToken.comptroller, 'setRepayBorrowVerify', [true]);
  await send(aToken.comptroller, 'setSeizeAllowed', [true]);
  await send(aToken.comptroller, 'setSeizeVerify', [true]);
  await send(aToken.comptroller, 'setFailCalculateSeizeTokens', [false]);
  await send(aToken.underlying, 'harnessSetFailTransferFromAddress', [liquidator, false]);
  await send(aToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aTokenCollateral.comptroller, 'setCalculatedSeizeTokens', [seizeTokens]);
  await setBalance(aTokenCollateral, liquidator, 0);
  await setBalance(aTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(aTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(aToken, borrower, 1, 1, repayAmount);
  await preApprove(aToken, liquidator, repayAmount);
}

async function liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral) {
  return send(aToken, 'harnessLiquidateBorrowFresh', [liquidator, borrower, repayAmount, aTokenCollateral._address]);
}

async function liquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(aToken, 1);
  await fastForward(aTokenCollateral, 1);
  return send(aToken, 'liquidateBorrow', [borrower, repayAmount, aTokenCollateral._address], {from: liquidator});
}

async function seize(aToken, liquidator, borrower, seizeAmount) {
  return send(aToken, 'seize', [liquidator, borrower, seizeAmount]);
}

describe('AToken', function () {
  let root, liquidator, borrower, accounts;
  let aToken, aTokenCollateral;

  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = saddle.accounts;
    aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}});
    aTokenCollateral = await makeAToken({comptroller: aToken.comptroller});
  });

  beforeEach(async () => {
    await preLiquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral);
  });

  describe('liquidateBorrowFresh', () => {
    it("fails if comptroller tells it to", async () => {
      await send(aToken.comptroller, 'setLiquidateBorrowAllowed', [false]);
      expect(
        await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveTrollReject('LIQUIDATE_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("proceeds if comptroller tells it to", async () => {
      expect(
        await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(aToken);
      expect(
        await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_FRESHNESS_CHECK');
    });

    it("fails if collateral market not fresh", async () => {
      await fastForward(aToken);
      await fastForward(aTokenCollateral);
      await send(aToken, 'accrueInterest');
      expect(
        await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_COLLATERAL_FRESHNESS_CHECK');
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(
        await liquidateFresh(aToken, borrower, borrower, repayAmount, aTokenCollateral)
      ).toHaveTokenFailure('INVALID_ACCOUNT_PAIR', 'LIQUIDATE_LIQUIDATOR_IS_BORROWER');
    });

    it("fails if repayAmount = 0", async () => {
      expect(await liquidateFresh(aToken, liquidator, borrower, 0, aTokenCollateral)).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const beforeBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      await send(aToken.comptroller, 'setFailCalculateSeizeTokens', [true]);
      await expect(
        liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert('revert LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      expect(afterBalances).toEqual(beforeBalances);
    });

    it("fails if repay fails", async () => {
      await send(aToken.comptroller, 'setRepayBorrowAllowed', [false]);
      expect(
        await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveTrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
    });

    it("reverts if seize fails", async () => {
      await send(aToken.comptroller, 'setSeizeAllowed', [false]);
      await expect(
        liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert("revert token seizure failed");
    });

    it("reverts if liquidateBorrowVerify fails", async() => {
      await send(aToken.comptroller, 'setLiquidateBorrowVerify', [false]);
      await expect(
        liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const beforeBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      const result = await liquidateFresh(aToken, liquidator, borrower, repayAmount, aTokenCollateral);
      const afterBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog('LiquidateBorrow', {
        liquidator: liquidator,
        borrower: borrower,
        repayAmount: repayAmount.toString(),
        aTokenCollateral: aTokenCollateral._address,
        seizeTokens: seizeTokens.toString()
      });
      expect(result).toHaveLog(['Transfer', 0], {
        from: liquidator,
        to: aToken._address,
        amount: repayAmount.toString()
      });
      expect(result).toHaveLog(['Transfer', 1], {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [aToken, 'cash', repayAmount],
        [aToken, 'borrows', -repayAmount],
        [aToken, liquidator, 'cash', -repayAmount],
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aToken, borrower, 'borrows', -repayAmount],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });

  describe('liquidateBorrow', () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      await send(aTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateBorrowFresh without emitting any extra logs", async () => {
      expect(await liquidate(aToken, liquidator, borrower, 0, aTokenCollateral)).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      const result = await liquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalances([aToken, aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [aToken, 'cash', repayAmount],
        [aToken, 'borrows', -repayAmount],
        [aToken, liquidator, 'bnb', -gasCost],
        [aToken, liquidator, 'cash', -repayAmount],
        [aTokenCollateral, liquidator, 'bnb', -gasCost],
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aToken, borrower, 'borrows', -repayAmount],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });

  describe('seize', () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      await send(aToken.comptroller, 'setSeizeAllowed', [false]);
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTrollReject('LIQUIDATE_SEIZE_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("fails if aTokenBalances[borrower] < amount", async () => {
      await setBalance(aTokenCollateral, borrower, 1);
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_DECREMENT_FAILED', 'INTEGER_UNDERFLOW');
    });

    it("fails if aTokenBalances[liquidator] overflows", async () => {
      await setBalance(aTokenCollateral, liquidator, '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_INCREMENT_FAILED', 'INTEGER_OVERFLOW');
    });

    it("succeeds, updates balances, and emits Transfer event", async () => {
      const beforeBalances = await getBalances([aTokenCollateral], [liquidator, borrower]);
      const result = await seize(aTokenCollateral, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalances([aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog('Transfer', {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });
});
