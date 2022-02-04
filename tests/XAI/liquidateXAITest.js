const {
  bnbGasCost,
  bnbUnsigned,
  UInt256Max,
  etherExp
} = require('../Utils/BSC');

const {
  makeAToken,
  fastForward,
  setBalance,
  setMintedXAIOf,
  setXAIBalance,
  getBalancesWithXAI,
  adjustBalancesWithXAI,
  pretendBorrow,
  pretendXAIMint,
  preApproveXAI
} = require('../Utils/Annex');

const repayAmount = etherExp(10);
const seizeTokens = repayAmount.multipliedBy(4);


async function preLiquidateXAI(comptroller, xaicontroller, xai, liquidator, borrower, repayAmount, aTokenCollateral) {
  // setup for success in liquidating
  await send(comptroller, 'setLiquidateBorrowAllowed', [true]);
  await send(comptroller, 'setLiquidateBorrowVerify', [true]);
  await send(comptroller, 'setRepayBorrowAllowed', [true]);
  await send(comptroller, 'setRepayBorrowVerify', [true]);
  await send(comptroller, 'setSeizeAllowed', [true]);
  await send(comptroller, 'setSeizeVerify', [true]);
  await send(comptroller, 'setXAIFailCalculateSeizeTokens', [false]);
  await send(aTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(aTokenCollateral.comptroller, 'setXAICalculatedSeizeTokens', [seizeTokens]);
  await setBalance(aTokenCollateral, liquidator, 0);
  await setBalance(aTokenCollateral, borrower, seizeTokens);
  await setMintedXAIOf(comptroller, borrower, 40e2);
  await setXAIBalance(xai, borrower, 40e2);
  await setXAIBalance(xai, liquidator, 40e2);
  await pretendBorrow(aTokenCollateral, borrower, 0, 10e2, 0);
  await pretendXAIMint(comptroller, xaicontroller, xai, borrower, 40e2);
  await preApproveXAI(comptroller, xai, liquidator, xaicontroller._address, repayAmount);
}

async function liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral) {
  return send(xaicontroller, 'harnessLiquidateXAIFresh', [liquidator, borrower, repayAmount, aTokenCollateral._address]);
}

async function liquidateXAI(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(xaicontroller, 1);
  await fastForward(aTokenCollateral, 1);
  return send(xaicontroller, 'liquidateXAI', [borrower, repayAmount, aTokenCollateral._address], {from: liquidator});
}

async function seize(aToken, liquidator, borrower, seizeAmount) {
  return send(aToken, 'seize', [liquidator, borrower, seizeAmount]);
}

describe('XAIController', function () {
  let root, liquidator, borrower, accounts;
  let aTokenCollateral;
  let comptroller, xaicontroller, xai;

  const protocolSeizeShareMantissa = 2.8e16; // 2.8%
  const exchangeRate = etherExp(.2);	

  const protocolShareTokens = seizeTokens.multipliedBy(protocolSeizeShareMantissa).dividedBy(etherExp(1));
  const liquidatorShareTokens = seizeTokens.minus(protocolShareTokens);
  const addReservesAmount = protocolShareTokens.multipliedBy(exchangeRate).dividedBy(etherExp(1));
  

  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = saddle.accounts;
    aTokenCollateral = await makeAToken({comptrollerOpts: {kind: 'bool'}});
    comptroller = aTokenCollateral.comptroller;
    xaicontroller = comptroller.xaicontroller;
    await send(comptroller, 'setLiquidateBorrowAllowed', [false]);
    xai = comptroller.xai;
  });

  beforeEach(async () => {
    await preLiquidateXAI(comptroller, xaicontroller, xai, liquidator, borrower, repayAmount, aTokenCollateral);
  });

  describe('liquidateXAIFresh', () => {
    it("fails if comptroller tells it to", async () => {
      await send(comptroller, 'setLiquidateBorrowAllowed', [false]);
      expect(
        await liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveXAITrollReject('XAI_LIQUIDATE_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("proceeds if comptroller tells it to", async () => {
      expect(
        await liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toSucceed();
    });

    it("fails if collateral market not fresh", async () => {
      await fastForward(xaicontroller);
      await fastForward(aTokenCollateral);
      expect(
        await liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).toHaveXAITrollFailure('REJECTION', 'XAI_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK');
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(
        await liquidateXAIFresh(xaicontroller, borrower, borrower, repayAmount, aTokenCollateral)
      ).toHaveXAITrollFailure('REJECTION', 'XAI_LIQUIDATE_LIQUIDATOR_IS_BORROWER');
    });

    it("fails if repayAmount = 0", async () => {
      expect(await liquidateXAIFresh(xaicontroller, liquidator, borrower, 0, aTokenCollateral)).toHaveXAITrollFailure('REJECTION', 'XAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const beforeBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      await send(comptroller, 'setXAIFailCalculateSeizeTokens', [true]);
      await expect(
        liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert('revert XAI_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      expect(afterBalances).toEqual(beforeBalances);
    });

    // it("fails if repay fails", async () => {
    //   await send(comptroller, 'setRepayBorrowAllowed', [false]);
    //   expect(
    //     await liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
    //   ).toHaveXAITrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
    // });

    it("reverts if seize fails", async () => {
      await send(comptroller, 'setSeizeAllowed', [false]);
      await expect(
        liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert("revert token seizure failed");
    });

    it("reverts if liquidateBorrowVerify fails", async() => {
      await send(comptroller, 'setLiquidateBorrowVerify', [false]);
      await expect(
        liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)
      ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
    });

    it("transfers the cash, borrows, tokens, and emits LiquidateXAI events", async () => {
      const beforeBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      const result = await liquidateXAIFresh(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral);
      const afterBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog('LiquidateXAI', {
        liquidator: liquidator,
        borrower: borrower,
        repayAmount: repayAmount.toString(),
        aTokenCollateral: aTokenCollateral._address,
        seizeTokens: seizeTokens.toString()
      });
      // expect(result).toHaveLog(['Transfer', 0], {
      //   from: liquidator,
      //   to: xaicontroller._address,
      //   amount: repayAmount.toString()
      // });
      // expect(result).toHaveLog(['Transfer', 1], {
      //   from: borrower,
      //   to: liquidator,
      //   amount: seizeTokens.toString()
      // });

      expect(afterBalances).toEqual(await adjustBalancesWithXAI(beforeBalances, [
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens],
        [xai, liquidator, 'xai', -repayAmount]
      ], xai));
    });
  });

  describe('liquidateXAI', () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      await send(aToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidateXAI(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      await send(aTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidateXAI(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from liquidateXAIFresh without emitting any extra logs", async () => {
      expect(await liquidateXAI(xaicontroller, liquidator, borrower, 0, aTokenCollateral)).toHaveXAITrollFailure('REJECTION', 'XAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
    });

    it("returns success from liquidateXAIFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      const result = await liquidateXAI(xaicontroller, liquidator, borrower, repayAmount, aTokenCollateral);
      const gasCost = await bnbGasCost(result);
      const afterBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(await adjustBalancesWithXAI(beforeBalances, [
        [aTokenCollateral, liquidator, 'bnb', -gasCost],
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens],
        [xai, liquidator, 'xai', -repayAmount]
      ], xai));
    });
  });

  describe('seize', () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      await send(comptroller, 'setSeizeAllowed', [false]);
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTrollReject('LIQUIDATE_SEIZE_COMPTROLLER_REJECTION', 'MATH_ERROR');
    });

    it("fails if aTokenBalances[borrower] < amount", async () => {
      await setBalance(aTokenCollateral, borrower, 1);
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_DECREMENT_FAILED', 'INTEGER_UNDERFLOW');
    });

    it("fails if aTokenBalances[liquidator] overflows", async () => {
      await setBalance(aTokenCollateral, liquidator, UInt256Max());
      expect(await seize(aTokenCollateral, liquidator, borrower, seizeTokens)).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_INCREMENT_FAILED', 'INTEGER_OVERFLOW');
    });

    it("succeeds, updates balances, and emits Transfer event", async () => {
      const beforeBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      const result = await seize(aTokenCollateral, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalancesWithXAI(xai, [aTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      // expect(result).toHaveLog('Transfer', {
      //   from: borrower,
      //   to: liquidator,
      //   amount: seizeTokens.toString()
      // });

      expect(result).toHaveLog(['Transfer', 0], {
        from: borrower,
        to: liquidator,
        amount: liquidatorShareTokens.toString()
      });
      expect(result).toHaveLog(['Transfer', 1], {
        from: borrower,
        to: aTokenCollateral._address,
        amount: protocolShareTokens.toString()
      });
      expect(result).toHaveLog('ReservesAdded', {
        benefactor: aTokenCollateral._address,
        addAmount: addReservesAmount.toString(),
        newTotalReserves: addReservesAmount.toString()
      });

      expect(afterBalances).toEqual(await adjustBalancesWithXAI(beforeBalances, [
        [aTokenCollateral, liquidator, 'tokens', seizeTokens],
        [aTokenCollateral, borrower, 'tokens', -seizeTokens]
      ], xai));
    });
  });
});