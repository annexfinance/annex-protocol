import {Event} from '../Event';
import {World} from '../World';
import {Maximillion} from '../Contract/Maximillion';
import {
  getAddressA
} from '../CoreValue';
import {
  AddressA,
  Value
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getMaximillion} from '../ContractLookup';

export async function getMaximillionAddress(world: World, maximillion: Maximillion): Promise<AddressA> {
  return new AddressA(maximillion._address);
}

export function maximillionFetchers() {
  return [
    new Fetcher<{maximillion: Maximillion}, AddressA>(`
        #### Address

        * "Maximillion Address" - Returns address of maximillion
      `,
      "Address",
      [new Arg("maximillion", getMaximillion, {implicit: true})],
      (world, {maximillion}) => getMaximillionAddress(world, maximillion)
    )
  ];
}

export async function getMaximillionValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Maximillion", maximillionFetchers(), world, event);
}
