const {
  bnbMantissa,
  bnbUnsigned,
} = require('./Utils/BSC');

const BigNumber = require('bignumber.js');

const {
  makeToken
} = require('./Utils/Annex');

const transferAmount = bnbMantissa(1000);
const bnbAmount = new BigNumber(1e17);
const withdrawBNBAmount = new BigNumber(3e15);

async function makeTreasury(opts = {}) {
  const {
    root = saddle.account,
    kind = 'aTreasury'
  } = opts || {};

  if (kind == 'aTreasury') {
    return await deploy('ATreasury', []);
  }
}

async function withdrawTreasuryBEP20(aTreasury, tokenAddress, withdrawAmount, withdrawAddress, caller) {
  return send(aTreasury, 'withdrawTreasuryBEP20', 
    [
      tokenAddress,
      withdrawAmount,
      withdrawAddress,      
    ], { from: caller });
}

async function withdrawTreasuryBNB(aTreasury, withdrawAmount, withdrawAddress, caller) {
  return send(aTreasury, 'withdrawTreasuryBNB', 
    [
      withdrawAmount,
      withdrawAddress,      
    ], { from: caller });
}

describe('ATreasury', function () {
  let root, minter, redeemer, accounts;
  let aTreasury
  let bep20Token;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    // Create New Bep20 Token
    bep20Token = await makeToken();
    // Create New aTreasury
    aTreasury = await makeTreasury();
    // Transfer BEP20 to aTreasury Contract for test
    await send(bep20Token, 'transfer', [aTreasury._address, transferAmount]);
    // Transfer BNB to aTreasury Contract for test
    await web3.eth.sendTransaction({ from: root, to: aTreasury._address, value: bnbAmount.toFixed()});
  });

  it ('Check BNB Balnce', async() => {
    expect(await web3.eth.getBalance(aTreasury._address)).toEqual(bnbAmount.toFixed());
  });

  it ('Check Owner', async() => {
    const treasuryOwner = await call(aTreasury, 'owner', []);
    expect(treasuryOwner).toEqual(root);
  });

  it ('Check Change Owner', async() => {
    await send(aTreasury, 'transferOwnership', [accounts[0]], { from: root });
    const newTreasuryOwner = await call(aTreasury, 'owner', []);
    expect(newTreasuryOwner).toEqual(accounts[0]);
  })


  it ('Check Wrong Owner', async() => {
    // Call withdrawTreausry with wrong owner
    await expect(withdrawTreasuryBEP20(aTreasury, bep20Token._address, transferAmount, accounts[0], accounts[1]))
      .rejects
      .toRevert("revert Ownable: caller is not the owner");
  });

  it ('Check Withdraw Treasury BEP20 Token, Over Balance of Treasury', async() => {
    const overWithdrawAmount = bnbMantissa(1001);
    // Check Before BEP20 Balance
    expect(bnbUnsigned(await call(bep20Token, 'balanceOf', [aTreasury._address]))).toEqual(transferAmount);

    // Call withdrawTreasury BEP20
    await withdrawTreasuryBEP20(
      aTreasury,
      bep20Token._address,
      overWithdrawAmount,
      accounts[0],
      root
    );

    // Check After Balance
    expect(await call(bep20Token, 'balanceOf', [aTreasury._address])).toEqual('0');
    // Check withdrawAddress Balance
    expect(bnbUnsigned(await call(bep20Token, 'balanceOf', [accounts[0]]))).toEqual(transferAmount);
  });

  it ('Check Withdraw Treasury BEP20 Token, less Balance of Treasury', async() => {
    const withdrawAmount = bnbMantissa(1);
    const leftAmouont = bnbMantissa(999);
    // Check Before BEP20 Balance
    expect(bnbUnsigned(await call(bep20Token, 'balanceOf', [aTreasury._address]))).toEqual(transferAmount);

    // Call withdrawTreasury BEP20
    await withdrawTreasuryBEP20(
      aTreasury,
      bep20Token._address,
      withdrawAmount,
      accounts[0],
      root
    );

    // Check After Balance
    expect(bnbUnsigned(await call(bep20Token, 'balanceOf', [aTreasury._address]))).toEqual(leftAmouont);
    // Check withdrawAddress Balance
    expect(bnbUnsigned(await call(bep20Token, 'balanceOf', [accounts[0]]))).toEqual(withdrawAmount);
  });

  it ('Check Withdraw Treasury BNB, Over Balance of Treasury', async() => {
    const overWithdrawAmount = bnbAmount.plus(1).toFixed();
    // Get Original Balance of Withdraw Account
    const originalBalance = await web3.eth.getBalance(accounts[0]);
    // Get Expected New Balance of Withdraw Account
    const newBalance = bnbAmount.plus(originalBalance);

    // Call withdrawTreasury BNB
    await withdrawTreasuryBNB(
      aTreasury,
      overWithdrawAmount,
      accounts[0],
      root
    );

    // Check After Balance
    expect(await web3.eth.getBalance(aTreasury._address)).toEqual('0');
    // Check withdrawAddress Balance
    expect(await web3.eth.getBalance(accounts[0])).toEqual(newBalance.toFixed());
  });

  it ('Check Withdraw Treasury BNB, less Balance of Treasury', async() => {
    const withdrawAmount = withdrawBNBAmount.toFixed();
    const leftAmount = bnbAmount.minus(withdrawBNBAmount);
    // Get Original Balance of Withdraw Account
    const originalBalance = await web3.eth.getBalance(accounts[0]);
    // Get Expected New Balance of Withdraw Account
    const newBalance = withdrawBNBAmount.plus(originalBalance);

    // Call withdrawTreasury BNB
    await withdrawTreasuryBNB(
      aTreasury,
      withdrawAmount,
      accounts[0],
      root
    );

    // Check After Balance
    expect(await web3.eth.getBalance(aTreasury._address)).toEqual(leftAmount.toFixed());
    // Check withdrawAddress Balance
    expect(await web3.eth.getBalance(accounts[0])).toEqual(newBalance.toFixed());
  });
});
