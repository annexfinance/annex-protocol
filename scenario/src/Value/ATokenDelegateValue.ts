import { Event } from '../Event';
import { World } from '../World';
import { ABep20Delegate } from '../Contract/ABep20Delegate';
import {
  getCoreValue,
  mapValue
} from '../CoreValue';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import {
  AddressA,
  Value,
} from '../Value';
import { getWorldContractByAddress, getATokenDelegateAddress } from '../ContractLookup';

export async function getATokenDelegateV(world: World, event: Event): Promise<ABep20Delegate> {
  const address = await mapValue<AddressA>(
    world,
    event,
    (str) => new AddressA(getATokenDelegateAddress(world, str)),
    getCoreValue,
    AddressA
  );

  return getWorldContractByAddress<ABep20Delegate>(world, address.val);
}

async function aTokenDelegateAddress(world: World, aTokenDelegate: ABep20Delegate): Promise<AddressA> {
  return new AddressA(aTokenDelegate._address);
}

export function aTokenDelegateFetchers() {
  return [
    new Fetcher<{ aTokenDelegate: ABep20Delegate }, AddressA>(`
        #### Address

        * "ATokenDelegate <ATokenDelegate> Address" - Returns address of ATokenDelegate contract
          * E.g. "ATokenDelegate aDaiDelegate Address" - Returns aDaiDelegate's address
      `,
      "Address",
      [
        new Arg("aTokenDelegate", getATokenDelegateV)
      ],
      (world, { aTokenDelegate }) => aTokenDelegateAddress(world, aTokenDelegate),
      { namePos: 1 }
    ),
  ];
}

export async function getATokenDelegateValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("ATokenDelegate", aTokenDelegateFetchers(), world, event);
}
