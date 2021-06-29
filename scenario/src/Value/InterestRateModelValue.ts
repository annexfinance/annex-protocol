import {Event} from '../Event';
import {World} from '../World';
import {InterestRateModel} from '../Contract/InterestRateModel';
import {
  getAddressA,
  getNumberA
} from '../CoreValue';
import {
  AddressA,
  NumberA,
  Value} from '../Value';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {getInterestRateModel} from '../ContractLookup';

export async function getInterestRateModelAddress(world: World, interestRateModel: InterestRateModel): Promise<AddressA> {
  return new AddressA(interestRateModel._address);
}

export async function getBorrowRate(world: World, interestRateModel: InterestRateModel, cash: NumberA, borrows: NumberA, reserves: NumberA): Promise<NumberA> {
  return new NumberA(await interestRateModel.methods.getBorrowRate(cash.encode(), borrows.encode(), reserves.encode()).call(), 1.0e18 / 2102400);
}

export function interestRateModelFetchers() {
  return [
    new Fetcher<{interestRateModel: InterestRateModel}, AddressA>(`
        #### Address

        * "<InterestRateModel> Address" - Gets the address of the interest rate model
          * E.g. "InterestRateModel MyInterestRateModel Address"
      `,
      "Address",
      [
        new Arg("interestRateModel", getInterestRateModel)
      ],
      (world, {interestRateModel}) => getInterestRateModelAddress(world, interestRateModel),
      {namePos: 1}
    ),

    new Fetcher<{interestRateModel: InterestRateModel, cash: NumberA, borrows: NumberA, reserves: NumberA}, NumberA>(`
        #### BorrowRate

        * "<InterestRateModel> BorrowRate" - Gets the borrow rate of the interest rate model
          * E.g. "InterestRateModel MyInterestRateModel BorrowRate 0 10 0"
      `,
      "BorrowRate",
      [
        new Arg("interestRateModel", getInterestRateModel),
        new Arg("cash", getNumberA),
        new Arg("borrows", getNumberA),
        new Arg("reserves", getNumberA)
      ],
      (world, {interestRateModel, cash, borrows, reserves}) => getBorrowRate(world, interestRateModel, cash, borrows, reserves),
      {namePos: 1}
    )
  ];
}

export async function getInterestRateModelValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("InterestRateModel", interestRateModelFetchers(), world, event);
}
