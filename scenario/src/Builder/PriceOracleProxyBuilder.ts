import {Event} from '../Event';
import {addAction, World} from '../World';
import {PriceOracleProxy} from '../Contract/PriceOracleProxy';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';
import {getAddressA} from '../CoreValue';
import {AddressA} from '../Value';

const PriceOracleProxyContract = getContract("PriceOracleProxy");

export interface PriceOracleProxyData {
  invokation?: Invokation<PriceOracleProxy>,
  contract?: PriceOracleProxy,
  description: string,
  address?: string,
  aBNB: string,
  aUSDC: string,
  aDAI: string
}

export async function buildPriceOracleProxy(world: World, from: string, event: Event): Promise<{world: World, priceOracleProxy: PriceOracleProxy, invokation: Invokation<PriceOracleProxy>}> {
  const fetchers = [
    new Fetcher<{guardian: AddressA, priceOracle: AddressA, aBNB: AddressA, aUSDC: AddressA, aSAI: AddressA, aDAI: AddressA, aUSDT: AddressA}, PriceOracleProxyData>(`
        #### Price Oracle Proxy

        * "Deploy <Guardian:Address> <PriceOracle:Address> <aBNB:Address> <aUSDC:Address> <aSAI:Address> <aDAI:Address> <aUSDT:Address>" - The Price Oracle which proxies to a backing oracle
        * E.g. "PriceOracleProxy Deploy Admin (PriceOracle Address) aBNB aUSDC aSAI aDAI aUSDT"
      `,
      "PriceOracleProxy",
      [
        new Arg("guardian", getAddressA),
        new Arg("priceOracle", getAddressA),
        new Arg("aBNB", getAddressA),
        new Arg("aUSDC", getAddressA),
        new Arg("aSAI", getAddressA),
        new Arg("aDAI", getAddressA),
        new Arg("aUSDT", getAddressA)
      ],
      async (world, {guardian, priceOracle, aBNB, aUSDC, aSAI, aDAI, aUSDT}) => {
        return {
          invokation: await PriceOracleProxyContract.deploy<PriceOracleProxy>(world, from, [guardian.val, priceOracle.val, aBNB.val, aUSDC.val, aSAI.val, aDAI.val, aUSDT.val]),
          description: "Price Oracle Proxy",
          aBNB: aBNB.val,
          aUSDC: aUSDC.val,
          aSAI: aSAI.val,
          aDAI: aDAI.val,
          aUSDT: aUSDT.val
        };
      },
      {catchall: true}
    )
  ];

  let priceOracleProxyData = await getFetcherValue<any, PriceOracleProxyData>("DeployPriceOracleProxy", fetchers, world, event);
  let invokation = priceOracleProxyData.invokation!;
  delete priceOracleProxyData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const priceOracleProxy = invokation.value!;
  priceOracleProxyData.address = priceOracleProxy._address;

  world = await storeAndSaveContract(
    world,
    priceOracleProxy,
    'PriceOracleProxy',
    invokation,
    [
      { index: ['PriceOracleProxy'], data: priceOracleProxyData }
    ]
  );

  return {world, priceOracleProxy, invokation};
}
