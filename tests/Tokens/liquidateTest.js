const {
  bnbGasCost,
  bnbUnsigned,
  bnbMantissa,
  UInt256Max,
  bnbExp,
  etherExp
} = require('../Utils/BSC');

const {
  makeAToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow,
  preApprove,
  enterMarkets
} = require('../Utils/Annex');

const repayAmount = etherExp(10);
const seizeTokens = repayAmount.multipliedBy(4);

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
  await send(aTokenCollateral, 'harnessSetTotalSupply', [etherExp(10)]);
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
  const protocolSeizeShareMantissa = 2.8e16; // 2.8%
  const exchangeRate = etherExp(.2);	

  const protocolShareTokens = seizeTokens.multipliedBy(protocolSeizeShareMantissa).dividedBy(etherExp(1));
  const liquidatorShareTokens = seizeTokens.minus(protocolShareTokens);
  const addReservesAmount = protocolShareTokens.multipliedBy(exchangeRate).dividedBy(etherExp(1));

  
  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = saddle.accounts;
    aToken = await makeAToken({comptrollerOpts: {kind: 'bool'}});
    aTokenCollateral = await makeAToken({comptroller: aToken.comptroller});
    expect(await send(aTokenCollateral, 'harnessSetExchangeRate', [exchangeRate])).toSucceed();
  });

  beforeEach(async () => {
    await preLiquidate(aToken, liquidator, borrower, repayAmount, aTokenCollateral);
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
      await setBalance(aTokenCollateral, liquidator, UInt256Max());
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
        amount: liquidatorShareTokens.toString()
      });

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

        


      // expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
      //   [aTokenCollateral, liquidator, 'tokens', seizeTokens],
      //   [aTokenCollateral, borrower, 'tokens', -seizeTokens]
      // ]));
    });
  });
});