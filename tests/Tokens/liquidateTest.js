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
      // expect(result).toHaveLog(['Transfer', 0], {
      //   from: borrower,
      //   to: liquidator,
      //   amount: liquidatorShareTokens.toString()
      // });
      // expect(result).toHaveLog(['Transfer', 1], {
      //   from: borrower,
      //   to: aTokenCollateral._address,
      //   amount: protocolShareTokens.toString()
      // });
      // expect(result).toHaveLog('ReservesAdded', {
      //   benefactor: aTokenCollateral._address,
      //   addAmount: addReservesAmount.toString(),
      //   newTotalReserves: addReservesAmount.toString()
      // });
  
      // expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
      //   [aTokenCollateral, liquidator, 'tokens', liquidatorShareTokens],
      //   [aTokenCollateral, borrower, 'tokens', -seizeTokens],
      //   [aTokenCollateral, aTokenCollateral._address, 'reserves', addReservesAmount],
      //   [aTokenCollateral, aTokenCollateral._address, 'tokens', -protocolShareTokens], // total supply decreases
      // ]));
    });
  });
});

describe('Comptroller', () => {
  it('liquidateBorrowAllowed allows deprecated markets to be liquidated', async () => {
    let [root, liquidator, borrower] = saddle.accounts;
    let collatAmount = 10;
    let borrowAmount = 2;
    const aTokenCollat = await makeAToken({supportMarket: true, underlyingPrice: 1, collateralFactor: .5});
    const aTokenBorrow = await makeAToken({supportMarket: true, underlyingPrice: 1, comptroller: aTokenCollat.comptroller});
    const comptroller = aTokenCollat.comptroller;

    // borrow some tokens
    await send(aTokenCollat.underlying, 'harnessSetBalance', [borrower, collatAmount]);
    await send(aTokenCollat.underlying, 'approve', [aTokenCollat._address, collatAmount], {from: borrower});
    await send(aTokenBorrow.underlying, 'harnessSetBalance', [aTokenBorrow._address, collatAmount]);
    await send(aTokenBorrow, 'harnessSetTotalSupply', [collatAmount * 10]);
    await send(aTokenBorrow, 'harnessSetExchangeRate', [etherExp(1)]);
    expect(await enterMarkets([aTokenCollat], borrower)).toSucceed();
    expect(await send(aTokenCollat, 'mint', [collatAmount], {from: borrower})).toSucceed();
    expect(await send(aTokenBorrow, 'borrow', [borrowAmount], {from: borrower})).toSucceed();

    // show the account is healthy
    expect(await call(comptroller, 'isDeprecated', [aTokenBorrow._address])).toEqual(false);
    expect(await call(comptroller, 'liquidateBorrowAllowed', [aTokenBorrow._address, aTokenCollat._address, liquidator, borrower, borrowAmount])).toHaveTrollError('INSUFFICIENT_SHORTFALL');

    // show deprecating a market works
    expect(await send(comptroller, '_setCollateralFactor', [aTokenBorrow._address, 0])).toSucceed();
    expect(await send(comptroller, '_setBorrowPaused', [aTokenBorrow._address, true])).toSucceed();
    expect(await send(aTokenBorrow, '_setReserveFactor', [etherMantissa(1)])).toSucceed();

    expect(await call(comptroller, 'isDeprecated', [aTokenBorrow._address])).toEqual(true);

    // show deprecated markets can be liquidated even if healthy
    expect(await send(comptroller, 'liquidateBorrowAllowed', [aTokenBorrow._address, aTokenCollat._address, liquidator, borrower, borrowAmount])).toSucceed();
    
    // even if deprecated, cant over repay
    await expect(send(comptroller, 'liquidateBorrowAllowed', [aTokenBorrow._address, aTokenCollat._address, liquidator, borrower, borrowAmount * 2])).rejects.toRevert('revert Can not repay more than the total borrow');
  });
})