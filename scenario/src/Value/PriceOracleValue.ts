import {Event} from '../Event';
import {World} from '../World';
import {PriceOracle} from '../Contract/PriceOracle';
import {
  getAddressA
} from '../CoreValue';
import {
  AddressA,
  NumberA,
  Value} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getPriceOracle} from '../ContractLookup';

async function getPrice(world: World, priceOracle: PriceOracle, asset: string): Promise<NumberA> {
  return new NumberA(await priceOracle.methods.assetPrices(asset).call());
}

export async function getPriceOracleAddress(world: World, priceOracle: PriceOracle): Promise<AddressA> {
  return new AddressA(priceOracle._address);
}

export function priceOracleFetchers() {
  return [
    new Fetcher<{priceOracle: PriceOracle}, AddressA>(`
        #### Address

        * "Address" - Gets the address of the global price oracle
      `,
      "Address",
      [
        new Arg("priceOracle", getPriceOracle, {implicit: true})
      ],
      (world, {priceOracle}) => getPriceOracleAddress(world, priceOracle)
    ),
    new Fetcher<{priceOracle: PriceOracle, asset: AddressA}, NumberA>(`
        #### Price

        * "Price asset:<Address>" - Gets the price of the given asset
      `,
      "Price",
      [
        new Arg("priceOracle", getPriceOracle, {implicit: true}),
        new Arg("asset", getAddressA,)
      ],
      (world, {priceOracle, asset}) => getPrice(world, priceOracle, asset.val)
    )
  ];
}

export async function getPriceOracleValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("PriceOracle", priceOracleFetchers(), world, event);
}
