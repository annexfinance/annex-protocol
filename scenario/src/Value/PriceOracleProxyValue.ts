import {Event} from '../Event';
import {World} from '../World';
import {PriceOracleProxy} from '../Contract/PriceOracleProxy';
import {
  getAddressA
} from '../CoreValue';
import {
  AddressA,
  NumberA,
  Value} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getPriceOracleProxy} from '../ContractLookup';

export async function getPriceOracleProxyAddress(world: World, priceOracleProxy: PriceOracleProxy): Promise<AddressA> {
  return new AddressA(priceOracleProxy._address);
}

export async function getV1PriceOracle(world: World, priceOracleProxy: PriceOracleProxy): Promise<AddressA> {
  return new AddressA(await priceOracleProxy.methods.a1PriceOracle().call());
}

async function getPrice(world: World, priceOracleProxy: PriceOracleProxy, asset: string): Promise<NumberA> {
  return new NumberA(await priceOracleProxy.methods.getUnderlyingPrice(asset).call());
}

export function priceOracleProxyFetchers() {
  return [
    new Fetcher<{priceOracleProxy: PriceOracleProxy}, AddressA>(`
        #### V1PriceOracle

        * "V1PriceOracle" - Gets the address of the v1 Price
      `,
      "V1PriceOracle",
      [
        new Arg("priceOracleProxy", getPriceOracleProxy, {implicit: true})
      ],
      (world, {priceOracleProxy}) => getV1PriceOracle(world, priceOracleProxy)
    ),
    new Fetcher<{priceOracleProxy: PriceOracleProxy}, AddressA>(`
        #### Address

        * "Address" - Gets the address of the global price oracle
      `,
      "Address",
      [
        new Arg("priceOracleProxy", getPriceOracleProxy, {implicit: true})
      ],
      (world, {priceOracleProxy}) => getPriceOracleProxyAddress(world, priceOracleProxy)
    ),
    new Fetcher<{priceOracle: PriceOracleProxy, asset: AddressA}, NumberA>(`
        #### Price

        * "Price asset:<Address>" - Gets the price of the given asset
      `,
      "Price",
      [
        new Arg("priceOracle", getPriceOracleProxy, {implicit: true}),
        new Arg("asset", getAddressA)
      ],
      (world, {priceOracle, asset}) => getPrice(world, priceOracle, asset.val)
    )
  ];
}

export async function getPriceOracleProxyValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("PriceOracle", priceOracleProxyFetchers(), world, event);
}
