const {
  bnbBalance,
  bnbGasCost,
  getContract
} = require('./Utils/BSC');

const {
  makeComptroller,
  makeAToken,
  makePriceOracle,
  pretendBorrow,
  borrowSnapshot
} = require('./Utils/Annex');

describe('Maximillion', () => {
  let root, borrower;
  let maximillion, aBnb;
  beforeEach(async () => {
    [root, borrower] = saddle.accounts;
    aBnb = await makeAToken({kind: "abnb", supportMarket: true});
    maximillion = await deploy('Maximillion', [aBnb._address]);
  });

  describe("constructor", () => {
    it("sets address of aBnb", async () => {
      expect(await call(maximillion, "aBnb")).toEqual(aBnb._address);
    });
  });

  describe("repayBehalf", () => {
    it("refunds the entire amount with no borrows", async () => {
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost));
    });

    it("repays part of a borrow", async () => {
      await pretendBorrow(aBnb, borrower, 1, 1, 150);
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      const afterBorrowSnap = await borrowSnapshot(aBnb, borrower);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(100));
      expect(afterBorrowSnap.principal).toEqualNumber(50);
    });

    it("repays a full borrow and refunds the rest", async () => {
      await pretendBorrow(aBnb, borrower, 1, 1, 90);
      const beforeBalance = await bnbBalance(root);
      const result = await send(maximillion, "repayBehalf", [borrower], {value: 100});
      const gasCost = await bnbGasCost(result);
      const afterBalance = await bnbBalance(root);
      const afterBorrowSnap = await borrowSnapshot(aBnb, borrower);
      expect(result).toSucceed();
      expect(afterBalance).toEqualNumber(beforeBalance.sub(gasCost).sub(90));
      expect(afterBorrowSnap.principal).toEqualNumber(0);
    });
  });
});
