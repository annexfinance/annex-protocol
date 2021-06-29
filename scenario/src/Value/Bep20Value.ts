import {Event} from '../Event';
import {World} from '../World';
import {Bep20} from '../Contract/Bep20';
import {getBep20Address, getWorldContractByAddress} from '../ContractLookup';
import {
  getAddressA,
  getCoreValue,
  mapValue,
} from '../CoreValue';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {
  AddressA,
  NumberA,
  Value,
  StringA
} from '../Value';

export async function getBep20Name(world: World, bep20: Bep20): Promise<StringA> {
  return new StringA(await bep20.methods.name().call());
}

export async function getBep20Symbol(world: World, bep20: Bep20): Promise<StringA> {
  return new StringA(await bep20.methods.symbol().call());
}

export async function getBep20Decimals(world: World, bep20: Bep20): Promise<NumberA> {
  return new NumberA(await bep20.methods.decimals().call());
}

async function getTotalSupply(world: World, bep20: Bep20): Promise<NumberA> {
  return new NumberA(await bep20.methods.totalSupply().call());
}

async function getTokenBalance(world: World, bep20: Bep20, address: string): Promise<NumberA> {
  return new NumberA(await bep20.methods.balanceOf(address).call());
}

async function getAllowance(world: World, bep20: Bep20, owner: string, spender: string): Promise<NumberA> {
  return new NumberA(await bep20.methods.allowance(owner, spender).call());
}

export async function getBep20V(world: World, event: Event): Promise<Bep20> {
  const address = await mapValue<AddressA>(
    world,
    event,
    (str) => new AddressA(getBep20Address(world, str)),
    getCoreValue,
    AddressA
  );

  return getWorldContractByAddress<Bep20>(world, address.val);
}

export function bep20Fetchers() {
  return [
    new Fetcher<{bep20: Bep20}, AddressA>(`
        #### Address

        * "Bep20 <Bep20> Address" - Returns address of BEP-20 contract
          * E.g. "Bep20 ZRX Address" - Returns ZRX's address
      `,
      "Address",
      [
        new Arg("bep20", getBep20V)
      ],
      async (world, {bep20}) => new AddressA(bep20._address),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20}, StringA>(`
        #### Name

        * "Bep20 <Bep20> Name" - Returns name of BEP-20 contract
          * E.g. "Bep20 ZRX Name" - Returns ZRX's name
      `,
      "Name",
      [
        new Arg("bep20", getBep20V)
      ],
      (world, {bep20}) => getBep20Name(world, bep20),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20}, StringA>(`
        #### Symbol

        * "Bep20 <Bep20> Symbol" - Returns symbol of BEP-20 contract
          * E.g. "Bep20 ZRX Symbol" - Returns ZRX's symbol
      `,
      "Symbol",
      [
        new Arg("bep20", getBep20V)
      ],
      (world, {bep20}) => getBep20Symbol(world, bep20),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20}, NumberA>(`
        #### Decimals

        * "Bep20 <Bep20> Decimals" - Returns number of decimals in BEP-20 contract
          * E.g. "Bep20 ZRX Decimals" - Returns ZRX's decimals
      `,
      "Decimals",
      [
        new Arg("bep20", getBep20V)
      ],
      (world, {bep20}) => getBep20Decimals(world, bep20),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20}, NumberA>(`
        #### TotalSupply

        * "Bep20 <Bep20> TotalSupply" - Returns the BEP-20 token's total supply
          * E.g. "Bep20 ZRX TotalSupply"
          * E.g. "Bep20 aZRX TotalSupply"
      `,
      "TotalSupply",
      [
        new Arg("bep20", getBep20V)
      ],
      (world, {bep20}) => getTotalSupply(world, bep20),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20, address: AddressA}, NumberA>(`
        #### TokenBalance

        * "Bep20 <Bep20> TokenBalance <Address>" - Returns the BEP-20 token balance of a given address
          * E.g. "Bep20 ZRX TokenBalance Geoff" - Returns a user's ZRX balance
          * E.g. "Bep20 aZRX TokenBalance Geoff" - Returns a user's aZRX balance
          * E.g. "Bep20 ZRX TokenBalance aZRX" - Returns aZRX's ZRX balance
      `,
      "TokenBalance",
      [
        new Arg("bep20", getBep20V),
        new Arg("address", getAddressA)
      ],
      (world, {bep20, address}) => getTokenBalance(world, bep20, address.val),
      {namePos: 1}
    ),
    new Fetcher<{bep20: Bep20, owner: AddressA, spender: AddressA}, NumberA>(`
        #### Allowance

        * "Bep20 <Bep20> Allowance owner:<Address> spender:<Address>" - Returns the BEP-20 allowance from owner to spender
          * E.g. "Bep20 ZRX Allowance Geoff Torrey" - Returns the ZRX allowance of Geoff to Torrey
          * E.g. "Bep20 aZRX Allowance Geoff Coburn" - Returns the aZRX allowance of Geoff to Coburn
          * E.g. "Bep20 ZRX Allowance Geoff aZRX" - Returns the ZRX allowance of Geoff to the aZRX aToken
      `,
      "Allowance",
      [
        new Arg("bep20", getBep20V),
        new Arg("owner", getAddressA),
        new Arg("spender", getAddressA)
      ],
      (world, {bep20, owner, spender}) => getAllowance(world, bep20, owner.val, spender.val),
      {namePos: 1}
    )
  ];
}

export async function getBep20Value(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("Bep20", bep20Fetchers(), world, event);
}
