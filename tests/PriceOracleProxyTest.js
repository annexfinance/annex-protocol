const BigNumber = require('bignumber.js');

const {
  address,
  bnbMantissa
} = require('./Utils/BSC');

const {
  makeAToken,
  makePriceOracle,
} = require('./Utils/Annex');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, aBnb, aUsdc, aSai, aDai, aUsdt, cOther;
  let daiOracleKey = address(2);

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    aBnb = await makeAToken({kind: "abnb", comptrollerOpts: {kind: "v1-no-proxy"}, supportMarket: true});
    aUsdc = await makeAToken({comptroller: aBnb.comptroller, supportMarket: true});
    aSai = await makeAToken({comptroller: aBnb.comptroller, supportMarket: true});
    aDai = await makeAToken({comptroller: aBnb.comptroller, supportMarket: true});
    aUsdt = await makeAToken({comptroller: aBnb.comptroller, supportMarket: true});
    cOther = await makeAToken({comptroller: aBnb.comptroller, supportMarket: true});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy',
      [
        root,
        backingOracle._address,
        aBnb._address,
        aUsdc._address,
        aSai._address,
        aDai._address,
        aUsdt._address
      ]
     );
  });

  describe("constructor", () => {
    it("sets address of guardian", async () => {
      let configuredGuardian = await call(oracle, "guardian");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of v1 oracle", async () => {
      let configuredOracle = await call(oracle, "a1PriceOracle");
      expect(configuredOracle).toEqual(backingOracle._address);
    });

    it("sets address of aBnb", async () => {
      let configuredABNB = await call(oracle, "aBnbAddress");
      expect(configuredABNB).toEqual(aBnb._address);
    });

    it("sets address of aUSDC", async () => {
      let configuredCUSD = await call(oracle, "aUsdcAddress");
      expect(configuredCUSD).toEqual(aUsdc._address);
    });

    it("sets address of aSAI", async () => {
      let configuredCSAI = await call(oracle, "aSaiAddress");
      expect(configuredCSAI).toEqual(aSai._address);
    });

    it("sets address of aDAI", async () => {
      let configuredADAI = await call(oracle, "aDaiAddress");
      expect(configuredADAI).toEqual(aDai._address);
    });

    it("sets address of aUSDT", async () => {
      let configuredCUSDT = await call(oracle, "aUsdtAddress");
      expect(configuredCUSDT).toEqual(aUsdt._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setAndVerifyBackingPrice = async (aToken, price) => {
      await send(
        backingOracle,
        "setUnderlyingPrice",
        [aToken._address, bnbMantissa(price)]);

      let backingOraclePrice = await call(
        backingOracle,
        "assetPrices",
        [aToken.underlying._address]);

      expect(Number(backingOraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) =>{
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [token._address]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);;
    };

    it("always returns 1e18 for aBnb", async () => {
      await readAndVerifyProxyPrice(aBnb, 1);
    });

    it("uses address(1) for USDC and address(2) for adai", async () => {
      await send(backingOracle, "setDirectPrice", [address(1), bnbMantissa(5e12)]);
      await send(backingOracle, "setDirectPrice", [address(2), bnbMantissa(8)]);
      await readAndVerifyProxyPrice(aDai, 8);
      await readAndVerifyProxyPrice(aUsdc, 5e12);
      await readAndVerifyProxyPrice(aUsdt, 5e12);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeAToken({comptroller: aBnb.comptroller});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("correctly handle setting SAI price", async () => {
      await send(backingOracle, "setDirectPrice", [daiOracleKey, bnbMantissa(0.01)]);

      await readAndVerifyProxyPrice(aDai, 0.01);
      await readAndVerifyProxyPrice(aSai, 0.01);

      await send(oracle, "setSaiPrice", [bnbMantissa(0.05)]);

      await readAndVerifyProxyPrice(aDai, 0.01);
      await readAndVerifyProxyPrice(aSai, 0.05);

      await expect(send(oracle, "setSaiPrice", [1])).rejects.toRevert("revert SAI price may only be set once");
    });

    it("only guardian may set the sai price", async () => {
      await expect(send(oracle, "setSaiPrice", [1], {from: accounts[0]})).rejects.toRevert("revert only guardian may set the SAI price");
    });

    it("sai price must be bounded", async () => {
      await expect(send(oracle, "setSaiPrice", [bnbMantissa(10)])).rejects.toRevert("revert SAI price must be < 0.1 BNB");
    });
});
});


