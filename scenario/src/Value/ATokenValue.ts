import { Event } from '../Event';
import { World } from '../World';
import { AToken } from '../Contract/AToken';
import { ABep20Delegator } from '../Contract/ABep20Delegator';
import { Bep20 } from '../Contract/Bep20';
import {
  getAddressA,
  getCoreValue,
  getStringA,
  mapValue
} from '../CoreValue';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import {
  AddressA,
  NumberA,
  Value,
  StringA
} from '../Value';
import { getWorldContractByAddress, getATokenAddress } from '../ContractLookup';

export async function getATokenV(world: World, event: Event): Promise<AToken> {
  const address = await mapValue<AddressA>(
    world,
    event,
    (str) => new AddressA(getATokenAddress(world, str)),
    getCoreValue,
    AddressA
  );

  return getWorldContractByAddress<AToken>(world, address.val);
}

export async function getABep20DelegatorV(world: World, event: Event): Promise<ABep20Delegator> {
  const address = await mapValue<AddressA>(
    world,
    event,
    (str) => new AddressA(getATokenAddress(world, str)),
    getCoreValue,
    AddressA
  );

  return getWorldContractByAddress<ABep20Delegator>(world, address.val);
}

async function getInterestRateModel(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(await aToken.methods.interestRateModel().call());
}

async function aTokenAddress(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(aToken._address);
}

async function getATokenAdmin(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(await aToken.methods.admin().call());
}

async function getATokenPendingAdmin(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(await aToken.methods.pendingAdmin().call());
}

async function balanceOfUnderlying(world: World, aToken: AToken, user: string): Promise<NumberA> {
  return new NumberA(await aToken.methods.balanceOfUnderlying(user).call());
}

async function getBorrowBalance(world: World, aToken: AToken, user): Promise<NumberA> {
  return new NumberA(await aToken.methods.borrowBalanceCurrent(user).call());
}

async function getBorrowBalanceStored(world: World, aToken: AToken, user): Promise<NumberA> {
  return new NumberA(await aToken.methods.borrowBalanceStored(user).call());
}

async function getTotalBorrows(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.totalBorrows().call());
}

async function getTotalBorrowsCurrent(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.totalBorrowsCurrent().call());
}

async function getReserveFactor(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.reserveFactorMantissa().call(), 1.0e18);
}

async function getTotalReserves(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.totalReserves().call());
}

async function getComptroller(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(await aToken.methods.comptroller().call());
}

async function getExchangeRateStored(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.exchangeRateStored().call());
}

async function getExchangeRate(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.exchangeRateCurrent().call(), 1e18);
}

async function getCash(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.getCash().call());
}

async function getInterestRate(world: World, aToken: AToken): Promise<NumberA> {
  return new NumberA(await aToken.methods.borrowRatePerBlock().call(), 1.0e18 / 2102400);
}

async function getImplementation(world: World, aToken: AToken): Promise<AddressA> {
  return new AddressA(await (aToken as ABep20Delegator).methods.implementation().call());
}

export function aTokenFetchers() {
  return [
    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### Address

        * "AToken <AToken> Address" - Returns address of AToken contract
          * E.g. "AToken aZRX Address" - Returns aZRX's address
      `,
      "Address",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => aTokenAddress(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### InterestRateModel

        * "AToken <AToken> InterestRateModel" - Returns the interest rate model of AToken contract
          * E.g. "AToken aZRX InterestRateModel" - Returns aZRX's interest rate model
      `,
      "InterestRateModel",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getInterestRateModel(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### Admin

        * "AToken <AToken> Admin" - Returns the admin of AToken contract
          * E.g. "AToken aZRX Admin" - Returns aZRX's admin
      `,
      "Admin",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getATokenAdmin(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### PendingAdmin

        * "AToken <AToken> PendingAdmin" - Returns the pending admin of AToken contract
          * E.g. "AToken aZRX PendingAdmin" - Returns aZRX's pending admin
      `,
      "PendingAdmin",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getATokenPendingAdmin(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### Underlying

        * "AToken <AToken> Underlying" - Returns the underlying asset (if applicable)
          * E.g. "AToken aZRX Underlying"
      `,
      "Underlying",
      [
        new Arg("aToken", getATokenV)
      ],
      async (world, { aToken }) => new AddressA(await aToken.methods.underlying().call()),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressA }, NumberA>(`
        #### UnderlyingBalance

        * "AToken <AToken> UnderlyingBalance <User>" - Returns a user's underlying balance (based on given exchange rate)
          * E.g. "AToken aZRX UnderlyingBalance Geoff"
      `,
      "UnderlyingBalance",
      [
        new Arg("aToken", getATokenV),
        new Arg<AddressA>("address", getAddressA)
      ],
      (world, { aToken, address }) => balanceOfUnderlying(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressA }, NumberA>(`
        #### BorrowBalance

        * "AToken <AToken> BorrowBalance <User>" - Returns a user's borrow balance (including interest)
          * E.g. "AToken aZRX BorrowBalance Geoff"
      `,
      "BorrowBalance",
      [
        new Arg("aToken", getATokenV),
        new Arg("address", getAddressA)
      ],
      (world, { aToken, address }) => getBorrowBalance(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken, address: AddressA }, NumberA>(`
        #### BorrowBalanceStored

        * "AToken <AToken> BorrowBalanceStored <User>" - Returns a user's borrow balance (without specifically re-accruing interest)
          * E.g. "AToken aZRX BorrowBalanceStored Geoff"
      `,
      "BorrowBalanceStored",
      [
        new Arg("aToken", getATokenV),
        new Arg("address", getAddressA)
      ],
      (world, { aToken, address }) => getBorrowBalanceStored(world, aToken, address.val),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### TotalBorrows

        * "AToken <AToken> TotalBorrows" - Returns the aToken's total borrow balance
          * E.g. "AToken aZRX TotalBorrows"
      `,
      "TotalBorrows",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalBorrows(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### TotalBorrowsCurrent

        * "AToken <AToken> TotalBorrowsCurrent" - Returns the aToken's total borrow balance with interest
          * E.g. "AToken aZRX TotalBorrowsCurrent"
      `,
      "TotalBorrowsCurrent",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalBorrowsCurrent(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### Reserves

        * "AToken <AToken> Reserves" - Returns the aToken's total reserves
          * E.g. "AToken aZRX Reserves"
      `,
      "Reserves",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getTotalReserves(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### ReserveFactor

        * "AToken <AToken> ReserveFactor" - Returns reserve factor of AToken contract
          * E.g. "AToken aZRX ReserveFactor" - Returns aZRX's reserve factor
      `,
      "ReserveFactor",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getReserveFactor(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### Comptroller

        * "AToken <AToken> Comptroller" - Returns the aToken's comptroller
          * E.g. "AToken aZRX Comptroller"
      `,
      "Comptroller",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getComptroller(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### ExchangeRateStored

        * "AToken <AToken> ExchangeRateStored" - Returns the aToken's exchange rate (based on balances stored)
          * E.g. "AToken aZRX ExchangeRateStored"
      `,
      "ExchangeRateStored",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getExchangeRateStored(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### ExchangeRate

        * "AToken <AToken> ExchangeRate" - Returns the aToken's current exchange rate
          * E.g. "AToken aZRX ExchangeRate"
      `,
      "ExchangeRate",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getExchangeRate(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### Cash

        * "AToken <AToken> Cash" - Returns the aToken's current cash
          * E.g. "AToken aZRX Cash"
      `,
      "Cash",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getCash(world, aToken),
      { namePos: 1 }
    ),

    new Fetcher<{ aToken: AToken }, NumberA>(`
        #### InterestRate

        * "AToken <AToken> InterestRate" - Returns the aToken's current interest rate
          * E.g. "AToken aZRX InterestRate"
      `,
      "InterestRate",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, {aToken}) => getInterestRate(world, aToken),
      {namePos: 1}
    ),
    new Fetcher<{aToken: AToken, signature: StringA}, NumberA>(`
        #### CallNum

        * "AToken <AToken> Call <signature>" - Simple direct call method, for now with no parameters
          * E.g. "AToken aZRX Call \"borrowIndex()\""
      `,
      "CallNum",
      [
        new Arg("aToken", getATokenV),
        new Arg("signature", getStringA),
      ],
      async (world, {aToken, signature}) => {
        const res = await world.web3.eth.call({
            to: aToken._address,
            data: world.web3.eth.abi.encodeFunctionSignature(signature.val)
          })
        const resNum : any = world.web3.eth.abi.decodeParameter('uint256',res);
        return new NumberA(resNum);
      }
      ,
      {namePos: 1}
    ),
    new Fetcher<{ aToken: AToken }, AddressA>(`
        #### Implementation

        * "AToken <AToken> Implementation" - Returns the aToken's current implementation
          * E.g. "AToken aDAI Implementation"
      `,
      "Implementation",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => getImplementation(world, aToken),
      { namePos: 1 }
    )
  ];
}

export async function getATokenValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("aToken", aTokenFetchers(), world, event);
}
