"use strict";

const { dfn } = require('./JS');
const {
  encodeParameters,
  bnbBalance,
  bnbMantissa,
  bnbUnsigned,
  mergeInterface
} = require('./BSC');
const BigNumber = require('bignumber.js');


async function makeComptroller(opts = {}) {
  const {
    root = saddle.account,
    treasuryGuardian = saddle.accounts[4],
    treasuryAddress = saddle.accounts[4],
    kind = 'unitroller'
  } = opts || {};

  if (kind == 'bool') {
    const comptroller = await deploy('BoolComptroller');
    const ann = opts.ann || await deploy('ANN', [opts.annexOwner || root]);
    const xai = opts.xai || await makeXAI();

    const xaiunitroller = await deploy('XAIUnitroller');
    const xaicontroller = await deploy('XAIControllerHarness');
    
    await send(xaiunitroller, '_setPendingImplementation', [xaicontroller._address]);
    await send(xaicontroller, '_become', [xaiunitroller._address]);
    mergeInterface(xaiunitroller, xaicontroller);

    await send(xaiunitroller, '_setComptroller', [comptroller._address]);
    await send(xaiunitroller, 'setXAIAddress', [xai._address]);
    await send(xaiunitroller, 'initialize');
    await send(xai, 'rely', [xaiunitroller._address]);

    //await send(unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(comptroller, { ann, xai, xaicontroller: xaiunitroller });
  }

  if (kind == 'boolFee') {
    const comptroller = await deploy('BoolComptroller');
    await send(comptroller, 'setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);
    return comptroller;
  }

  if (kind == 'false-marker') {
    return await deploy('FalseMarkerMethodComptroller');
  }

  if (kind == 'v1-no-proxy') {
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, .051));

    await send(comptroller, '_setCloseFactor', [closeFactor]);
    await send(comptroller, '_setPriceOracle', [priceOracle._address]);

    return Object.assign(comptroller, { priceOracle });
  }

  if (kind == 'unitroller-g2') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerScenarioG2');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = bnbMantissa(1);
    const ann = opts.ann || await deploy('ANN', [opts.compOwner || root]);
    const annexRate = bnbUnsigned(dfn(opts.annexRate, 1e18));

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, 'harnessSetAnnexRate', [annexRate]);
    await send(unitroller, 'setANNAddress', [ann._address]); // harness only

    return Object.assign(unitroller, { priceOracle, ann });
  }

  if (kind == 'unitroller') {
    const unitroller = opts.unitroller || await deploy('Unitroller');
    const comptroller = await deploy('ComptrollerHarness');
    const priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
    const closeFactor = bnbMantissa(dfn(opts.closeFactor, .051));
    const liquidationIncentive = bnbMantissa(1);
    const ann = opts.ann || await deploy('ANN', [opts.annexOwner || root]);
    const xai = opts.xai || await makeXAI();
    const annexRate = bnbUnsigned(dfn(opts.annexRate, 1e18));
    const annexXAIRate = bnbUnsigned(dfn(opts.annexXAIRate, 5e17));
    const annexMarkets = opts.annexMarkets || [];

    await send(unitroller, '_setPendingImplementation', [comptroller._address]);
    await send(comptroller, '_become', [unitroller._address]);
    mergeInterface(unitroller, comptroller);

    const xaiunitroller = await deploy('XAIUnitroller');
    const xaicontroller = await deploy('XAIControllerHarness');
    
    await send(xaiunitroller, '_setPendingImplementation', [xaicontroller._address]);
    await send(xaicontroller, '_become', [xaiunitroller._address]);
    mergeInterface(xaiunitroller, xaicontroller);

    await send(unitroller, '_setXAIController', [xaiunitroller._address]);
    await send(xaiunitroller, '_setComptroller', [unitroller._address]);
    await send(unitroller, '_setLiquidationIncentive', [liquidationIncentive]);
    await send(unitroller, '_setCloseFactor', [closeFactor]);
    await send(unitroller, '_setPriceOracle', [priceOracle._address]);
    await send(unitroller, 'setANNAddress', [ann._address]); // harness only
    await send(xaiunitroller, 'setXAIAddress', [xai._address]); // harness only
    await send(unitroller, 'harnessSetAnnexRate', [annexRate]);
    await send(unitroller, '_setAnnexXAIRate', [annexXAIRate]);
    await send(xaiunitroller, '_initializeAnnexXAIState', [0]);
    await send(xaiunitroller, 'initialize');
    await send(xai, 'rely', [xaiunitroller._address]);

    await send(unitroller, '_setTreasuryData', [treasuryGuardian, treasuryAddress, 1e14]);

    return Object.assign(unitroller, { priceOracle, ann, xai, xaiunitroller });
  }
}

async function makeAToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'abep20'
  } = opts || {};

  const comptroller = opts.comptroller || await makeComptroller(opts.comptrollerOpts);
  const interestRateModel = opts.interestRateModel || await makeInterestRateModel(opts.interestRateModelOpts);
  const exchangeRate = bnbMantissa(dfn(opts.exchangeRate, 1));
  const decimals = bnbUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === 'abnb' ? 'aBNB' : 'aOMG');
  const name = opts.name || `AToken ${symbol}`;
  const admin = opts.admin || root;

  let aToken, underlying;
  let aDelegator, aDelegatee, aDaiMaker;

  switch (kind) {
    case 'abnb':
      aToken = await deploy('ABNBHarness',
        [
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin
        ])
      break;

    case 'adai':
      aDaiMaker  = await deploy('aDaiDelegateMakerHarness');
      underlying = aDaiMaker;
      aDelegatee = await deploy('aDaiDelegateHarness');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          encodeParameters(['address', 'address'], [aDaiMaker._address, aDaiMaker._address])
        ]
      );
      aToken = await saddle.getContractAt('aDaiDelegateHarness', aDelegator._address);
      break;

    case 'aann':
      underlying = await deploy('ANN', [opts.compHolder || root]);
      aDelegatee = await deploy('AAnnLikeDelegate');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          "0x0"
        ]
      );
      aToken = await saddle.getContractAt('AAnnLikeDelegate', aDelegator._address);
      break;

    case 'abep20':
    default:
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      aDelegatee = await deploy('ABep20DelegateHarness');
      aDelegator = await deploy('ABep20Delegator',
        [
          underlying._address,
          comptroller._address,
          interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          admin,
          aDelegatee._address,
          "0x0"
        ]
      );
      aToken = await saddle.getContractAt('ABep20DelegateHarness', aDelegator._address);
      break;
  }

  if (opts.supportMarket) {
    await send(comptroller, '_supportMarket', [aToken._address]);
  }

  if (opts.addAnnexMarket) {
    await send(comptroller, '_addAnnexMarket', [aToken._address]);
  }

  if (opts.underlyingPrice) {
    const price = bnbMantissa(opts.underlyingPrice);
    await send(comptroller.priceOracle, 'setUnderlyingPrice', [aToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = bnbMantissa(opts.collateralFactor);
    expect(await send(comptroller, '_setCollateralFactor', [aToken._address, factor])).toSucceed();
  }

  return Object.assign(aToken, { name, symbol, underlying, comptroller, interestRateModel });
}

async function makeXAI(opts = {}) {
  const {
    chainId = 97
  } = opts || {};

  let xai;

  xai = await deploy('XAIScenario',
    [
      chainId
    ]
  );

  return Object.assign(xai);
}

async function makeInterestRateModel(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harnessed'
  } = opts || {};

  if (kind == 'harnessed') {
    const borrowRate = bnbMantissa(dfn(opts.borrowRate, 0));
    return await deploy('InterestRateModelHarness', [borrowRate]);
  }

  if (kind == 'false-marker') {
    const borrowRate = bnbMantissa(dfn(opts.borrowRate, 0));
    return await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
  }

  if (kind == 'white-paper') {
    const baseRate = bnbMantissa(dfn(opts.baseRate, 0));
    const multiplier = bnbMantissa(dfn(opts.multiplier, 1e-18));
    return await deploy('WhitePaperInterestRateModel', [baseRate, multiplier]);
  }

  if (kind == 'jump-rate') {
    const baseRate = bnbMantissa(dfn(opts.baseRate, 0));
    const multiplier = bnbMantissa(dfn(opts.multiplier, 1e-18));
    const jump = bnbMantissa(dfn(opts.jump, 0));
    const kink = bnbMantissa(dfn(opts.kink, 0));
    return await deploy('JumpRateModel', [baseRate, multiplier, jump, kink]);
  }
}

async function makePriceOracle(opts = {}) {
  const {
    root = saddle.account,
    kind = 'simple'
  } = opts || {};

  if (kind == 'simple') {
    return await deploy('SimplePriceOracle');
  }
}

async function makeToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'bep20'
  } = opts || {};

  if (kind == 'bep20') {
    const quantity = bnbUnsigned(dfn(opts.quantity, 1e25));
    const decimals = bnbUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Bep20 ${symbol}`;
    return await deploy('BEP20Harness', [quantity, name, decimals, symbol]);
  }
}

async function balanceOf(token, account) {
  return bnbUnsigned(await call(token, 'balanceOf', [account]));
}

async function totalSupply(token) {
  return bnbUnsigned(await call(token, 'totalSupply'));
}

async function borrowSnapshot(aToken, account) {
  const { principal, interestIndex } = await call(aToken, 'harnessAccountBorrows', [account]);
  return { principal: bnbUnsigned(principal), interestIndex: bnbUnsigned(interestIndex) };
}

async function totalBorrows(aToken) {
  return bnbUnsigned(await call(aToken, 'totalBorrows'));
}

async function totalReserves(aToken) {
  return bnbUnsigned(await call(aToken, 'totalReserves'));
}

async function enterMarkets(aTokens, from) {
  return await send(aTokens[0].comptroller, 'enterMarkets', [aTokens.map(c => c._address)], { from });
}

async function fastForward(aToken, blocks = 5) {
  return await send(aToken, 'harnessFastForward', [blocks]);
}

async function setBalance(aToken, account, balance) {
  return await send(aToken, 'harnessSetBalance', [account, balance]);
}

async function setMintedXAIOf(comptroller, account, balance) {
  return await send(comptroller, 'harnessSetMintedXAIOf', [account, balance]);
}

async function setXAIBalance(xai, account, balance) {
  return await send(xai, 'harnessSetBalanceOf', [account, balance]);
}

async function setBNBBalance(aBnb, balance) {
  const current = await bnbBalance(aBnb._address);
  const root = saddle.account;
  expect(await send(aBnb, 'harnessDoTransferOut', [root, current])).toSucceed();
  expect(await send(aBnb, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
}

async function getBalances(aTokens, accounts) {
  const balances = {};
  for (let aToken of aTokens) {
    const aBalances = balances[aToken._address] = {};
    for (let account of accounts) {
      aBalances[account] = {
        bnb: await bnbBalance(account),
        cash: aToken.underlying && await balanceOf(aToken.underlying, account),
        tokens: await balanceOf(aToken, account),
        borrows: (await borrowSnapshot(aToken, account)).principal
      };
    }
    aBalances[aToken._address] = {
      bnb: await bnbBalance(aToken._address),
      cash: aToken.underlying && await balanceOf(aToken.underlying, aToken._address),
      tokens: await totalSupply(aToken),
      borrows: await totalBorrows(aToken),
      reserves: await totalReserves(aToken)
    };
  }
  return balances;
}

async function getBalancesWithXAI(xai, aTokens, accounts) {
  const balances = {};
  for (let aToken of aTokens) {
    const aBalances = balances[aToken._address] = {};
    const xaiBalancesData = balances[xai._address] = {};
    for (let account of accounts) {
      aBalances[account] = {
        bnb: await bnbBalance(account),
        cash: aToken.underlying && await balanceOf(aToken.underlying, account),
        tokens: await balanceOf(aToken, account),
        borrows: (await borrowSnapshot(aToken, account)).principal
      };
      xaiBalancesData[account] = {
        xai: (await balanceOf(xai, account)),
      };
    }
    aBalances[aToken._address] = {
      bnb: await bnbBalance(aToken._address),
      cash: aToken.underlying && await balanceOf(aToken.underlying, aToken._address),
      tokens: await totalSupply(aToken),
      borrows: await totalBorrows(aToken),
      reserves: await totalReserves(aToken),
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let aToken, account, key, diff;
    if (delta.length == 4) {
      ([aToken, account, key, diff] = delta);
    } else {
      ([aToken, key, diff] = delta);
      account = aToken._address;
    }
    balances[aToken._address][account][key] = new BigNumber(balances[aToken._address][account][key]).add(diff);
  }
  return balances;
}

async function adjustBalancesWithXAI(balances, deltas, xai) {
  for (let delta of deltas) {
    let aToken, account, key, diff;
    if (delta[0]._address != xai._address) {
      if (delta.length == 4) {
        ([aToken, account, key, diff] = delta);
      } else {
        ([aToken, key, diff] = delta);
        account = aToken._address;
      }
      balances[aToken._address][account][key] = balances[aToken._address][account][key].add(diff);
    } else {
      [aToken, account, key, diff] = delta;
      balances[xai._address][account][key] = balances[xai._address][account][key].add(diff);
    }
  }
  return balances;
}

async function preApprove(aToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(aToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(aToken.underlying, 'approve', [aToken._address, amount], { from });
}

async function preApproveXAI(comptroller, xai, from, to, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(xai, 'harnessSetBalanceOf', [from, amount], { from })).toSucceed();
    await send(comptroller, 'harnessSetMintedXAIOf', [from, amount]);
  }

  return send(xai, 'approve', [to, amount], { from });
}

async function quickMint(aToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(aToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(aToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'mint', [mintAmount], { from: minter });
}

async function quickMintXAI(comptroller, xai, xaiMinter, xaiMintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(xai, 1);

  expect(await send(xai, 'harnessSetBalanceOf', [xaiMinter, xaiMintAmount], { xaiMinter })).toSucceed();
  expect(await send(comptroller, 'harnessSetMintedXAIs', [xaiMinter, xaiMintAmount], { xaiMinter })).toSucceed();
  expect(await send(xai, 'harnessIncrementTotalSupply', [xaiMintAmount], { xaiMinter })).toSucceed();
}

async function preSupply(aToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(aToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
  }
  return send(aToken, 'harnessSetBalance', [account, tokens]);
}

async function quickRedeem(aToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(aToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(aToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'redeem', [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(aToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(aToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(aToken, 'harnessSetExchangeRate', [bnbMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(aToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
}

async function setOraclePrice(aToken, price) {
  return send(aToken.comptroller.priceOracle, 'setUnderlyingPrice', [aToken._address, bnbMantissa(price)]);
}

async function setOraclePriceFromMantissa(aToken, price) {
  return send(aToken.comptroller.priceOracle, 'setUnderlyingPrice', [aToken._address, price]);
}

async function setBorrowRate(aToken, rate) {
  return send(aToken.interestRateModel, 'setBorrowRate', [bnbMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves) {
  return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves].map(bnbUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor) {
  return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor].map(bnbUnsigned));
}

async function pretendBorrow(aToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(aToken, 'harnessSetTotalBorrows', [bnbUnsigned(principalRaw)]);
  await send(aToken, 'harnessSetAccountBorrows', [borrower, bnbUnsigned(principalRaw), bnbMantissa(accountIndex)]);
  await send(aToken, 'harnessSetBorrowIndex', [bnbMantissa(marketIndex)]);
  await send(aToken, 'harnessSetAccrualBlockNumber', [bnbUnsigned(blockNumber)]);
  await send(aToken, 'harnessSetBlockNumber', [bnbUnsigned(blockNumber)]);
}

async function pretendXAIMint(comptroller, xaicontroller, xai, xaiMinter, principalRaw, totalSupply, blockNumber = 2e7) {
  await send(comptroller, 'harnessSetMintedXAIOf', [xaiMinter, bnbUnsigned(principalRaw)]);
  await send(xai, 'harnessIncrementTotalSupply', [bnbUnsigned(principalRaw)]);
  await send(xai, 'harnessSetBalanceOf', [xaiMinter, bnbUnsigned(principalRaw)]);
  await send(xaicontroller, 'harnessSetBlockNumber', [bnbUnsigned(blockNumber)]);
}

module.exports = {
  makeComptroller,
  makeAToken,
  makeXAI,
  makeInterestRateModel,
  makePriceOracle,
  makeToken,

  balanceOf,
  totalSupply,
  borrowSnapshot,
  totalBorrows,
  totalReserves,
  enterMarkets,
  fastForward,
  setBalance,
  setMintedXAIOf,
  setXAIBalance,
  setBNBBalance,
  getBalances,
  getBalancesWithXAI,
  adjustBalances,
  adjustBalancesWithXAI,

  preApprove,
  preApproveXAI,
  quickMint,
  quickMintXAI,

  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  setOraclePrice,
  setOraclePriceFromMantissa,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow,
  pretendXAIMint
};
