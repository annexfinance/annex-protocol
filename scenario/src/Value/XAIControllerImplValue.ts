import {Event} from '../Event';
import {World} from '../World';
import {XAIControllerImpl} from '../Contract/XAIControllerImpl';
import {
  getAddressA
} from '../CoreValue';
import {
  AddressA,
  Value
} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getXAIControllerImpl} from '../ContractLookup';

export async function getXAIControllerImplAddress(world: World, xaicontrollerImpl: XAIControllerImpl): Promise<AddressA> {
  return new AddressA(xaicontrollerImpl._address);
}

export function xaicontrollerImplFetchers() {
  return [
    new Fetcher<{xaicontrollerImpl: XAIControllerImpl}, AddressA>(`
        #### Address

        * "XAIControllerImpl Address" - Returns address of xaicontroller implementation
      `,
      "Address",
      [new Arg("xaicontrollerImpl", getXAIControllerImpl)],
      (world, {xaicontrollerImpl}) => getXAIControllerImplAddress(world, xaicontrollerImpl),
      {namePos: 1}
    )
  ];
}

export async function getXAIControllerImplValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("XAIControllerImpl", xaicontrollerImplFetchers(), world, event);
}
