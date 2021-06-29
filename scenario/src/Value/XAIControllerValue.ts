import {Event} from '../Event';
import {World} from '../World';
import {XAIController} from '../Contract/XAIController';
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
import {getXAIController} from '../ContractLookup';
import {encodedNumber} from '../Encoding';
import {getATokenV} from './ATokenValue';
import { encodeParameters, encodeABI } from '../Utils';

export async function getXAIControllerAddress(world: World, xaicontroller: XAIController): Promise<AddressA> {
  return new AddressA(xaicontroller._address);
}

async function getMintableXAI(world: World, xaicontroller: XAIController, account: string): Promise<NumberA> {
  let {0: error, 1: amount} = await xaicontroller.methods.getMintableXAI(account).call();
  if (Number(error) != 0) {
    throw new Error(`Failed to get mintable xai: error code = ${error}`);
  }
  return new NumberA(Number(amount));
}

async function getAdmin(world: World, xaicontroller: XAIController): Promise<AddressA> {
  return new AddressA(await xaicontroller.methods.admin().call());
}

async function getPendingAdmin(world: World, xaicontroller: XAIController): Promise<AddressA> {
  return new AddressA(await xaicontroller.methods.pendingAdmin().call());
}


export function xaicontrollerFetchers() {
  return [
    new Fetcher<{xaicontroller: XAIController}, AddressA>(`
        #### Address

        * "XAIController Address" - Returns address of xaicontroller
      `,
      "Address",
      [new Arg("xaicontroller", getXAIController, {implicit: true})],
      (world, {xaicontroller}) => getXAIControllerAddress(world, xaicontroller)
    ),
    new Fetcher<{xaicontroller: XAIController, account: AddressA}, NumberA>(`
        #### MintableXAI

        * "XAIController MintableXAI <User>" - Returns a given user's mintable xai amount
          * E.g. "XAIController MintableXAI Geoff"
      `,
      "MintableXAI",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("account", getAddressA)
      ],
      (world, {xaicontroller, account}) => getMintableXAI(world, xaicontroller, account.val)
    ),
    new Fetcher<{xaicontroller: XAIController}, AddressA>(`
        #### Admin

        * "XAIController Admin" - Returns the XAIControllers's admin
          * E.g. "XAIController Admin"
      `,
      "Admin",
      [new Arg("xaicontroller", getXAIController, {implicit: true})],
      (world, {xaicontroller}) => getAdmin(world, xaicontroller)
    ),
    new Fetcher<{xaicontroller: XAIController}, AddressA>(`
        #### PendingAdmin

        * "XAIController PendingAdmin" - Returns the pending admin of the XAIController
          * E.g. "XAIController PendingAdmin" - Returns XAIController's pending admin
      `,
      "PendingAdmin",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
      ],
      (world, {xaicontroller}) => getPendingAdmin(world, xaicontroller)
    ),
  ];
}

export async function getXAIControllerValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("XAIController", xaicontrollerFetchers(), world, event);
}
