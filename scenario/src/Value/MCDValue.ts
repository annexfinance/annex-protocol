import { Event } from '../Event';
import { World } from '../World';
import { getContract } from '../Contract';
import { Pot } from '../Contract/Pot';
import { Vat } from '../Contract/Vat';
import {
  getAddressA,
  getCoreValue,
  getStringA
} from '../CoreValue';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import {
  AddressA,
  NumberA,
  Value,
  StringA
} from '../Value';

export function mcdFetchers() {
  return [
    new Fetcher<{ potAddress: AddressA, method: StringA, args: StringA[] }, Value>(`
        #### PotAt

        * "MCD PotAt <potAddress> <method> <args>"
          * E.g. "MCD PotAt "0xPotAddress" "pie" (AToken aDai Address)"
      `,
      "PotAt",
      [
        new Arg("potAddress", getAddressA),
        new Arg("method", getStringA),
        new Arg('args', getCoreValue, { variadic: true, mapped: true })
      ],
      async (world, { potAddress, method, args }) => {
        const PotContract = getContract('PotLike');
        const pot = await PotContract.at<Pot>(world, potAddress.val);
        const argStrings = args.map(arg => arg.val);
        return new NumberA(await pot.methods[method.val](...argStrings).call())
      }
    ),

    new Fetcher<{ vatAddress: AddressA, method: StringA, args: StringA[] }, Value>(`
        #### VatAt

        * "MCD VatAt <vatAddress> <method> <args>"
          * E.g. "MCD VatAt "0xVatAddress" "dai" (AToken aDai Address)"
      `,
      "VatAt",
      [
        new Arg("vatAddress", getAddressA),
        new Arg("method", getStringA),
        new Arg('args', getCoreValue, { variadic: true, mapped: true })
      ],
      async (world, { vatAddress, method, args }) => {
        const VatContract = getContract('VatLike');
        const vat = await VatContract.at<Vat>(world, vatAddress.val);
        const argStrings = args.map(arg => arg.val);
        return new NumberA(await vat.methods[method.val](...argStrings).call())
      }
    )
  ];
}

export async function getMCDValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("MCD", mcdFetchers(), world, event);
}
