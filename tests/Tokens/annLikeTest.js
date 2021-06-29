const {
  makeAToken,
} = require('../Utils/Annex');
  
describe('AAnnLikeDelegate', function () {
  describe("_delegateAnnLikeTo", () => {
    it("does not delegate if not the admin", async () => {
      const [root, a1] = saddle.accounts;
      const aToken = await makeAToken({kind: 'aann'});
      await expect(send(aToken, '_delegateAnnLikeTo', [a1], {from: a1})).rejects.toRevert('revert only the admin may set the ann-like delegate');
    });

    it("delegates successfully if the admin", async () => {
      const [root, a1] = saddle.accounts, amount = 1;
      const aANN = await makeAToken({kind: 'aann'}), ANN = aANN.underlying;
      const tx1 = await send(aANN, '_delegateAnnLikeTo', [a1]);
      const tx2 = await send(ANN, 'transfer', [aANN._address, amount]);
      await expect(await call(ANN, 'getCurrentVotes', [a1])).toEqualNumber(amount);
    });
  });
});
