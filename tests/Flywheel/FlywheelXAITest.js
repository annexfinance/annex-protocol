const {
  makeComptroller,
  makeXAI,
  balanceOf,
  fastForward,
  pretendXAIMint,
  quickMint,
  quickMintXAI
} = require('../Utils/Annex');
const {
  bnbExp,
  bnbDouble,
  bnbUnsigned
} = require('../Utils/BSC');

const annexXAIRate = bnbUnsigned(5e17);

async function annexAccrued(comptroller, user) {
  return bnbUnsigned(await call(comptroller, 'annexAccrued', [user]));
}

async function annBalance(comptroller, user) {
  return bnbUnsigned(await call(comptroller.ann, 'balanceOf', [user]))
}

async function totalAnnexAccrued(comptroller, user) {
  return (await annexAccrued(comptroller, user)).add(await annBalance(comptroller, user));
}

describe('Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let comptroller, xaicontroller, xai;
  beforeEach(async () => {
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    xai = comptroller.xai;
    xaicontroller = comptroller.xaiunitroller;
  });

  describe('updateAnnexXAIMintIndex()', () => {
    it('should calculate ann xai minter index correctly', async () => {
      await send(xaicontroller, 'setBlockNumber', [100]);
      await send(xai, 'harnessSetTotalSupply', [bnbUnsigned(10e18)]);
      await send(comptroller, '_setAnnexXAIRate', [bnbExp(0.5)]);
      await send(xaicontroller, 'harnessUpdateAnnexXAIMintIndex');
      /*
        xaiTokens = 10e18
        annexAccrued = deltaBlocks * setAnnexXAIRate
                    = 100 * 0.5e18 = 50e18
        newIndex   += annexAccrued * 1e36 / xaiTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */

      const {index, block} = await call(xaicontroller, 'annexXAIState');
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it('should not update index if no blocks passed since last accrual', async () => {
      await send(xaicontroller, 'harnessUpdateAnnexXAIMintIndex');

      const {index, block} = await call(xaicontroller, 'annexXAIState');
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(0);
    });
  });

  describe('distributeXAIMinterAnnex()', () => {
    it('should update xai minter index checkpoint but not annexAccrued for first time user', async () => {
      await send(xaicontroller, "setAnnexXAIState", [bnbDouble(6), 10]);
      await send(xaicontroller, "setAnnexXAIMinterIndex", [root, bnbUnsigned(0)]);

      await send(comptroller, "harnessDistributeXAIMinterAnnex", [root]);
      expect(await call(comptroller, "annexAccrued", [root])).toEqualNumber(0);
      expect(await call(xaicontroller, "annexXAIMinterIndex", [root])).toEqualNumber(6e36);
    });

    it('should transfer ann and update xai minter index checkpoint correctly for repeat time user', async () => {
      await send(comptroller.ann, 'transfer', [comptroller._address, bnbUnsigned(50e18)], {from: root});
      await send(xai, "harnessSetBalanceOf", [a1, bnbUnsigned(5e18)]);
      await send(comptroller, "harnessSetMintedXAIs", [a1, bnbUnsigned(5e18)]);
      await send(xaicontroller, "setAnnexXAIState", [bnbDouble(6), 10]);
      await send(xaicontroller, "setAnnexXAIMinterIndex", [a1, bnbDouble(1)]);

      /*
      * 100 delta blocks, 10e18 origin total xai mint, 0.5e18 xaiMinterSpeed => 6e18 annexXAIMintIndex
      * this tests that an acct with half the total xai mint over that time gets 25e18 ANN
        xaiMinterAmount = xaiBalance * 1e18
                       = 5e18 * 1e18 = 5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        xaiMinterAccrued= xaiMinterAmount * deltaIndex / 1e36
                       = 5e18 * 5e36 / 1e36 = 25e18
      */
      const tx = await send(comptroller, "harnessDistributeXAIMinterAnnex", [a1]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(25e18);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedXAIMinterAnnex', {
        xaiMinter: a1,
        annexDelta: bnbUnsigned(25e18).toString(),
        annexXAIMintIndex: bnbDouble(6).toString()
      });
    });

    it('should not transfer if below ann claim threshold', async () => {
      await send(comptroller.ann, 'transfer', [comptroller._address, bnbUnsigned(50e18)], {from: root});

      await send(xai, "harnessSetBalanceOf", [a1, bnbUnsigned(5e17)]);
      await send(comptroller, "harnessSetMintedXAIs", [a1, bnbUnsigned(5e17)]);
      await send(xaicontroller, "setAnnexXAIState", [bnbDouble(1.0019), 10]);
      /*
        xaiMinterAmount  = 5e17
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 1.0019e36 - 1e36 = 0.0019e36
        xaiMintedAccrued+= xaiMinterTokens * deltaIndex / 1e36
                        = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
      */

      await send(comptroller, "harnessDistributeXAIMinterAnnex", [a1]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
    });
  });

  describe('claimAnnex', () => {
    it('should accrue ann and then transfer ann accrued', async () => {
      const annRemaining = annexXAIRate.mul(100), mintAmount = bnbUnsigned(12e18), deltaBlocks = 10;
      await send(comptroller.ann, 'transfer', [comptroller._address, annRemaining], {from: root});
      //await pretendXAIMint(xai, a1, 1);
      const speed = await call(comptroller, 'annexXAIRate');
      const a2AccruedPre = await annexAccrued(comptroller, a2);
      const annBalancePre = await annBalance(comptroller, a2);
      await quickMintXAI(comptroller, xai, a2, mintAmount);
      await fastForward(xaicontroller, deltaBlocks);
      const tx = await send(comptroller, 'claimAnnex', [a2]);
      const a2AccruedPost = await annexAccrued(comptroller, a2);
      const annBalancePost = await annBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(400000);
      expect(speed).toEqualNumber(annexXAIRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(annexXAIRate.mul(deltaBlocks).sub(1)); // index is 8333...
    });

    it('should claim when ann accrued is below threshold', async () => {
      const annRemaining = bnbExp(1), accruedAmt = bnbUnsigned(0.0009e18)
      await send(comptroller.ann, 'transfer', [comptroller._address, annRemaining], {from: root});
      await send(comptroller, 'setAnnexAccrued', [a1, accruedAmt]);
      await send(comptroller, 'claimAnnex', [a1]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(accruedAmt);
    });
  });

  describe('claimAnnex batch', () => {
    it('should claim the expected amount when holders and arg is duplicated', async () => {
      const annRemaining = annexXAIRate.mul(100), deltaBlocks = 10, mintAmount = bnbExp(10);
      await send(comptroller.ann, 'transfer', [comptroller._address, annRemaining], {from: root});
      let [_, __, ...claimAccts] = saddle.accounts;
      for(let from of claimAccts) {
        await send(xai, 'harnessIncrementTotalSupply', [mintAmount]);
        expect(await send(xai, 'harnessSetBalanceOf', [from, mintAmount], { from })).toSucceed();
        expect(await await send(comptroller, 'harnessSetMintedXAIs', [from, mintAmount], { from })).toSucceed();
      }
      await fastForward(xaicontroller, deltaBlocks);

      const tx = await send(comptroller, 'claimAnnex', [[...claimAccts, ...claimAccts], [], false, false]);
      // ann distributed => 10e18
      for(let acct of claimAccts) {
        expect(await call(xaicontroller, 'annexXAIMinterIndex', [acct])).toEqualNumber(bnbDouble(1.0625));
        expect(await annBalance(comptroller, acct)).toEqualNumber(bnbExp(0.625));
      }
    });

    it('claims ann for multiple xai minters only, primes uninitiated', async () => {
      const annRemaining = annexXAIRate.mul(100), deltaBlocks = 10, mintAmount = bnbExp(10), xaiAmt = bnbExp(1), xaiMintIdx = bnbExp(1)
      await send(comptroller.ann, 'transfer', [comptroller._address, annRemaining], {from: root});
      let [_,__, ...claimAccts] = saddle.accounts;

      for(let acct of claimAccts) {
        await send(xai, 'harnessIncrementTotalSupply', [xaiAmt]);
        await send(xai, 'harnessSetBalanceOf', [acct, xaiAmt]);
        await send(comptroller, 'harnessSetMintedXAIs', [acct, xaiAmt]);
      }

      await send(xaicontroller, 'harnessFastForward', [10]);

      const tx = await send(comptroller, 'claimAnnex', [claimAccts, [], false, false]);
      for(let acct of claimAccts) {
        expect(await call(xaicontroller, 'annexXAIMinterIndex', [acct])).toEqualNumber(bnbDouble(1.625));
      }
    });
  });

  describe('_setAnnexXAIRate', () => {
    it('should correctly change annex xai rate if called by admin', async () => {
      expect(await call(comptroller, 'annexXAIRate')).toEqualNumber(annexXAIRate);
      const tx1 = await send(comptroller, '_setAnnexXAIRate', [bnbUnsigned(3e18)]);
      expect(await call(comptroller, 'annexXAIRate')).toEqualNumber(bnbUnsigned(3e18));
      const tx2 = await send(comptroller, '_setAnnexXAIRate', [bnbUnsigned(2e18)]);
      expect(await call(comptroller, 'annexXAIRate')).toEqualNumber(bnbUnsigned(2e18));
      expect(tx2).toHaveLog('NewAnnexXAIRate', {
        oldAnnexXAIRate: bnbUnsigned(3e18),
        newAnnexXAIRate: bnbUnsigned(2e18)
      });
    });

    it('should not change annex xai rate unless called by admin', async () => {
      await expect(
        send(comptroller, '_setAnnexXAIRate', [bnbUnsigned(1e18)], {from: a1})
      ).rejects.toRevert('revert only admin can');
    });
  });
});
