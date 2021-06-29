import {Event} from '../Event';
import {World} from '../World';
import {
  getAddressA
} from '../CoreValue';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {
  AddressA,
  Value
} from '../Value';

async function getUserAddress(world: World, user: string): Promise<AddressA> {
  return new AddressA(user);
}

export function userFetchers() {
  return [
    new Fetcher<{account: AddressA}, AddressA>(`
        #### Address

        * "User <User> Address" - Returns address of user
          * E.g. "User Geoff Address" - Returns Geoff's address
      `,
      "Address",
      [
        new Arg("account", getAddressA)
      ],
      async (world, {account}) => account,
      {namePos: 1}
    )
  ];
}

export async function getUserValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("User", userFetchers(), world, event);
}
