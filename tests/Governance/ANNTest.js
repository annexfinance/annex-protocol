const {
  address,
  advanceBlocks,
  minerStart,
  minerStop,
  unlockedAccount,
  mineBlock
} = require('../Utils/BSC');

const EIP712 = require('../Utils/EIP712');

describe('ANN', () => {
  const name = 'Annex';
  const symbol = 'ANN';

  let root, a1, a2, accounts, chainId;
  let ann;
  let epochBlocks = 100;
  let epochROI = 20;

  beforeEach(async () => {
    [root, a1, a2, ...accounts] = saddle.accounts;
    chainId = 1; // await web3.eth.net.getId(); See: https://github.com/trufflesuite/ganache-core/issues/515
    try {
      ann = await deploy('ANN', [root]);
    } catch (err) {
      console.log('deploy error: ', err);
    }

    // await send(ann, 'setDailyROI', ['20'], { from: root }); // set daily ROI by owner
    // await send(ann, 'setEpochBlockCount', ['100'], { from: root }); // set epoch block count by owner
    // blocksPerEpoch = Number(await call(ann, 'blocksPerEpoch', []));
  });

  describe('metadata', () => {
    it('has given name', async () => {
      expect(await call(ann, 'name')).toEqual(name);
    });

    it('has given symbol', async () => {
      expect(await call(ann, 'symbol')).toEqual(symbol);
    });
  });

  describe('balanceOf', () => {
    it('grants to initial account', async () => {
      expect(await call(ann, 'balanceOf', [root])).toEqual("100000000000000000000000000");
    });
  });

  describe('delegateBySig', () => {
    const Domain = (ann) => ({ name, chainId, verifyingContract: ann._address });
    const Types = {
      Delegation: [
        { name: 'delegatee', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expiry', type: 'uint256' }
      ]
    };

    it('reverts if the signatory is invalid', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      await expect(send(ann, 'delegateBySig', [delegatee, nonce, expiry, 0, '0xbad', '0xbad'])).rejects.toRevert("revert ANN::delegateBySig: invalid signature");
    });

    it('reverts if the nonce is bad ', async () => {
      const delegatee = root, nonce = 1, expiry = 0;
      const { v, r, s } = EIP712.sign(Domain(ann), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
      await expect(send(ann, 'delegateBySig', [delegatee, nonce, expiry, v, r, s])).rejects.toRevert("revert ANN::delegateBySig: invalid nonce");
    });

    it('reverts if the signature has expired', async () => {
      const delegatee = root, nonce = 0, expiry = 0;
      const { v, r, s } = EIP712.sign(Domain(ann), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
      await expect(send(ann, 'delegateBySig', [delegatee, nonce, expiry, v, r, s])).rejects.toRevert("revert ANN::delegateBySig: signature expired");
    });

    it('delegates on behalf of the signatory', async () => {
      const delegatee = root, nonce = 0, expiry = 10e9;
      const { v, r, s } = EIP712.sign(Domain(ann), 'Delegation', { delegatee, nonce, expiry }, Types, unlockedAccount(a1).secretKey);
      expect(await call(ann, 'delegates', [a1])).toEqual(address(0));
      const tx = await send(ann, 'delegateBySig', [delegatee, nonce, expiry, v, r, s]);
      expect(tx.gasUsed < 80000);
      expect(await call(ann, 'delegates', [a1])).toEqual(root);
    });
  });

  describe('numCheckpoints', () => {
    it('returns the number of checkpoints for a delegate', async () => {
      let guy = accounts[0];
      await send(ann, 'transfer', [guy, '100']); //give an account a few tokens for readability
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('0');

      const t1 = await send(ann, 'delegate', [a1], { from: guy });
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('1');

      const t2 = await send(ann, 'transfer', [a2, 10], { from: guy });
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('2');

      const t3 = await send(ann, 'transfer', [a2, 10], { from: guy });
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('3');

      const t4 = await send(ann, 'transfer', [guy, 20], { from: root });
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('4');

      await expect(call(ann, 'checkpoints', [a1, 0])).resolves.toEqual(expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '100' }));
      await expect(call(ann, 'checkpoints', [a1, 1])).resolves.toEqual(expect.objectContaining({ fromBlock: t2.blockNumber.toString(), votes: '90' }));
      await expect(call(ann, 'checkpoints', [a1, 2])).resolves.toEqual(expect.objectContaining({ fromBlock: t3.blockNumber.toString(), votes: '80' }));
      await expect(call(ann, 'checkpoints', [a1, 3])).resolves.toEqual(expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '100' }));
    });

    it('does not add more than one checkpoint in a block', async () => {
      let guy = accounts[0];

      await send(ann, 'transfer', [guy, '100']); //give an account a few tokens for readability
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('0');
      await minerStop();

      let t1 = send(ann, 'delegate', [a1], { from: guy });
      let t2 = send(ann, 'transfer', [a2, 10], { from: guy });
      let t3 = send(ann, 'transfer', [a2, 10], { from: guy });

      await minerStart();
      t1 = await t1;
      t2 = await t2;
      t3 = await t3;

      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('1');

      await expect(call(ann, 'checkpoints', [a1, 0])).resolves.toEqual(expect.objectContaining({ fromBlock: t1.blockNumber.toString(), votes: '80' }));
      await expect(call(ann, 'checkpoints', [a1, 1])).resolves.toEqual(expect.objectContaining({ fromBlock: '0', votes: '0' }));
      await expect(call(ann, 'checkpoints', [a1, 2])).resolves.toEqual(expect.objectContaining({ fromBlock: '0', votes: '0' }));

      const t4 = await send(ann, 'transfer', [guy, 20], { from: root });
      await expect(call(ann, 'numCheckpoints', [a1])).resolves.toEqual('2');
      await expect(call(ann, 'checkpoints', [a1, 1])).resolves.toEqual(expect.objectContaining({ fromBlock: t4.blockNumber.toString(), votes: '100' }));
    });
  });

  describe('getPriorVotes', () => {
    it('reverts if block number >= current block', async () => {
      await expect(call(ann, 'getPriorVotes', [a1, 5e10])).rejects.toRevert("revert ANN::getPriorVotes: not yet determined");
    });

    it('returns 0 if there are no checkpoints', async () => {
      expect(await call(ann, 'getPriorVotes', [a1, 0])).toEqual('0');
    });

    it('returns the latest block if >= last checkpoint block', async () => {
      const t1 = await send(ann, 'delegate', [a1], { from: root });
      await mineBlock();
      await mineBlock();

      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber])).toEqual('100000000000000000000000000');
      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('100000000000000000000000000');
    });

    it('returns zero if < first checkpoint block', async () => {
      await mineBlock();
      const t1 = await send(ann, 'delegate', [a1], { from: root });
      await mineBlock();
      await mineBlock();

      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('100000000000000000000000000');
    });

    it('generally returns the voting balance at the appropriate checkpoint', async () => {
      const t1 = await send(ann, 'delegate', [a1], { from: root });
      await mineBlock();
      await mineBlock();
      const t2 = await send(ann, 'transfer', [a2, 10], { from: root });
      await mineBlock();
      await mineBlock();
      const t3 = await send(ann, 'transfer', [a2, 10], { from: root });
      await mineBlock();
      await mineBlock();
      const t4 = await send(ann, 'transfer', [root, 20], { from: a2 });
      await mineBlock();
      await mineBlock();

      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber])).toEqual('100000000000000000000000000');
      expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('100000000000000000000000000');
      expect(await call(ann, 'getPriorVotes', [a1, t2.blockNumber])).toEqual('99999999999999999999999990');
      expect(await call(ann, 'getPriorVotes', [a1, t2.blockNumber + 1])).toEqual('99999999999999999999999990');
      expect(await call(ann, 'getPriorVotes', [a1, t3.blockNumber])).toEqual('99999999999999999999999980');
      expect(await call(ann, 'getPriorVotes', [a1, t3.blockNumber + 1])).toEqual('99999999999999999999999980');
      expect(await call(ann, 'getPriorVotes', [a1, t4.blockNumber])).toEqual('100000000000000000000000000');
      expect(await call(ann, 'getPriorVotes', [a1, t4.blockNumber + 1])).toEqual('100000000000000000000000000');
    });
  });

  describe('setEpochConfig', () => {
    it('check 100 blocks per epoch and 0.2% daily ROI increase config', async () => {
      let guy = accounts[0];
      await send(ann, 'setEpochConfig', ['100', '20'], { from: root }); // set blocks and ROI per epoch by owner
      await expect(call(ann, 'getCurrentEpochBlocks', [])).resolves.toEqual('100');
      await expect(call(ann, 'getCurrentEpochROI', [])).resolves.toEqual('20');
      await expect(call(ann, 'getCurrentEpochConfig', [])).resolves.toEqual(expect.objectContaining({ epoch: '0', blocks: '100', roi: '20'}));
    });
  });

  describe('numTransferPoints', () => {

    it('returns the number of transferPoints for a receive', async () => {
      let guy = accounts[0];

      await expect(call(ann, 'numTransferPoints', [a1])).resolves.toEqual('0');

      const t1 = await send(ann, 'transfer', [guy, '100']); //give an account a few tokens for readability
      await expect(call(ann, 'numTransferPoints', [guy])).resolves.toEqual('1');

      await advanceBlocks(100);

      const t2 = await send(ann, 'transfer', [guy, '100']);
      await expect(call(ann, 'numTransferPoints', [guy])).resolves.toEqual('2');

      const t3 = await send(ann, 'transfer', [a2, 10], { from: guy });
      await expect(call(ann, 'numTransferPoints', [guy])).resolves.toEqual('1');
      await expect(call(ann, 'numTransferPoints', [a2])).resolves.toEqual('1');

      await advanceBlocks(100);

      const t4 = await send(ann, 'transfer', [guy, 20], { from: root });
      await expect(call(ann, 'numTransferPoints', [guy])).resolves.toEqual('2');

      await expect(call(ann, 'transferPoints', [guy, 0])).resolves.toEqual(expect.objectContaining({ epoch: Math.floor(t3.blockNumber.toString() / blocksPerEpoch).toString(), amount: '190' }));
      await expect(call(ann, 'transferPoints', [guy, 1])).resolves.toEqual(expect.objectContaining({ epoch: Math.floor(t4.blockNumber.toString() / blocksPerEpoch).toString(), amount: '20' }));
      await expect(call(ann, 'transferPoints', [a2, 0])).resolves.toEqual(expect.objectContaining({ epoch: Math.floor(t3.blockNumber.toString() / blocksPerEpoch).toString(), amount: '10' }));
    });

    it('does not add more than one transferpoint in a block', async () => {
      let guy = accounts[0];

      await send(ann, 'transfer', [guy, '100']); //give an account a few tokens for readability
      await expect(call(ann, 'numTransferPoints', [a1])).resolves.toEqual('0');
      await minerStop();

      let t1 = send(ann, 'transfer', [a1, 10], { from: guy });
      let t2 = send(ann, 'transfer', [a1, 10], { from: guy });

      await minerStart();
      t1 = await t1;
      t2 = await t2;

      await expect(call(ann, 'numTransferPoints', [a1])).resolves.toEqual('1');

      await expect(call(ann, 'transferPoints', [a1, 0])).resolves.toEqual(expect.objectContaining({ epoch: Math.floor(t1.blockNumber.toString() / blocksPerEpoch).toString(), amount: '20' }));
      await expect(call(ann, 'transferPoints', [a1, 1])).resolves.toEqual(expect.objectContaining({ epoch: '0', amount: '0' }));

      const t3 = await send(ann, 'transfer', [guy, 20], { from: root });
      await expect(call(ann, 'numTransferPoints', [guy])).resolves.toEqual('1');
      await expect(call(ann, 'transferPoints', [guy, 0])).resolves.toEqual(expect.objectContaining({ epoch: Math.floor(t3.blockNumber.toString() / blocksPerEpoch).toString(), amount: '100' }));
    });
  });

  describe('getHoldingReward', () => {

    it('returns 0 if there are no transferPoints', async () => {
      expect(await call(ann, 'getHoldingReward', [a1])).toEqual('0');
    });

    it('returns the latest block if >= last transferPoint block', async () => {
      const balanceANN = await call(ann, 'balanceOf', [root]);
      const eligibleDelay = await call(ann, 'eligibleDelay', []);
      const t1 = await send(ann, 'transfer', [a1, balanceANN], { from: root });

      await expect(call(ann, 'blocksPerEpoch', [])).resolves.toEqual(blocksPerEpoch.toString());

      await advanceBlocks(blocksPerEpoch * eligibleDelay);
      expect(await call(ann, 'getHoldingReward', [a1])).toEqual('0');

      await advanceBlocks(blocksPerEpoch - 1);
      console.log(balanceANN, await call(ann, 'transferPoints', [a1, 0]), await call(ann, 'getCurrentEpoch', []), await call(ann, 'getHoldingReward', [a1]));
      expect(await call(ann, 'getHoldingReward', [a1])).toEqual((balanceANN * 20 / 10000 * eligibleDelay).toString());

      //await advanceBlocks(blocksPerEpoch * eligibleDelay);
      //expect(await call(ann, 'getHoldingReward', [a1])).toEqual((balanceANN * 20 / 10000 * eligibleDelay * 2).toString());
    });

    // it('returns zero if < first checkpoint block', async () => {
    //   await mineBlock();
    //   const t1 = await send(ann, 'delegate', [a1], { from: root });
    //   await mineBlock();
    //   await mineBlock();

    //   expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
    //   expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('100000000000000000000000000');
    // });

    // it('generally returns the voting balance at the appropriate checkpoint', async () => {
    //   const t1 = await send(ann, 'delegate', [a1], { from: root });
    //   await mineBlock();
    //   await mineBlock();
    //   const t2 = await send(ann, 'transfer', [a2, 10], { from: root });
    //   await mineBlock();
    //   await mineBlock();
    //   const t3 = await send(ann, 'transfer', [a2, 10], { from: root });
    //   await mineBlock();
    //   await mineBlock();
    //   const t4 = await send(ann, 'transfer', [root, 20], { from: a2 });
    //   await mineBlock();
    //   await mineBlock();

    //   expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber - 1])).toEqual('0');
    //   expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber])).toEqual('100000000000000000000000000');
    //   expect(await call(ann, 'getPriorVotes', [a1, t1.blockNumber + 1])).toEqual('100000000000000000000000000');
    //   expect(await call(ann, 'getPriorVotes', [a1, t2.blockNumber])).toEqual('99999999999999999999999990');
    //   expect(await call(ann, 'getPriorVotes', [a1, t2.blockNumber + 1])).toEqual('99999999999999999999999990');
    //   expect(await call(ann, 'getPriorVotes', [a1, t3.blockNumber])).toEqual('99999999999999999999999980');
    //   expect(await call(ann, 'getPriorVotes', [a1, t3.blockNumber + 1])).toEqual('99999999999999999999999980');
    //   expect(await call(ann, 'getPriorVotes', [a1, t4.blockNumber])).toEqual('100000000000000000000000000');
    //   expect(await call(ann, 'getPriorVotes', [a1, t4.blockNumber + 1])).toEqual('100000000000000000000000000');
    // });
  });
});
