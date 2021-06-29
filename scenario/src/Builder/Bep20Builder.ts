
import {Event} from '../Event';
import {addAction, World} from '../World';
import {Bep20} from '../Contract/Bep20';
import {Invokation, invoke} from '../Invokation';
import {
  getAddressA,
  getCoreValue,
  getNumberA,
  getStringA
} from '../CoreValue';
import {
  AddressA,
  NumberA,
  StringA,
  Value
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract, getTestContract} from '../Contract';
import {encodeABI} from '../Utils';

const ExistingToken = getContract("EIP20Interface");
const TetherInterface = getContract("TetherInterface");

const FaucetTokenHarness = getContract("FaucetToken");
const FaucetTokenNonStandardHarness = getContract("FaucetNonStandardToken");
const FaucetTokenReEntrantHarness = getContract("FaucetTokenReEntrantHarness");
const EvilTokenHarness = getContract("EvilToken");
const WBTATokenHarness = getContract("WBTAToken");
const FeeTokenHarness = getContract("FeeToken");

export interface TokenData {
  invokation: Invokation<Bep20>,
  description: string,
  name: string,
  symbol: string,
  decimals?: number,
  address?: string,
  contract: string
}

export async function buildBep20(world: World, from: string, event: Event): Promise<{ world: World, bep20: Bep20, tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ symbol: StringA, address: AddressA, name: StringA }, TokenData>(`
        #### Existing

        * "Existing symbol:<String> address:<Address> name:<String>" - Wrap an existing Bep20 token
          * E.g. "Bep20 Deploy Existing DAI 0x123...
      `,
      "Existing",
      [
        new Arg("symbol", getStringA),
        new Arg("address", getAddressA),
        new Arg("name", getStringA, { default: undefined }),
      ],
      async (world, { symbol, name, address }) => {
        const existingToken = await ExistingToken.at<Bep20>(world, address.val);
        const tokenName = name.val === undefined ? symbol.val : name.val;
        const decimals = await existingToken.methods.decimals().call();

        return {
          invokation: new Invokation<Bep20>(existingToken, null, null, null),
          description: "Existing",
          decimals: Number(decimals),
          name: tokenName,
          symbol: symbol.val,
          contract: 'ExistingToken'
        };
      }
    ),

    new Fetcher<{symbol: StringA, address: AddressA}, TokenData>(`
        #### ExistingTether

        * "Existing symbol:<String> address:<Address>" - Wrap an existing Bep20 token
          * E.g. "Bep20 Deploy ExistingTether USDT 0x123...
      `,
      "ExistingTether",
      [
        new Arg("symbol", getStringA),
        new Arg("address", getAddressA)
      ],
      async (world, {symbol, address}) => {
        return {
          invokation: new Invokation<Bep20>(await TetherInterface.at<Bep20>(world, address.val), null, null, null),
          description: "ExistingTether",
          name: symbol.val,
          symbol: symbol.val,
          contract: 'TetherInterface'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA, decimals: NumberA}, TokenData>(`
        #### NonStandard

        * "NonStandard symbol:<String> name:<String> decimals:<Number=18>" - A non-standard token, like BAT
          * E.g. "Bep20 Deploy NonStandard BAT \"Basic Attention Token\" 18"
      `,
      "NonStandard",
      [
        new Arg("symbol", getStringA),
        new Arg("name", getStringA),
        new Arg("decimals", getNumberA, {default: new NumberA(18)}),
      ],
      async (world, {symbol, name, decimals}) => {
        return {
          invokation: await FaucetTokenNonStandardHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val]),
          description: "NonStandard",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: 'FaucetNonStandardToken'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA, fun:StringA, reEntryFunSig: StringA, reEntryFunArgs: StringA[]}, TokenData>(`
        #### ReEntrant

        * "ReEntrant symbol:<String> name:string fun:<String> funSig:<String> ...funArgs:<Value>" - A token that loves to call back to spook its caller
          * E.g. "Bep20 Deploy ReEntrant PHREAK PHREAK "transfer" "mint(uint256)" 0 - A token that will call back to a AToken's mint function

        Note: valid functions: totalSupply, balanceOf, transfer, transferFrom, approve, allowance
      `,
      "ReEntrant",
      [
        new Arg("symbol", getStringA),
        new Arg("name", getStringA),
        new Arg("fun", getStringA),
        new Arg("reEntryFunSig", getStringA),
        new Arg("reEntryFunArgs", getStringA, {variadic: true, mapped: true})
      ],
      async (world, {symbol, name, fun, reEntryFunSig, reEntryFunArgs}) => {
        const fnData = encodeABI(world, reEntryFunSig.val, reEntryFunArgs.map((a) => a.val));

        return {
          invokation: await FaucetTokenReEntrantHarness.deploy<Bep20>(world, from, [0, name.val, 18, symbol.val, fnData, fun.val]),
          description: "ReEntrant",
          name: name.val,
          symbol: symbol.val,
          decimals: 18,
          contract: 'FaucetTokenReEntrantHarness'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA, decimals: NumberA}, TokenData>(`
        #### Evil

        * "Evil symbol:<String> name:<String> decimals:<Number>" - A less vanilla BEP-20 contract that fails transfers
          * E.g. "Bep20 Deploy Evil BAT \"Basic Attention Token\" 18"
      `,
      "Evil",
      [
        new Arg("symbol", getStringA),
        new Arg("name", getStringA),
        new Arg("decimals", getNumberA, {default: new NumberA(18)})
      ],
      async (world, {symbol, name, decimals}) => {
        return {
          invokation: await EvilTokenHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val]),
          description: "Evil",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: 'EvilToken'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA, decimals: NumberA}, TokenData>(`
        #### Standard

        * "Standard symbol:<String> name:<String> decimals:<Number>" - A vanilla BEP-20 contract
          * E.g. "Bep20 Deploy Standard BAT \"Basic Attention Token\" 18"
      `,
      "Standard",
      [
        new Arg("symbol", getStringA),
        new Arg("name", getStringA),
        new Arg("decimals", getNumberA, {default: new NumberA(18)})
      ],
      async (world, {symbol, name, decimals}) => {
        return {
          invokation: await FaucetTokenHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val]),
          description: "Standard",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          contract: 'FaucetToken'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA}, TokenData>(`
        #### WBTC

        * "WBTC symbol:<String> name:<String>" - The WBTC contract
          * E.g. "Bep20 Deploy WBTC WBTC \"Wrapped Bitcoin\""
      `,
      "WBTC",
      [
        new Arg("symbol", getStringA, {default: new StringA("WBTC")}),
        new Arg("name", getStringA, {default: new StringA("Wrapped Bitcoin")})
      ],
      async (world, {symbol, name}) => {
        let decimals = 8;

        return {
          invokation: await WBTATokenHarness.deploy<Bep20>(world, from, []),
          description: "WBTC",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals,
          contract: 'WBTAToken'
        };
      }
    ),

    new Fetcher<{symbol: StringA, name: StringA, decimals: NumberA, basisPointFee: NumberA, owner: AddressA}, TokenData>(`
        #### Fee

        * "Fee symbol:<String> name:<String> decimals:<Number> basisPointFee:<Number> owner:<Address>" - An BEP20 whose owner takes a fee on transfers. Used for mocking USDT.
          * E.g. "Bep20 Deploy Fee USDT USDT 100 Root"
      `,
      "Fee",
      [
        new Arg("symbol", getStringA),
        new Arg("name", getStringA),
        new Arg("decimals", getNumberA),
        new Arg("basisPointFee", getNumberA),
        new Arg("owner", getAddressA)
      ],
      async (world, {symbol, name, decimals, basisPointFee, owner}) => {
        return {
          invokation: await FeeTokenHarness.deploy<Bep20>(world, from, [0, name.val, decimals.val, symbol.val, basisPointFee.val, owner.val]),
          description: "Fee",
          name: name.val,
          symbol: symbol.val,
          decimals: decimals.toNumber(),
          owner: owner.val,
          contract: 'FeeToken'
        };
      }
    ),
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployBep20", fetchers, world, event);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const bep20 = invokation.value!;
  tokenData.address = bep20._address;

  world = await storeAndSaveContract(
    world,
    bep20,
    tokenData.symbol,
    invokation,
    [
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  return {world, bep20, tokenData};
}
