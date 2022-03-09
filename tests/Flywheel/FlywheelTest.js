const {
  makeComptroller,
  makeAToken,
  enterMarkets,
  balanceOf,
  fastForward,
  pretendBorrow,
  quickMint,
  quickBorrow,
} = require("../Utils/Annex");
const { bnbExp, bnbDouble, bnbUnsigned } = require("../Utils/BSC");

const annexRate = bnbUnsigned(1e18);
const annexInitialIndex = 1e36;

async function annexAccrued(comptroller, user) {
  return bnbUnsigned(await call(comptroller, "annexAccrued", [user]));
}

async function annBalance(comptroller, user) {
  return bnbUnsigned(await call(comptroller.ann, "balanceOf", [user]));
}

async function totalAnnexAccrued(comptroller, user) {
  return (await annexAccrued(comptroller, user)).add(
    await annBalance(comptroller, user)
  );
}

describe("Flywheel", () => {
  let root, a1, a2, a3, accounts;
  let comptroller, aLOW, aREP, aZRX, aEVIL;
  beforeEach(async () => {
    let interestRateModelOpts = { borrowRate: 0.000001 };
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    comptroller = await makeComptroller();
    aLOW = await makeAToken({
      comptroller,
      supportMarket: true,
      underlyingPrice: 1,
      interestRateModelOpts,
    });
    aREP = await makeAToken({
      comptroller,
      supportMarket: true,
      underlyingPrice: 2,
      interestRateModelOpts,
    });
    aZRX = await makeAToken({
      comptroller,
      supportMarket: true,
      underlyingPrice: 3,
      interestRateModelOpts,
    });
    aEVIL = await makeAToken({
      comptroller,
      supportMarket: false,
      underlyingPrice: 3,
      interestRateModelOpts,
    });
    aUSD = await makeAToken({
      comptroller,
      supportMarket: true,
      underlyingPrice: 1,
      collateralFactor: 0.5,
      interestRateModelOpts,
    });
  });

  // describe('_grantANN()', () => {
  //   beforeEach(async () => {
  //     await send(comptroller.ann, 'transfer', [comptroller._address, bnbUnsigned(50e18)], {from: root});
  //   });

  //   it('should award ann if called by admin', async () => {
  //     const tx = await send(comptroller, '_grantANN', [a1, 100]);
  //     expect(tx).toHaveLog('AnnexGranted', {
  //       recipient: a1,
  //       amount: 100
  //     });
  //   });

  //   it('should revert if not called by admin', async () => {
  //     await expect(
  //       send(comptroller, '_grantANN', [a1, 100], {from: a1})
  //     ).rejects.toRevert('revert only admin can grant ann');
  //   });

  //   it('should revert if insufficient ann', async () => {
  //     await expect(
  //       send(comptroller, '_grantANN', [a1, bnbUnsigned(1e20)])
  //     ).rejects.toRevert('revert insufficient ann for grant');
  //   });
  // });


  // describe("getAnnexMarkets()", () => {
  //   it("should return the annex markets", async () => {
  //     for (let mkt of [aLOW, aREP, aZRX]) {
  //       await send(comptroller, "_setAnnexSpeeds", [
  //         mkt._address,
  //         bnbExp(0.5),
  //         bnbExp(0.5),
  //       ]);
  //     }
  //     expect(await call(comptroller, "getAnnexMarkets")).toEqual(
  //       [aLOW, aREP, aZRX].map((c) => c._address)
  //     );
  //   });
  // });

  describe("_setAnnexSpeeds()", () => {
    it("should update market index when calling setAnnexSpeed", async () => {
      const mkt = aREP;
      await send(comptroller, "setBlockNumber", [0]);
      await send(mkt, "harnessSetTotalSupply", [bnbUnsigned(10e18)]);

      await send(comptroller, '_setAnnexSpeeds', [[mkt._address], [bnbExp(0.5)], [bnbExp(0.5)]]);
      await fastForward(comptroller, 20);
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(1)],
        [bnbExp(0.5)],
      ]);

      const { index, block } = await call(comptroller, "annexSupplyState", [mkt._address]);
      expect(index).toEqualNumber(2e36);
      expect(block).toEqualNumber(20);
    });

    it("should correctly drop a ann market if called by admin", async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, "_setAnnexSpeeds", [
          [mkt._address],
          [bnbExp(0.5)],
          [bnbExp(0.5)],
        ]);
      }
      const tx = await send(comptroller, "_setAnnexSpeeds", [
        [aLOW._address],
        [0],
        [0],
      ]);
      expect(await call(comptroller, "getAnnexMarkets")).toEqual(
        [aREP, aZRX].map((c) => c._address)
      );
      expect(tx).toHaveLog("AnnexSupplySpeedUpdated", {
        aToken: aLOW._address,
        oldSpeed: bnbExp(0.5),
        newSpeed: 0,
      });
      expect(tx).toHaveLog("AnnexBorrowSpeedUpdated", {
        aToken: aLOW._address,
        oldSpeed: bnbExp(0.5),
        newSpeed: 0,
      });
    });

    it("should correctly drop a ann market from middle of array", async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, "_setAnnexSpeeds", [
          [mkt._address],
          [bnbExp(0.5)],
          [bnbExp(0.5)],
        ]);
      }
      await send(comptroller, "_setAnnexSpeeds", [[aREP._address], [0], [0]]);
      expect(await call(comptroller, "getAnnexMarkets")).toEqual(
        [aLOW, aZRX].map((c) => c._address)
      );
    });

    it("should not drop a ann market unless called by admin", async () => {
      for (let mkt of [aLOW, aREP, aZRX]) {
        await send(comptroller, "_setAnnexSpeeds", [
          [mkt._address],
          [bnbExp(0.5)],
          [bnbExp(0.5)],
        ]);
      }
      await expect(
        send(comptroller, "_setAnnexSpeeds", [[aLOW._address], [0], [0]], { from: a1 })
      ).rejects.toRevert("revert only admin can set annex speed");
    });

    it("should not add non-listed markets", async () => {
      const aBAT = await makeAToken({ comptroller, supportMarket: false });
      await expect(
        send(comptroller, "harnessAddAnnexMarkets", [[aBAT._address]])
      ).rejects.toRevert("revert annex market is not listed");

      const markets = await call(comptroller, "getAnnexMarkets");
      expect(markets).toEqual([]);
    });
  });

  it("should correctly set differing ANN supply and borrow speeds", async () => {
    const desiredAnnexSupplySpeed = 3;
    const desiredAnnexBorrowSpeed = 20;
    const tx = await send(comptroller, "_setAnnexSpeeds", [
      [aLOW._address],
      [desiredAnnexSupplySpeed],
      [desiredAnnexBorrowSpeed],
    ]);
    expect(tx).toHaveLog(["AnnexSupplySpeedUpdated", 0], {
      aToken: aLOW._address,
      oldSpeed: 0,
      newSpeed: desiredAnnexSupplySpeed,
    });
    expect(tx).toHaveLog(["AnnexBorrowSpeedUpdated", 0], {
      aToken: aLOW._address,
      oldSpeed: 0,
      newSpeed: desiredAnnexBorrowSpeed,
    });
    const currentAnnexSupplySpeed = await call(
      comptroller,
      "annexSupplySpeeds",
      [aLOW._address]
    );
    const currentAnnexBorrowSpeed = await call(
      comptroller,
      "annexBorrowSpeeds",
      [aLOW._address]
    );
    expect(currentAnnexSupplySpeed).toEqualNumber(desiredAnnexSupplySpeed);
    expect(currentAnnexBorrowSpeed).toEqualNumber(desiredAnnexBorrowSpeed);
  });

  const checkAccrualsBorrowAndSupply = async ({
    annexSupplySpeed,
    annexBorrowSpeed,
  }) => {
    const mintAmount = bnbUnsigned(1000e18);
    const borrowAmount = bnbUnsigned(1e18);
    const borrowCollateralAmount = bnbUnsigned(1000e18);
    const annexRemaining = annexRate.mul(100);
    const deltaBlocks = 10;

    // Transfer ANN to the comptroller
    await send(
      comptroller.ann,
      "transfer",
      [comptroller._address, annexRemaining],
      { from: root }
    );

    // Set ann speeds to 0 while we setup
    await send(comptroller, "_setAnnexSpeeds", [[aLOW._address], [0], [0]]);
    await send(comptroller, "_setAnnexSpeeds", [[aUSD._address], [0], [0]]);

    // a2 - supply
    await quickMint(aLOW, a2, mintAmount); // a2 is the supplier

    // a1 - borrow (with supplied collateral)
    await quickMint(aUSD, a1, borrowCollateralAmount);
    await enterMarkets([aUSD], a1);
    expect(await quickBorrow(aLOW, a1, borrowAmount)).toSucceed(); // a1 is the borrower

    // Initialize ann speeds
    await send(comptroller, "_setAnnexSpeeds", [
      [aLOW._address],
      [annexSupplySpeed],
      [annexBorrowSpeed],
    ]);

    // Get initial ann balances
    const a1TotalAnnexPre = await totalAnnexAccrued(comptroller, a1);
    const a2TotalAnnexPre = await totalAnnexAccrued(comptroller, a2);

    // Start off with no ann accrued and no ann balance
    expect(a1TotalAnnexPre).toEqualNumber(0);
    expect(a2TotalAnnexPre).toEqualNumber(0);

    // Fast forward blocks
    await fastForward(comptroller, deltaBlocks);

    // Accrue ann
    await send(comptroller, "claimAnnex", [
      [a1, a2],
      [aLOW._address],
      true,
      true,
    ]);

    // Get accrued ann balances
    const a1TotalAnnexPost = await totalAnnexAccrued(comptroller, a1);
    const a2TotalAnnexPost = await totalAnnexAccrued(comptroller, a2);

    // check accrual for borrow
    if (Number(annexBorrowSpeed) == 0) {
      expect(a1TotalAnnexPost).toEqualNumber(0);
    } else {
      expect(a1TotalAnnexPost).toEqualNumber(
        annexBorrowSpeed.mul(deltaBlocks).sub(1)
      );
    }

    // check accrual for supply
    if (Number(annexSupplySpeed) == 0) {
      expect(a2TotalAnnexPost).toEqualNumber(0);
    } else {
      expect(a2TotalAnnexPost).toEqualNumber(annexSupplySpeed.mul(deltaBlocks));
    }
  };

  it("should accrue ANN correctly with only supply-side rewards", async () => {
    await checkAccrualsBorrowAndSupply({
      annexSupplySpeed: bnbExp(0.5),
      annexBorrowSpeed: bnbExp(0.5),
    });
  });

  it("should accrue ANN correctly with only borrow-side rewards", async () => {
    await checkAccrualsBorrowAndSupply({
      annexSupplySpeed: 0,
      annexBorrowSpeed: bnbExp(0.5),
    });
  });
  // });

  describe("updateAnnexBorrowIndex()", () => {
    it("should calculate ann borrower index correctly", async () => {
      const mkt = aREP;
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "setBlockNumber", [100]);
      await send(mkt, "harnessSetTotalBorrows", [bnbUnsigned(11e18)]);
      await send(comptroller, "harnessUpdateAnnexBorrowIndex", [
        mkt._address,
        bnbExp(1.1),
      ]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        annexAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + annexAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */

      const { index, block } = await call(comptroller, "annexBorrowState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it("should not revert or update annexBorrowState index if aToken not in Annex markets", async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAnnexMarket: false,
      });
      await send(comptroller, "setBlockNumber", [100]);
      await send(comptroller, "harnessUpdateAnnexBorrowIndex", [
        mkt._address,
        bnbExp(1.1),
      ]);

      const { index, block } = await call(comptroller, "annexBorrowState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(annexInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        mkt._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        mkt._address,
      ]);
      expect(supplySpeed).toEqualNumber(0);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it("should not update index if no blocks passed since last accrual", async () => {
      const mkt = aREP;
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "harnessUpdateAnnexBorrowIndex", [
        mkt._address,
        bnbExp(1.1),
      ]);

      const { index, block } = await call(comptroller, "annexBorrowState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(0);
    });

    it("should not update index if annex speed is 0", async () => {
      const mkt = aREP;
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "setBlockNumber", [100]);
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0)],
        [bnbExp(0)],
      ]);
      await send(comptroller, "harnessUpdateAnnexBorrowIndex", [
        mkt._address,
        bnbExp(1.1),
      ]);

      const { index, block } = await call(comptroller, "annexBorrowState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(100);
    });
  });

  describe("updateAnnexSupplyIndex()", () => {
    it("should calculate ann supplier index correctly", async () => {
      const mkt = aREP;
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "setBlockNumber", [100]);
      await send(mkt, "harnessSetTotalSupply", [bnbUnsigned(10e18)]);
      await send(comptroller, "harnessUpdateAnnexSupplyIndex", [mkt._address]);
      /*
        suppyTokens = 10e18
        annexAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += annexAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      const { index, block } = await call(comptroller, "annexSupplyState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(6e36);
      expect(block).toEqualNumber(100);
    });

    it("should not update index on non-Annex markets", async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAnnexMarket: false,
      });
      await send(comptroller, "setBlockNumber", [100]);
      await send(comptroller, "harnessUpdateAnnexSupplyIndex", [mkt._address]);

      const { index, block } = await call(comptroller, "annexSupplyState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(annexInitialIndex);
      expect(block).toEqualNumber(100);
      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        mkt._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        mkt._address,
      ]);
      expect(supplySpeed).toEqualNumber(0);
      expect(borrowSpeed).toEqualNumber(0);
      // atoken could have no annex speed or ann supplier state if not in annex markets
      // this logic could also possibly be implemented in the allowed hook
    });

    it("should not update index if no blocks passed since last accrual", async () => {
      const mkt = aREP;
      await send(comptroller, "setBlockNumber", [0]);
      await send(mkt, "harnessSetTotalSupply", [bnbUnsigned(10e18)]);
      await send(comptroller, "_setAnnexSpeeds", [
        [mkt._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "harnessUpdateAnnexSupplyIndex", [mkt._address]);

      const { index, block } = await call(comptroller, "annexSupplyState", [
        mkt._address,
      ]);
      expect(index).toEqualNumber(1e36);
      expect(block).toEqualNumber(0);
    });

    it("should not matter if the index is updated multiple times", async () => {
      const annexRemaining = annexRate.mul(100);
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, "harnessRefreshAnnexSpeeds");

      await quickMint(aLOW, a2, bnbUnsigned(10e18));
      await quickMint(aLOW, a3, bnbUnsigned(15e18));

      const a2Accrued0 = await totalAnnexAccrued(comptroller, a2);
      const a3Accrued0 = await totalAnnexAccrued(comptroller, a3);
      const a2Balance0 = await balanceOf(aLOW, a2);
      const a3Balance0 = await balanceOf(aLOW, a3);

      await fastForward(comptroller, 20);

      const txT1 = await send(
        aLOW,
        "transfer",
        [a2, a3Balance0.sub(a2Balance0)],
        { from: a3 }
      );

      const a2Accrued1 = await totalAnnexAccrued(comptroller, a2);
      const a3Accrued1 = await totalAnnexAccrued(comptroller, a3);
      const a2Balance1 = await balanceOf(aLOW, a2);
      const a3Balance1 = await balanceOf(aLOW, a3);

      await fastForward(comptroller, 10);
      await send(comptroller, "harnessUpdateAnnexSupplyIndex", [aLOW._address]);
      await fastForward(comptroller, 10);

      const txT2 = await send(
        aLOW,
        "transfer",
        [a3, a2Balance1.sub(a3Balance1)],
        { from: a2 }
      );

      const a2Accrued2 = await totalAnnexAccrued(comptroller, a2);
      const a3Accrued2 = await totalAnnexAccrued(comptroller, a3);

      expect(a2Accrued0).toEqualNumber(0);
      expect(a3Accrued0).toEqualNumber(0);
      expect(a2Accrued1).not.toEqualNumber(0);
      expect(a3Accrued1).not.toEqualNumber(0);
      expect(a2Accrued1).toEqualNumber(a3Accrued2.sub(a3Accrued1));
      expect(a3Accrued1).toEqualNumber(a2Accrued2.sub(a2Accrued1));

      expect(txT1.gasUsed).toBeLessThan(220000);
      expect(txT1.gasUsed).toBeGreaterThan(150000);
      expect(txT2.gasUsed).toBeLessThan(150000);
      expect(txT2.gasUsed).toBeGreaterThan(100000);
    });
  });

  describe("distributeBorrowerAnnex()", () => {
    it("should update borrow index checkpoint but not annexAccrued for first time user", async () => {
      const mkt = aREP;
      await send(comptroller, "setAnnexBorrowState", [
        mkt._address,
        bnbDouble(6),
        10,
      ]);
      await send(comptroller, "setAnnexBorrowerIndex", [
        mkt._address,
        root,
        bnbUnsigned(0),
      ]);

      await send(comptroller, "harnessDistributeBorrowerAnnex", [
        mkt._address,
        root,
        bnbExp(1.1),
      ]);
      expect(await call(comptroller, "annexAccrued", [root])).toEqualNumber(0);
      expect(
        await call(comptroller, "annexBorrowerIndex", [mkt._address, root])
      ).toEqualNumber(6e36);
    });

    it("should transfer ann and update borrow index checkpoint correctly for repeat time user", async () => {
      const mkt = aREP;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, bnbUnsigned(50e18)],
        { from: root }
      );
      await send(mkt, "harnessSetAccountBorrows", [
        a1,
        bnbUnsigned(5.5e18),
        bnbExp(1),
      ]);
      await send(comptroller, "setAnnexBorrowState", [
        mkt._address,
        bnbDouble(6),
        10,
      ]);
      await send(comptroller, "setAnnexBorrowerIndex", [
        mkt._address,
        a1,
        bnbDouble(1),
      ]);

      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 annexBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 25e18 ANN
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e18 * 1e18 / 1.1e18 = 5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e18 * 5e36 / 1e36 = 25e18
      */
      const tx = await send(comptroller, "harnessDistributeBorrowerAnnex", [
        mkt._address,
        a1,
        bnbUnsigned(1.1e18),
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(25e18);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
      expect(tx).toHaveLog("DistributedBorrowerAnnex", {
        aToken: mkt._address,
        borrower: a1,
        annexDelta: bnbUnsigned(25e18).toString(),
        annexBorrowIndex: bnbDouble(6).toString(),
      });
    });

    it("should not transfer ann automatically", async () => {
      const mkt = aREP;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, bnbUnsigned(50e18)],
        { from: root }
      );
      await send(mkt, "harnessSetAccountBorrows", [
        a1,
        bnbUnsigned(5.5e17),
        bnbExp(1),
      ]);
      await send(comptroller, "setAnnexBorrowState", [
        mkt._address,
        bnbDouble(1.0019),
        10,
      ]);
      await send(comptroller, "setAnnexBorrowerIndex", [
        mkt._address,
        a1,
        bnbDouble(1),
      ]);
      /*
        borrowerAmount = borrowBalance * 1e18 / borrow idx
                       = 5.5e17 * 1e18 / 1.1e18 = 5e17
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 1.0019e36 - 1e36 = 0.0019e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
        0.00095e18 < annexClaimThreshold of 0.001e18
      */
      await send(comptroller, "harnessDistributeBorrowerAnnex", [
        mkt._address,
        a1,
        bnbExp(1.1),
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
    });

    it("should not revert or distribute when called with non-Annex market", async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAnnexMarket: false,
      });

      await send(comptroller, "harnessDistributeBorrowerAnnex", [
        mkt._address,
        a1,
        bnbExp(1.1),
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
      expect(
        await call(comptroller, "annexBorrowerIndex", [mkt._address, a1])
      ).toEqualNumber(annexInitialIndex);
    });
  });

  describe("distributeSupplierAnnex()", () => {
    it("should transfer ann and update supply index correctly for first time user", async () => {
      const mkt = aREP;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, bnbUnsigned(50e18)],
        { from: root }
      );

      await send(mkt, "harnessSetBalance", [a1, bnbUnsigned(5e18)]);
      await send(comptroller, "setAnnexSupplyState", [
        mkt._address,
        bnbDouble(6),
        10,
      ]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 annexSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 ANN:
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 1e36 = 5e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 5e36 / 1e36 = 25e18
      */

      const tx = await send(comptroller, "harnessDistributeAllSupplierAnnex", [
        mkt._address,
        a1,
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(25e18);
      expect(tx).toHaveLog("DistributedSupplierAnnex", {
        aToken: mkt._address,
        supplier: a1,
        annexDelta: bnbUnsigned(25e18).toString(),
        annexSupplyIndex: bnbDouble(6).toString(),
      });
    });

    it("should update ann accrued and supply index for repeat user", async () => {
      const mkt = aREP;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, bnbUnsigned(50e18)],
        { from: root }
      );

      await send(mkt, "harnessSetBalance", [a1, bnbUnsigned(5e18)]);
      await send(comptroller, "setAnnexSupplyState", [
        mkt._address,
        bnbDouble(6),
        10,
      ]);
      await send(comptroller, "setAnnexSupplierIndex", [
        mkt._address,
        a1,
        bnbDouble(2),
      ]);
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */

      await send(comptroller, "harnessDistributeAllSupplierAnnex", [
        mkt._address,
        a1,
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(20e18);
    });

    it("should not transfer when annexAccrued below threshold", async () => {
      const mkt = aREP;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, bnbUnsigned(50e18)],
        { from: root }
      );

      await send(mkt, "harnessSetBalance", [a1, bnbUnsigned(5e17)]);
      await send(comptroller, "setAnnexSupplyState", [
        mkt._address,
        bnbDouble(1.0019),
        10,
      ]);
      /*
        supplierAmount  = 5e17
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 1.0019e36 - 1e36 = 0.0019e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e17 * 0.0019e36 / 1e36 = 0.00095e18
      */

      await send(comptroller, "harnessDistributeSupplierAnnex", [
        mkt._address,
        a1,
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0.00095e18);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
    });

    it("should not revert or distribute when called with non-Annex market", async () => {
      const mkt = await makeAToken({
        comptroller: comptroller,
        supportMarket: true,
        addAnnexMarket: false,
      });

      await send(comptroller, "harnessDistributeSupplierAnnex", [
        mkt._address,
        a1,
      ]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(0);
      expect(
        await call(comptroller, "annexBorrowerIndex", [mkt._address, a1])
      ).toEqualNumber(0);
    });
  });

  describe("transferANN", () => {
    it("should transfer ann accrued when amount is above threshold", async () => {
      const annexRemaining = 1000,
        a1AccruedPre = 100,
        threshold = 1;
      const annBalancePre = await annBalance(comptroller, a1);
      const tx0 = await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      const tx1 = await send(comptroller, "setAnnexAccrued", [
        a1,
        a1AccruedPre,
      ]);
      const tx2 = await send(comptroller, "harnessTransferAnnex", [
        a1,
        a1AccruedPre,
        threshold,
      ]);
      const a1AccruedPost = await annexAccrued(comptroller, a1);
      const annBalancePost = await annBalance(comptroller, a1);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(a1AccruedPre);
    });

    it("should not transfer when ann accrued is below threshold", async () => {
      const annexRemaining = 1000,
        a1AccruedPre = 100,
        threshold = 101;
      const annBalancePre = await call(comptroller.ann, "balanceOf", [a1]);
      const tx0 = await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      const tx1 = await send(comptroller, "setAnnexAccrued", [
        a1,
        a1AccruedPre,
      ]);
      const tx2 = await send(comptroller, "harnessTransferAnnex", [
        a1,
        a1AccruedPre,
        threshold,
      ]);
      const a1AccruedPost = await annexAccrued(comptroller, a1);
      const annBalancePost = await annBalance(comptroller, a1);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(0);
    });

    it("should not transfer ann if ann accrued is greater than ann remaining", async () => {
      const annexRemaining = 99,
        a1AccruedPre = 100,
        threshold = 1;
      const annBalancePre = await annBalance(comptroller, a1);
      const tx0 = await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      const tx1 = await send(comptroller, "setAnnexAccrued", [
        a1,
        a1AccruedPre,
      ]);
      const tx2 = await send(comptroller, "harnessTransferAnnex", [
        a1,
        a1AccruedPre,
        threshold,
      ]);
      const a1AccruedPost = await annexAccrued(comptroller, a1);
      const annBalancePost = await annBalance(comptroller, a1);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(0);
    });
  });

  describe("claimAnnex", () => {
    it("should accrue ann and then transfer ann accrued", async () => {
      const annexRemaining = annexRate.mul(100),
        mintAmount = bnbUnsigned(12e18),
        deltaBlocks = 10;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, "_setAnnexSpeeds", [
        [aLOW._address],
        [bnbExp(0.5)],
        [bnbExp(0.5)],
      ]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");
      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        aLOW._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        aLOW._address,
      ]);
      const a2AccruedPre = await annexAccrued(comptroller, a2);
      const annBalancePre = await annBalance(comptroller, a2);
      await quickMint(aLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, "claimAnnex", [a2]);
      const a2AccruedPost = await annexAccrued(comptroller, a2);
      const annBalancePost = await annBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(600000);
      expect(supplySpeed).toEqualNumber(annexRate);
      expect(borrowSpeed).toEqualNumber(annexRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(annexRate.mul(deltaBlocks).sub(1)); // index is 8333...
    });

    it("should accrue ann and then transfer ann accrued in a single market", async () => {
      const annexRemaining = annexRate.mul(100),
        mintAmount = bnbUnsigned(12e18),
        deltaBlocks = 10;
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");
      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        aLOW._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        aLOW._address,
      ]);
      const a2AccruedPre = await annexAccrued(comptroller, a2);
      const annBalancePre = await annBalance(comptroller, a2);
      await quickMint(aLOW, a2, mintAmount);
      await fastForward(comptroller, deltaBlocks);
      const tx = await send(comptroller, "claimAnnex", [a2, [aLOW._address]]);
      const a2AccruedPost = await annexAccrued(comptroller, a2);
      const annBalancePost = await annBalance(comptroller, a2);
      expect(tx.gasUsed).toBeLessThan(300000);
      expect(supplySpeed).toEqualNumber(annexRate);
      expect(borrowSpeed).toEqualNumber(annexRate);
      expect(a2AccruedPre).toEqualNumber(0);
      expect(a2AccruedPost).toEqualNumber(0);
      expect(annBalancePre).toEqualNumber(0);
      expect(annBalancePost).toEqualNumber(annexRate.mul(deltaBlocks).sub(1)); // index is 8333...
    });

    it("should claim when ann accrued is below threshold", async () => {
      const annexRemaining = bnbExp(1),
        accruedAmt = bnbUnsigned(0.0009e18);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      await send(comptroller, "setAnnexAccrued", [a1, accruedAmt]);
      await send(comptroller, "claimAnnex", [a1, [aLOW._address]]);
      expect(await annexAccrued(comptroller, a1)).toEqualNumber(0);
      expect(await annBalance(comptroller, a1)).toEqualNumber(accruedAmt);
    });

    it("should revert when a market is not listed", async () => {
      const aNOT = await makeAToken({ comptroller });
      await expect(
        send(comptroller, "claimAnnex", [a1, [aNOT._address]])
      ).rejects.toRevert("revert not listed market");
    });
  });

  describe("claimAnnex batch", () => {
    it("should revert when claiming ann from non-listed market", async () => {
      const annexRemaining = annexRate.mul(100),
        deltaBlocks = 10,
        mintAmount = bnbExp(10);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      let [_, __, ...claimAccts] = saddle.accounts;

      for (let from of claimAccts) {
        expect(
          await send(aLOW.underlying, "harnessSetBalance", [from, mintAmount], {
            from,
          })
        ).toSucceed();
        send(aLOW.underlying, "approve", [aLOW._address, mintAmount], { from });
        send(aLOW, "mint", [mintAmount], { from });
      }

      await pretendBorrow(aLOW, root, 1, 1, bnbExp(10));
      await send(comptroller, "harnessRefreshAnnexSpeeds");

      await fastForward(comptroller, deltaBlocks);

      await expect(
        send(comptroller, "claimAnnex", [
          claimAccts,
          [aLOW._address, aEVIL._address],
          true,
          true,
        ])
      ).rejects.toRevert("revert not listed market");
    });

    it("should claim the expected amount when holders and atokens arg is duplicated", async () => {
      const annexRemaining = annexRate.mul(100),
        deltaBlocks = 10,
        mintAmount = bnbExp(10);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      let [_, __, ...claimAccts] = saddle.accounts;
      for (let from of claimAccts) {
        expect(
          await send(aLOW.underlying, "harnessSetBalance", [from, mintAmount], {
            from,
          })
        ).toSucceed();
        send(aLOW.underlying, "approve", [aLOW._address, mintAmount], { from });
        send(aLOW, "mint", [mintAmount], { from });
      }
      await pretendBorrow(aLOW, root, 1, 1, bnbExp(10));
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, "claimAnnex", [
        [...claimAccts, ...claimAccts],
        [aLOW._address, aLOW._address],
        false,
        true,
      ]);
      // ann distributed => 10e18
      for (let acct of claimAccts) {
        expect(
          await call(comptroller, "annexSupplierIndex", [aLOW._address, acct])
        ).toEqualNumber(bnbDouble(1.125));
        expect(await annBalance(comptroller, acct)).toEqualNumber(bnbExp(1.25));
      }
    });

    it("claims ann for multiple suppliers only", async () => {
      const annexRemaining = annexRate.mul(100),
        deltaBlocks = 10,
        mintAmount = bnbExp(10);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      let [_, __, ...claimAccts] = saddle.accounts;
      for (let from of claimAccts) {
        expect(
          await send(aLOW.underlying, "harnessSetBalance", [from, mintAmount], {
            from,
          })
        ).toSucceed();
        send(aLOW.underlying, "approve", [aLOW._address, mintAmount], { from });
        send(aLOW, "mint", [mintAmount], { from });
      }
      await pretendBorrow(aLOW, root, 1, 1, bnbExp(10));
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");

      await fastForward(comptroller, deltaBlocks);

      const tx = await send(comptroller, "claimAnnex", [
        claimAccts,
        [aLOW._address],
        false,
        true,
      ]);
      // ann distributed => 10e18
      for (let acct of claimAccts) {
        expect(
          await call(comptroller, "annexSupplierIndex", [aLOW._address, acct])
        ).toEqualNumber(bnbDouble(1.125));
        expect(await annBalance(comptroller, acct)).toEqualNumber(bnbExp(1.25));
      }
    });

    it("claims ann for multiple borrowers only, primes uninitiated", async () => {
      const annexRemaining = annexRate.mul(100),
        deltaBlocks = 10,
        mintAmount = bnbExp(10),
        borrowAmt = bnbExp(1),
        borrowIdx = bnbExp(1);
      await send(
        comptroller.ann,
        "transfer",
        [comptroller._address, annexRemaining],
        { from: root }
      );
      let [_, __, ...claimAccts] = saddle.accounts;

      for (let acct of claimAccts) {
        await send(aLOW, "harnessIncrementTotalBorrows", [borrowAmt]);
        await send(aLOW, "harnessSetAccountBorrows", [
          acct,
          borrowAmt,
          borrowIdx,
        ]);
      }
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");

      await send(comptroller, "harnessFastForward", [10]);

      const tx = await send(comptroller, "claimAnnex", [
        claimAccts,
        [aLOW._address],
        true,
        false,
      ]);
      for (let acct of claimAccts) {
        expect(
          await call(comptroller, "annexBorrowerIndex", [aLOW._address, acct])
        ).toEqualNumber(bnbDouble(2.25));
        expect(
          await call(comptroller, "annexSupplierIndex", [aLOW._address, acct])
        ).toEqualNumber(0);
      }
    });

    it("should revert when a market is not listed", async () => {
      const aNOT = await makeAToken({ comptroller });
      await expect(
        send(comptroller, "claimAnnex", [[a1, a2], [aNOT._address], true, true])
      ).rejects.toRevert("revert not listed market");
    });
  });

  describe("harnessRefreshAnnexSpeeds", () => {
    it("should start out 0", async () => {
      await send(comptroller, "harnessRefreshAnnexSpeeds");
      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        aLOW._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        aLOW._address,
      ]);
      expect(supplySpeed).toEqualNumber(0);
      expect(borrowSpeed).toEqualNumber(0);
    });

    it("should get correct speeds with borrows", async () => {
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await send(comptroller, "harnessAddAnnexMarkets", [[aLOW._address]]);
      const tx = await send(comptroller, "harnessRefreshAnnexSpeeds");

      const supplySpeed = await call(comptroller, "annexSupplySpeeds", [
        aLOW._address,
      ]);
      const borrowSpeed = await call(comptroller, "annexBorrowSpeeds", [
        aLOW._address,
      ]);
      expect(supplySpeed).toEqualNumber(annexRate);
      expect(borrowSpeed).toEqualNumber(annexRate);
      expect(tx).toHaveLog(["AnnexSupplySpeedUpdated", 0], {
        aToken: aLOW._address,
        oldSpeed: 1, // since harnessAddAnnexMarkets sets speeds to 1
        newSpeed: supplySpeed,
      });
      expect(tx).toHaveLog(["AnnexBorrowSpeedUpdated", 0], {
        aToken: aLOW._address,
        oldSpeed: 1, // since harnessAddAnnexMarkets sets speeds to 1
        newSpeed: borrowSpeed,
      });
    });

    it("should get correct speeds for 2 assets", async () => {
      await pretendBorrow(aLOW, a1, 1, 1, 100);
      await pretendBorrow(aZRX, a1, 1, 1, 100);
      await send(comptroller, "harnessAddAnnexMarkets", [
        [aLOW._address, aZRX._address],
      ]);
      await send(comptroller, "harnessRefreshAnnexSpeeds");
      const supplySpeed1 = await call(comptroller, "annexSupplySpeeds", [
        aLOW._address,
      ]);
      const supplySpeed2 = await call(comptroller, "annexSupplySpeeds", [
        aREP._address,
      ]);
      const supplySpeed3 = await call(comptroller, "annexSupplySpeeds", [
        aZRX._address,
      ]);
      const borrowSpeed1 = await call(comptroller, "annexBorrowSpeeds", [
        aLOW._address,
      ]);
      const borrowSpeed2 = await call(comptroller, "annexBorrowSpeeds", [
        aREP._address,
      ]);
      const borrowSpeed3 = await call(comptroller, "annexBorrowSpeeds", [
        aZRX._address,
      ]);
      expect(supplySpeed1).toEqualNumber(annexRate.div(4));
      expect(borrowSpeed1).toEqualNumber(annexRate.div(4));
      expect(supplySpeed2).toEqualNumber(0);
      expect(borrowSpeed2).toEqualNumber(0);
      expect(supplySpeed3).toEqualNumber(annexRate.div(4).mul(3));
      expect(borrowSpeed3).toEqualNumber(annexRate.div(4).mul(3));
    });
  });

  describe("harnessAddAnnexMarkets", () => {
    it("should correctly add a annex market if called by admin", async () => {
      const aBAT = await makeAToken({ comptroller, supportMarket: true });
      const tx1 = await send(comptroller, "harnessAddAnnexMarkets", [
        [aLOW._address, aREP._address, aZRX._address],
      ]);
      const tx2 = await send(comptroller, "harnessAddAnnexMarkets", [
        [aBAT._address],
      ]);
      const markets = await call(comptroller, "getAnnexMarkets");
      expect(markets).toEqual([aLOW, aREP, aZRX, aBAT].map((c) => c._address));
      expect(tx2).toHaveLog("AnnexSupplySpeedUpdated", {
        aToken: aBAT._address,
        oldSpeed: 0,
        newSpeed: 1,
      });
      expect(tx2).toHaveLog("AnnexBorrowSpeedUpdated", {
        aToken: aBAT._address,
        oldSpeed: 0,
        newSpeed: 1,
      });
    });

    it("should not write over a markets existing state", async () => {
      const mkt = aLOW._address;
      const bn0 = 10,
        bn1 = 20;
      const idx = bnbUnsigned(1.5e36);

      await send(comptroller, "harnessAddAnnexMarkets", [[mkt]]);
      await send(comptroller, "setAnnexSupplyState", [mkt, idx, bn0]);
      await send(comptroller, "setAnnexBorrowState", [mkt, idx, bn0]);
      await send(comptroller, "setBlockNumber", [bn1]);
      await send(comptroller, "_setAnnexSpeeds", [[mkt], [0], [0]]);
      await send(comptroller, "harnessAddAnnexMarkets", [[mkt]]);

      const supplyState = await call(comptroller, "annexSupplyState", [mkt]);
      expect(supplyState.block).toEqual(bn1.toString());
      expect(supplyState.index).toEqual(idx.toString());

      const borrowState = await call(comptroller, "annexBorrowState", [mkt]);
      expect(borrowState.block).toEqual(bn1.toString());
      expect(borrowState.index).toEqual(idx.toString());
    });
  });
});
