import {Event} from '../Event';
import {World} from '../World';
import {Comptroller} from '../Contract/Comptroller';
import {AToken} from '../Contract/AToken';
import {
  getAddressA,
  getCoreValue,
  getStringA,
  getNumberA
} from '../CoreValue';
import {
  AddressA,
  BoolA,
  ListV,
  NumberA,
  StringA,
  Value
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getComptroller} from '../ContractLookup';
import {encodedNumber} from '../Encoding';
import {getATokenV} from '../Value/ATokenValue';
import { encodeParameters, encodeABI } from '../Utils';

export async function getComptrollerAddress(world: World, comptroller: Comptroller): Promise<AddressA> {
  return new AddressA(comptroller._address);
}

export async function getLiquidity(world: World, comptroller: Comptroller, user: string): Promise<NumberA> {
  let {0: error, 1: liquidity, 2: shortfall} = await comptroller.methods.getAccountLiquidity(user).call();
  if (Number(error) != 0) {
    throw new Error(`Failed to compute account liquidity: error code = ${error}`);
  }
  return new NumberA(Number(liquidity) - Number(shortfall));
}

export async function getHypotheticalLiquidity(world: World, comptroller: Comptroller, account: string, asset: string, redeemTokens: encodedNumber, borrowAmount: encodedNumber): Promise<NumberA> {
  let {0: error, 1: liquidity, 2: shortfall} = await comptroller.methods.getHypotheticalAccountLiquidity(account, asset, redeemTokens, borrowAmount).call();
  if (Number(error) != 0) {
    throw new Error(`Failed to compute account hypothetical liquidity: error code = ${error}`);
  }
  return new NumberA(Number(liquidity) - Number(shortfall));
}

async function getPriceOracle(world: World, comptroller: Comptroller): Promise<AddressA> {
  return new AddressA(await comptroller.methods.oracle().call());
}

async function getCloseFactor(world: World, comptroller: Comptroller): Promise<NumberA> {
  return new NumberA(await comptroller.methods.closeFactorMantissa().call(), 1e18);
}

async function getMaxAssets(world: World, comptroller: Comptroller): Promise<NumberA> {
  return new NumberA(await comptroller.methods.maxAssets().call());
}

async function getLiquidationIncentive(world: World, comptroller: Comptroller): Promise<NumberA> {
  return new NumberA(await comptroller.methods.liquidationIncentiveMantissa().call(), 1e18);
}

async function getImplementation(world: World, comptroller: Comptroller): Promise<AddressA> {
  return new AddressA(await comptroller.methods.comptrollerImplementation().call());
}

async function getBlockNumber(world: World, comptroller: Comptroller): Promise<NumberA> {
  return new NumberA(await comptroller.methods.getBlockNumber().call());
}

async function getAdmin(world: World, comptroller: Comptroller): Promise<AddressA> {
  return new AddressA(await comptroller.methods.admin().call());
}

async function getPendingAdmin(world: World, comptroller: Comptroller): Promise<AddressA> {
  return new AddressA(await comptroller.methods.pendingAdmin().call());
}

async function getCollateralFactor(world: World, comptroller: Comptroller, aToken: AToken): Promise<NumberA> {
  let {0: _isListed, 1: collateralFactorMantissa} = await comptroller.methods.markets(aToken._address).call();
  return new NumberA(collateralFactorMantissa, 1e18);
}

async function membershipLength(world: World, comptroller: Comptroller, user: string): Promise<NumberA> {
  return new NumberA(await comptroller.methods.membershipLength(user).call());
}

async function checkMembership(world: World, comptroller: Comptroller, user: string, aToken: AToken): Promise<BoolA> {
  return new BoolA(await comptroller.methods.checkMembership(user, aToken._address).call());
}

async function getAssetsIn(world: World, comptroller: Comptroller, user: string): Promise<ListV> {
  let assetsList = await comptroller.methods.getAssetsIn(user).call();

  return new ListV(assetsList.map((a) => new AddressA(a)));
}

async function getAnnexMarkets(world: World, comptroller: Comptroller): Promise<ListV> {
  let mkts = await comptroller.methods.getAnnexMarkets().call();

  return new ListV(mkts.map((a) => new AddressA(a)));
}

async function checkListed(world: World, comptroller: Comptroller, aToken: AToken): Promise<BoolA> {
  let {0: isListed, 1: _collateralFactorMantissa} = await comptroller.methods.markets(aToken._address).call();

  return new BoolA(isListed);
}

async function checkIsAnnex(world: World, comptroller: Comptroller, aToken: AToken): Promise<BoolA> {
  let {0: isListed, 1: _collateralFactorMantissa, 2: isAnnex} = await comptroller.methods.markets(aToken._address).call();
  return new BoolA(isAnnex);
}

async function mintedXAIs(world: World, comptroller: Comptroller, user: string): Promise<NumberA> {
  return new NumberA(await comptroller.methods.mintedXAIs(user).call());
}

export function comptrollerFetchers() {
  return [
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### Address

        * "Comptroller Address" - Returns address of comptroller
      `,
      "Address",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getComptrollerAddress(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA}, NumberA>(`
        #### Liquidity

        * "Comptroller Liquidity <User>" - Returns a given user's trued up liquidity
          * E.g. "Comptroller Liquidity Geoff"
      `,
      "Liquidity",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA)
      ],
      (world, {comptroller, account}) => getLiquidity(world, comptroller, account.val)
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA, action: StringA, amount: NumberA, aToken: AToken}, NumberA>(`
        #### Hypothetical

        * "Comptroller Hypothetical <User> <Action> <Asset> <Number>" - Returns a given user's trued up liquidity given a hypothetical change in asset with redeeming a certain number of tokens and/or borrowing a given amount.
          * E.g. "Comptroller Hypothetical Geoff Redeems 6.0 aZRX"
          * E.g. "Comptroller Hypothetical Geoff Borrows 5.0 aZRX"
      `,
      "Hypothetical",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA),
        new Arg("action", getStringA),
        new Arg("amount", getNumberA),
        new Arg("aToken", getATokenV)
      ],
      async (world, {comptroller, account, action, aToken, amount}) => {
        let redeemTokens: NumberA;
        let borrowAmount: NumberA;

        switch (action.val.toLowerCase()) {
          case "borrows":
            redeemTokens = new NumberA(0);
            borrowAmount = amount;
            break;
          case "redeems":
            redeemTokens = amount;
            borrowAmount = new NumberA(0);
            break;
          default:
            throw new Error(`Unknown hypothetical: ${action.val}`);
        }

        return await getHypotheticalLiquidity(world, comptroller, account.val, aToken._address, redeemTokens.encode(), borrowAmount.encode());
      }
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### Admin

        * "Comptroller Admin" - Returns the Comptrollers's admin
          * E.g. "Comptroller Admin"
      `,
      "Admin",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getAdmin(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### PendingAdmin

        * "Comptroller PendingAdmin" - Returns the pending admin of the Comptroller
          * E.g. "Comptroller PendingAdmin" - Returns Comptroller's pending admin
      `,
      "PendingAdmin",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
      ],
      (world, {comptroller}) => getPendingAdmin(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### PriceOracle

        * "Comptroller PriceOracle" - Returns the Comptrollers's price oracle
          * E.g. "Comptroller PriceOracle"
      `,
      "PriceOracle",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getPriceOracle(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, NumberA>(`
        #### CloseFactor

        * "Comptroller CloseFactor" - Returns the Comptrollers's price oracle
          * E.g. "Comptroller CloseFactor"
      `,
      "CloseFactor",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getCloseFactor(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, NumberA>(`
        #### MaxAssets

        * "Comptroller MaxAssets" - Returns the Comptrollers's price oracle
          * E.g. "Comptroller MaxAssets"
      `,
      "MaxAssets",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getMaxAssets(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, NumberA>(`
        #### LiquidationIncentive

        * "Comptroller LiquidationIncentive" - Returns the Comptrollers's liquidation incentive
          * E.g. "Comptroller LiquidationIncentive"
      `,
      "LiquidationIncentive",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getLiquidationIncentive(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### Implementation

        * "Comptroller Implementation" - Returns the Comptrollers's implementation
          * E.g. "Comptroller Implementation"
      `,
      "Implementation",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getImplementation(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller}, NumberA>(`
        #### BlockNumber

        * "Comptroller BlockNumber" - Returns the Comptrollers's mocked block number (for scenario runner)
          * E.g. "Comptroller BlockNumber"
      `,
      "BlockNumber",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      (world, {comptroller}) => getBlockNumber(world, comptroller)
    ),
    new Fetcher<{comptroller: Comptroller, aToken: AToken}, NumberA>(`
        #### CollateralFactor

        * "Comptroller CollateralFactor <AToken>" - Returns the collateralFactor associated with a given asset
          * E.g. "Comptroller CollateralFactor aZRX"
      `,
      "CollateralFactor",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, {comptroller, aToken}) => getCollateralFactor(world, comptroller, aToken)
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA}, NumberA>(`
        #### MembershipLength

        * "Comptroller MembershipLength <User>" - Returns a given user's length of membership
          * E.g. "Comptroller MembershipLength Geoff"
      `,
      "MembershipLength",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA)
      ],
      (world, {comptroller, account}) => membershipLength(world, comptroller, account.val)
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA, aToken: AToken}, BoolA>(`
        #### CheckMembership

        * "Comptroller CheckMembership <User> <AToken>" - Returns one if user is in asset, zero otherwise.
          * E.g. "Comptroller CheckMembership Geoff aZRX"
      `,
      "CheckMembership",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA),
        new Arg("aToken", getATokenV)
      ],
      (world, {comptroller, account, aToken}) => checkMembership(world, comptroller, account.val, aToken)
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA}, ListV>(`
        #### AssetsIn

        * "Comptroller AssetsIn <User>" - Returns the assets a user is in
          * E.g. "Comptroller AssetsIn Geoff"
      `,
      "AssetsIn",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA)
      ],
      (world, {comptroller, account}) => getAssetsIn(world, comptroller, account.val)
    ),
    new Fetcher<{comptroller: Comptroller, aToken: AToken}, BoolA>(`
        #### CheckListed

        * "Comptroller CheckListed <AToken>" - Returns true if market is listed, false otherwise.
          * E.g. "Comptroller CheckListed aZRX"
      `,
      "CheckListed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, {comptroller, aToken}) => checkListed(world, comptroller, aToken)
    ),
    new Fetcher<{comptroller: Comptroller, aToken: AToken}, BoolA>(`
        #### CheckIsAnnex

        * "Comptroller CheckIsAnnex <AToken>" - Returns true if market is listed, false otherwise.
          * E.g. "Comptroller CheckIsAnnex aZRX"
      `,
      "CheckIsAnnex",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("aToken", getATokenV)
      ],
      (world, {comptroller, aToken}) => checkIsAnnex(world, comptroller, aToken)
    ),

    new Fetcher<{comptroller: Comptroller}, BoolA>(`
        #### _ProtocolPaused

        * "_ProtocolPaused" - Returns the Comptrollers's original protocol paused status
        * E.g. "Comptroller _ProtocolPaused"
        `,
        "_ProtocolPaused",
        [new Arg("comptroller", getComptroller, {implicit: true})],
        async (world, {comptroller}) => new BoolA(await comptroller.methods.protocolPaused().call())
    ),
    new Fetcher<{comptroller: Comptroller}, ListV>(`
      #### GetAnnexMarkets

      * "GetAnnexMarkets" - Returns an array of the currently enabled Annex markets. To use the auto-gen array getter annexMarkets(uint), use AnnexMarkets
      * E.g. "Comptroller GetAnnexMarkets"
      `,
      "GetAnnexMarkets",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      async(world, {comptroller}) => await getAnnexMarkets(world, comptroller)
     ),

    new Fetcher<{comptroller: Comptroller}, NumberA>(`
      #### AnnexRate

      * "AnnexRate" - Returns the current ann rate.
      * E.g. "Comptroller AnnexRate"
      `,
      "AnnexRate",
      [new Arg("comptroller", getComptroller, {implicit: true})],
      async(world, {comptroller}) => new NumberA(await comptroller.methods.annexRate().call())
    ),

    new Fetcher<{comptroller: Comptroller, signature: StringA, callArgs: StringA[]}, NumberA>(`
        #### CallNum

        * "CallNum signature:<String> ...callArgs<CoreValue>" - Simple direct call method
          * E.g. "Comptroller CallNum \"annexSupplySpeeds(address)\" (Address Coburn)"
      `,
      "CallNum",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("signature", getStringA),
        new Arg("callArgs", getCoreValue, {variadic: true, mapped: true})
      ],
      async (world, {comptroller, signature, callArgs}) => {
        const fnData = encodeABI(world, signature.val, callArgs.map(a => a.val));
        const res = await world.web3.eth.call({
            to: comptroller._address,
            data: fnData
          })
        const resNum : any = world.web3.eth.abi.decodeParameter('uint256',res);
        return new NumberA(resNum);
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken, key: StringA}, NumberA>(`
        #### AnnexSupplyState(address)

        * "Comptroller AnnexBorrowState aZRX "index"
      `,
      "AnnexSupplyState",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
        new Arg("key", getStringA),
      ],
      async (world, {comptroller, AToken, key}) => {
        const result = await comptroller.methods.annexSupplyState(AToken._address).call();
        return new NumberA(result[key.val]);
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken, key: StringA}, NumberA>(`
        #### AnnexBorrowState(address)

        * "Comptroller AnnexBorrowState aZRX "index"
      `,
      "AnnexBorrowState",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
        new Arg("key", getStringA),
      ],
      async (world, {comptroller, AToken, key}) => {
        const result = await comptroller.methods.annexBorrowState(AToken._address).call();
        return new NumberA(result[key.val]);
      }
    ),
    new Fetcher<{comptroller: Comptroller, account: AddressA, key: StringA}, NumberA>(`
        #### AnnexAccrued(address)

        * "Comptroller AnnexAccrued Coburn
      `,
      "AnnexAccrued",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("account", getAddressA),
      ],
      async (world, {comptroller,account}) => {
        const result = await comptroller.methods.annexAccrued(account.val).call();
        return new NumberA(result);
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken, account: AddressA}, NumberA>(`
        #### annexSupplierIndex

        * "Comptroller AnnexSupplierIndex aZRX Coburn
      `,
      "AnnexSupplierIndex",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
        new Arg("account", getAddressA),
      ],
      async (world, {comptroller, AToken, account}) => {
        return new NumberA(await comptroller.methods.annexSupplierIndex(AToken._address, account.val).call());
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken, account: AddressA}, NumberA>(`
        #### AnnexBorrowerIndex

        * "Comptroller AnnexBorrowerIndex aZRX Coburn
      `,
      "AnnexBorrowerIndex",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
        new Arg("account", getAddressA),
      ],
      async (world, {comptroller, AToken, account}) => {
        return new NumberA(await comptroller.methods.annexBorrowerIndex(AToken._address, account.val).call());
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken}, NumberA>(`
        #### AnnexSpeed (DEPRECATED)

        * "Comptroller AnnexSpeed aZRX
      `,
      "AnnexSpeed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
      ],
      async (world, {comptroller, AToken}) => {
        return new NumberA(await comptroller.methods.annexSpeeds(AToken._address).call());
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken}, NumberA>(`
        #### AnnexSupplySpeed
        * "Comptroller AnnexSupplySpeed aZRX
      `,
      "AnnexSupplySpeed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
      ],
      async (world, {comptroller, AToken}) => {
        return new NumberA(await comptroller.methods.annexSupplySpeeds(AToken._address).call());
      }
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken}, NumberA>(`
        #### AnnexBorrowSpeed
        * "Comptroller AnnexBorrowSpeed aZRX
      `,
      "AnnexBorrowSpeed",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
      ],
      async (world, {comptroller, AToken}) => {
        return new NumberA(await comptroller.methods.annexBorrowSpeeds(AToken._address).call());
      }
    ),
    new Fetcher<{ comptroller: Comptroller, address: AddressA }, NumberA>(`
        #### MintedXAI

        * "Comptroller MintedXAI <User>" - Returns a user's minted xai amount
          * E.g. "Comptroller MintedXAI Geoff"
      `,
      "MintedXAI",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg<AddressA>("address", getAddressA)
      ],
      (world, { comptroller, address }) => mintedXAIs(world, comptroller, address.val),
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### SupplyCapGuardian
        * "SupplyCapGuardian" - Returns the Comptrollers's SupplyCapGuardian
        * E.g. "Comptroller SupplyCapGuardian"
        `,
        "SupplyCapGuardian",
        [
          new Arg("comptroller", getComptroller, {implicit: true})
        ],
        async (world, {comptroller}) => new AddressA(await comptroller.methods.supplyCapGuardian().call())
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken}, NumberA>(`
        #### SupplyCaps
        * "Comptroller SupplyCaps aZRX
      `,
        "SupplyCaps",
        [
          new Arg("comptroller", getComptroller, {implicit: true}),
          new Arg("AToken", getATokenV),
        ],
        async (world, {comptroller, AToken}) => {
          return new NumberA(await comptroller.methods.supplyCaps(AToken._address).call());
        }
    ),
    new Fetcher<{comptroller: Comptroller}, AddressA>(`
        #### BorrowCapGuardian
        * "BorrowCapGuardian" - Returns the Comptrollers's BorrowCapGuardian
        * E.g. "Comptroller BorrowCapGuardian"
        `,
        "BorrowCapGuardian",
        [
          new Arg("comptroller", getComptroller, {implicit: true})
        ],
        async (world, {comptroller}) => new AddressA(await comptroller.methods.borrowCapGuardian().call())
    ),
    new Fetcher<{comptroller: Comptroller, AToken: AToken}, NumberA>(`
        #### BorrowCaps
        * "Comptroller BorrowCaps aZRX
      `,
      "BorrowCaps",
      [
        new Arg("comptroller", getComptroller, {implicit: true}),
        new Arg("AToken", getATokenV),
      ],
      async (world, {comptroller, AToken}) => {
        return new NumberA(await comptroller.methods.borrowCaps(AToken._address).call());
      }
    )
  ];
}

export async function getComptrollerValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Comptroller", comptrollerFetchers(), world, event);
}
