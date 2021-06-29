import { Event } from '../Event';
import { World } from '../World';
import { XAI } from '../Contract/XAI';
import {
  getAddressA,
  getNumberA
} from '../CoreValue';
import {
  AddressA,
  ListV,
  NumberA,
  StringA,
  Value
} from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getXAI } from '../ContractLookup';

export function xaiFetchers() {
  return [
    new Fetcher<{ xai: XAI }, AddressA>(`
        #### Address

        * "<XAI> Address" - Returns the address of XAI token
          * E.g. "XAI Address"
      `,
      "Address",
      [
        new Arg("xai", getXAI, { implicit: true })
      ],
      async (world, { xai }) => new AddressA(xai._address)
    ),

    new Fetcher<{ xai: XAI }, StringA>(`
        #### Name

        * "<XAI> Name" - Returns the name of the XAI token
          * E.g. "XAI Name"
      `,
      "Name",
      [
        new Arg("xai", getXAI, { implicit: true })
      ],
      async (world, { xai }) => new StringA(await xai.methods.name().call())
    ),

    new Fetcher<{ xai: XAI }, StringA>(`
        #### Symbol

        * "<XAI> Symbol" - Returns the symbol of the XAI token
          * E.g. "XAI Symbol"
      `,
      "Symbol",
      [
        new Arg("xai", getXAI, { implicit: true })
      ],
      async (world, { xai }) => new StringA(await xai.methods.symbol().call())
    ),

    new Fetcher<{ xai: XAI }, NumberA>(`
        #### Decimals

        * "<XAI> Decimals" - Returns the number of decimals of the XAI token
          * E.g. "XAI Decimals"
      `,
      "Decimals",
      [
        new Arg("xai", getXAI, { implicit: true })
      ],
      async (world, { xai }) => new NumberA(await xai.methods.decimals().call())
    ),

    new Fetcher<{ xai: XAI }, NumberA>(`
        #### TotalSupply

        * "XAI TotalSupply" - Returns XAI token's total supply
      `,
      "TotalSupply",
      [
        new Arg("xai", getXAI, { implicit: true })
      ],
      async (world, { xai }) => new NumberA(await xai.methods.totalSupply().call())
    ),

    new Fetcher<{ xai: XAI, address: AddressA }, NumberA>(`
        #### TokenBalance

        * "XAI TokenBalance <Address>" - Returns the XAI token balance of a given address
          * E.g. "XAI TokenBalance Geoff" - Returns Geoff's XAI balance
      `,
      "TokenBalance",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("address", getAddressA)
      ],
      async (world, { xai, address }) => new NumberA(await xai.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ xai: XAI, owner: AddressA, spender: AddressA }, NumberA>(`
        #### Allowance

        * "XAI Allowance owner:<Address> spender:<Address>" - Returns the XAI allowance from owner to spender
          * E.g. "XAI Allowance Geoff Torrey" - Returns the XAI allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("owner", getAddressA),
        new Arg("spender", getAddressA)
      ],
      async (world, { xai, owner, spender }) => new NumberA(await xai.methods.allowance(owner.val, spender.val).call())
    )
  ];
}

export async function getXAIValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("XAI", xaiFetchers(), world, event);
}
