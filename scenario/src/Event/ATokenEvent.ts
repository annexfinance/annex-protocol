import { Event } from '../Event';
import { addAction, describeUser, World } from '../World';
import { decodeCall, getPastEvents } from '../Contract';
import { AToken, ATokenScenario } from '../Contract/AToken';
import { ABep20Delegate } from '../Contract/ABep20Delegate'
import { ABep20Delegator } from '../Contract/ABep20Delegator'
import { invoke, Sendable } from '../Invokation';
import {
  getAddressA,
  getEventV,
  getExpNumberA,
  getNumberA,
  getStringA,
  getBoolA
} from '../CoreValue';
import {
  AddressA,
  BoolA,
  EventV,
  NothingA,
  NumberA,
  StringA
} from '../Value';
import { getContract } from '../Contract';
import { Arg, Command, View, processCommandEvent } from '../Command';
import { ATokenErrorReporter } from '../ErrorReporter';
import { getComptroller, getATokenData } from '../ContractLookup';
import { getExpMantissa } from '../Encoding';
import { buildAToken } from '../Builder/ATokenBuilder';
import { verify } from '../Verify';
import { getLiquidity } from '../Value/ComptrollerValue';
import { encodedNumber } from '../Encoding';
import { getATokenV, getABep20DelegatorV } from '../Value/ATokenValue';

function showTrxValue(world: World): string {
  return new NumberA(world.trxInvokationOpts.get('value')).show();
}

async function genAToken(world: World, from: string, event: Event): Promise<World> {
  let { world: nextWorld, aToken, tokenData } = await buildAToken(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added aToken ${tokenData.name} (${tokenData.contract}<decimals=${tokenData.decimals}>) at address ${aToken._address}`,
    tokenData.invokation
  );

  return world;
}

async function accrueInterest(world: World, from: string, aToken: AToken): Promise<World> {
  let invokation = await invoke(world, aToken.methods.accrueInterest(), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: Interest accrued`,
    invokation
  );

  return world;
}

async function mint(world: World, from: string, aToken: AToken, amount: NumberA | NothingA): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberA) {
    showAmount = amount.show();
    invokation = await invoke(world, aToken.methods.mint(amount.encode()), from, ATokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, aToken.methods.mint(), from, ATokenErrorReporter);
  }

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} mints ${showAmount}`,
    invokation
  );

  return world;
}

async function redeem(world: World, from: string, aToken: AToken, tokens: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods.redeem(tokens.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} redeems ${tokens.show()} tokens`,
    invokation
  );

  return world;
}

async function redeemUnderlying(world: World, from: string, aToken: AToken, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods.redeemUnderlying(amount.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} redeems ${amount.show()} underlying`,
    invokation
  );

  return world;
}

async function borrow(world: World, from: string, aToken: AToken, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods.borrow(amount.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} borrows ${amount.show()}`,
    invokation
  );

  return world;
}

async function repayBorrow(world: World, from: string, aToken: AToken, amount: NumberA | NothingA): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberA) {
    showAmount = amount.show();
    invokation = await invoke(world, aToken.methods.repayBorrow(amount.encode()), from, ATokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, aToken.methods.repayBorrow(), from, ATokenErrorReporter);
  }

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} repays ${showAmount} of borrow`,
    invokation
  );

  return world;
}

async function repayBorrowBehalf(world: World, from: string, behalf: string, aToken: AToken, amount: NumberA | NothingA): Promise<World> {
  let invokation;
  let showAmount;

  if (amount instanceof NumberA) {
    showAmount = amount.show();
    invokation = await invoke(world, aToken.methods.repayBorrowBehalf(behalf, amount.encode()), from, ATokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, aToken.methods.repayBorrowBehalf(behalf), from, ATokenErrorReporter);
  }

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} repays ${showAmount} of borrow on behalf of ${describeUser(world, behalf)}`,
    invokation
  );

  return world;
}

async function liquidateBorrow(world: World, from: string, aToken: AToken, borrower: string, collateral: AToken, repayAmount: NumberA | NothingA): Promise<World> {
  let invokation;
  let showAmount;

  if (repayAmount instanceof NumberA) {
    showAmount = repayAmount.show();
    invokation = await invoke(world, aToken.methods.liquidateBorrow(borrower, repayAmount.encode(), collateral._address), from, ATokenErrorReporter);
  } else {
    showAmount = showTrxValue(world);
    invokation = await invoke(world, aToken.methods.liquidateBorrow(borrower, collateral._address), from, ATokenErrorReporter);
  }

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} liquidates ${showAmount} from of ${describeUser(world, borrower)}, seizing ${collateral.name}.`,
    invokation
  );

  return world;
}

async function seize(world: World, from: string, aToken: AToken, liquidator: string, borrower: string, seizeTokens: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods.seize(liquidator, borrower, seizeTokens.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} initiates seizing ${seizeTokens.show()} to ${describeUser(world, liquidator)} from ${describeUser(world, borrower)}.`,
    invokation
  );

  return world;
}

async function evilSeize(world: World, from: string, aToken: AToken, treasure: AToken, liquidator: string, borrower: string, seizeTokens: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods.evilSeize(treasure._address, liquidator, borrower, seizeTokens.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} initiates illegal seizing ${seizeTokens.show()} to ${describeUser(world, liquidator)} from ${describeUser(world, borrower)}.`,
    invokation
  );

  return world;
}

async function setPendingAdmin(world: World, from: string, aToken: AToken, newPendingAdmin: string): Promise<World> {
  let invokation = await invoke(world, aToken.methods._setPendingAdmin(newPendingAdmin), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} sets pending admin to ${newPendingAdmin}`,
    invokation
  );

  return world;
}

async function acceptAdmin(world: World, from: string, aToken: AToken): Promise<World> {
  let invokation = await invoke(world, aToken.methods._acceptAdmin(), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} accepts admin`,
    invokation
  );

  return world;
}

async function addReserves(world: World, from: string, aToken: AToken, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods._addReserves(amount.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} adds to reserves by ${amount.show()}`,
    invokation
  );

  return world;
}

async function reduceReserves(world: World, from: string, aToken: AToken, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods._reduceReserves(amount.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} reduces reserves by ${amount.show()}`,
    invokation
  );

  return world;
}

async function setReserveFactor(world: World, from: string, aToken: AToken, reserveFactor: NumberA): Promise<World> {
  let invokation = await invoke(world, aToken.methods._setReserveFactor(reserveFactor.encode()), from, ATokenErrorReporter);

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(world, from)} sets reserve factor to ${reserveFactor.show()}`,
    invokation
  );

  return world;
}

async function setInterestRateModel(world: World, from: string, aToken: AToken, interestRateModel: string): Promise<World> {
  let invokation = await invoke(world, aToken.methods._setInterestRateModel(interestRateModel), from, ATokenErrorReporter);

  world = addAction(
    world,
    `Set interest rate for ${aToken.name} to ${interestRateModel} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function setComptroller(world: World, from: string, aToken: AToken, comptroller: string): Promise<World> {
  let invokation = await invoke(world, aToken.methods._setComptroller(comptroller), from, ATokenErrorReporter);

  world = addAction(
    world,
    `Set comptroller for ${aToken.name} to ${comptroller} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function becomeImplementation(
  world: World,
  from: string,
  aToken: AToken,
  becomeImplementationData: string
): Promise<World> {

  const aBep20Delegate = getContract('ABep20Delegate');
  const aBep20DelegateContract = await aBep20Delegate.at<ABep20Delegate>(world, aToken._address);

  let invokation = await invoke(
    world,
    aBep20DelegateContract.methods._becomeImplementation(becomeImplementationData),
    from,
    ATokenErrorReporter
  );

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(
      world,
      from
    )} initiates _becomeImplementation with data:${becomeImplementationData}.`,
    invokation
  );

  return world;
}

async function resignImplementation(
  world: World,
  from: string,
  aToken: AToken,
): Promise<World> {

  const aBep20Delegate = getContract('ABep20Delegate');
  const aBep20DelegateContract = await aBep20Delegate.at<ABep20Delegate>(world, aToken._address);

  let invokation = await invoke(
    world,
    aBep20DelegateContract.methods._resignImplementation(),
    from,
    ATokenErrorReporter
  );

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(
      world,
      from
    )} initiates _resignImplementation.`,
    invokation
  );

  return world;
}

async function setImplementation(
  world: World,
  from: string,
  aToken: ABep20Delegator,
  implementation: string,
  allowResign: boolean,
  becomeImplementationData: string
): Promise<World> {
  let invokation = await invoke(
    world,
    aToken.methods._setImplementation(
      implementation,
      allowResign,
      becomeImplementationData
    ),
    from,
    ATokenErrorReporter
  );

  world = addAction(
    world,
    `AToken ${aToken.name}: ${describeUser(
      world,
      from
    )} initiates setImplementation with implementation:${implementation} allowResign:${allowResign} data:${becomeImplementationData}.`,
    invokation
  );

  return world;
}

async function donate(world: World, from: string, aToken: AToken): Promise<World> {
  let invokation = await invoke(world, aToken.methods.donate(), from, ATokenErrorReporter);

  world = addAction(
    world,
    `Donate for ${aToken.name} as ${describeUser(world, from)} with value ${showTrxValue(world)}`,
    invokation
  );

  return world;
}

async function setATokenMock(world: World, from: string, aToken: ATokenScenario, mock: string, value: NumberA): Promise<World> {
  let mockMethod: (number) => Sendable<void>;

  switch (mock.toLowerCase()) {
    case "totalborrows":
      mockMethod = aToken.methods.setTotalBorrows;
      break;
    case "totalreserves":
      mockMethod = aToken.methods.setTotalReserves;
      break;
    default:
      throw new Error(`Mock "${mock}" not defined for aToken`);
  }

  let invokation = await invoke(world, mockMethod(value.encode()), from);

  world = addAction(
    world,
    `Mocked ${mock}=${value.show()} for ${aToken.name}`,
    invokation
  );

  return world;
}

async function verifyAToken(world: World, aToken: AToken, name: string, contract: string, apiKey: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, aToken._address);
  }

  return world;
}

async function printMinters(world: World, aToken: AToken): Promise<World> {
  let events = await getPastEvents(world, aToken, aToken.name, 'Mint');
  let addresses = events.map((event) => event.returnValues['minter']);
  let uniq = [...new Set(addresses)];

  world.printer.printLine("Minters:")

  uniq.forEach((address) => {
    world.printer.printLine(`\t${address}`)
  });

  return world;
}

async function printBorrowers(world: World, aToken: AToken): Promise<World> {
  let events = await getPastEvents(world, aToken, aToken.name, 'Borrow');
  let addresses = events.map((event) => event.returnValues['borrower']);
  let uniq = [...new Set(addresses)];

  world.printer.printLine("Borrowers:")

  uniq.forEach((address) => {
    world.printer.printLine(`\t${address}`)
  });

  return world;
}

async function printLiquidity(world: World, aToken: AToken): Promise<World> {
  let mintEvents = await getPastEvents(world, aToken, aToken.name, 'Mint');
  let mintAddresses = mintEvents.map((event) => event.returnValues['minter']);
  let borrowEvents = await getPastEvents(world, aToken, aToken.name, 'Borrow');
  let borrowAddresses = borrowEvents.map((event) => event.returnValues['borrower']);
  let uniq = [...new Set(mintAddresses.concat(borrowAddresses))];
  let comptroller = await getComptroller(world);

  world.printer.printLine("Liquidity:")

  const liquidityMap = await Promise.all(uniq.map(async (address) => {
    let userLiquidity = await getLiquidity(world, comptroller, address);

    return [address, userLiquidity.val];
  }));

  liquidityMap.forEach(([address, liquidity]) => {
    world.printer.printLine(`\t${world.settings.lookupAlias(address)}: ${liquidity / 1e18}e18`)
  });

  return world;
}

export function aTokenCommands() {
  return [
    new Command<{ aTokenParams: EventV }>(`
        #### Deploy

        * "AToken Deploy ...aTokenParams" - Generates a new AToken
          * E.g. "AToken aZRX Deploy"
      `,
      "Deploy",
      [new Arg("aTokenParams", getEventV, { variadic: true })],
      (world, from, { aTokenParams }) => genAToken(world, from, aTokenParams.val)
    ),
    new View<{ aTokenArg: StringA, apiKey: StringA }>(`
        #### Verify

        * "AToken <aToken> Verify apiKey:<String>" - Verifies AToken in BscScan
          * E.g. "AToken aZRX Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("aTokenArg", getStringA),
        new Arg("apiKey", getStringA)
      ],
      async (world, { aTokenArg, apiKey }) => {
        let [aToken, name, data] = await getATokenData(world, aTokenArg.val);

        return await verifyAToken(world, aToken, name, data.get('contract')!, apiKey.val);
      },
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken }>(`
        #### AccrueInterest

        * "AToken <aToken> AccrueInterest" - Accrues interest for given token
          * E.g. "AToken aZRX AccrueInterest"
      `,
      "AccrueInterest",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, from, { aToken }) => accrueInterest(world, from, aToken),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA | NothingA }>(`
        #### Mint

        * "AToken <aToken> Mint amount:<Number>" - Mints the given amount of aToken as specified user
          * E.g. "AToken aZRX Mint 1.0e18"
      `,
      "Mint",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA, { nullable: true })
      ],
      (world, from, { aToken, amount }) => mint(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, tokens: NumberA }>(`
        #### Redeem

        * "AToken <aToken> Redeem tokens:<Number>" - Redeems the given amount of aTokens as specified user
          * E.g. "AToken aZRX Redeem 1.0e9"
      `,
      "Redeem",
      [
        new Arg("aToken", getATokenV),
        new Arg("tokens", getNumberA)
      ],
      (world, from, { aToken, tokens }) => redeem(world, from, aToken, tokens),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA }>(`
        #### RedeemUnderlying

        * "AToken <aToken> RedeemUnderlying amount:<Number>" - Redeems the given amount of underlying as specified user
          * E.g. "AToken aZRX RedeemUnderlying 1.0e18"
      `,
      "RedeemUnderlying",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA)
      ],
      (world, from, { aToken, amount }) => redeemUnderlying(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA }>(`
        #### Borrow

        * "AToken <aToken> Borrow amount:<Number>" - Borrows the given amount of this aToken as specified user
          * E.g. "AToken aZRX Borrow 1.0e18"
      `,
      "Borrow",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA)
      ],
      // Note: we override from
      (world, from, { aToken, amount }) => borrow(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA | NothingA }>(`
        #### RepayBorrow

        * "AToken <aToken> RepayBorrow underlyingAmount:<Number>" - Repays borrow in the given underlying amount as specified user
          * E.g. "AToken aZRX RepayBorrow 1.0e18"
      `,
      "RepayBorrow",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA, { nullable: true })
      ],
      (world, from, { aToken, amount }) => repayBorrow(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, behalf: AddressA, amount: NumberA | NothingA }>(`
        #### RepayBorrowBehalf

        * "AToken <aToken> RepayBorrowBehalf behalf:<User> underlyingAmount:<Number>" - Repays borrow in the given underlying amount on behalf of another user
          * E.g. "AToken aZRX RepayBorrowBehalf Geoff 1.0e18"
      `,
      "RepayBorrowBehalf",
      [
        new Arg("aToken", getATokenV),
        new Arg("behalf", getAddressA),
        new Arg("amount", getNumberA, { nullable: true })
      ],
      (world, from, { aToken, behalf, amount }) => repayBorrowBehalf(world, from, behalf.val, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ borrower: AddressA, aToken: AToken, collateral: AToken, repayAmount: NumberA | NothingA }>(`
        #### Liquidate

        * "AToken <aToken> Liquidate borrower:<User> aTokenCollateral:<Address> repayAmount:<Number>" - Liquidates repayAmount of given token seizing collateral token
          * E.g. "AToken aZRX Liquidate Geoff aBAT 1.0e18"
      `,
      "Liquidate",
      [
        new Arg("aToken", getATokenV),
        new Arg("borrower", getAddressA),
        new Arg("collateral", getATokenV),
        new Arg("repayAmount", getNumberA, { nullable: true })
      ],
      (world, from, { borrower, aToken, collateral, repayAmount }) => liquidateBorrow(world, from, aToken, borrower.val, collateral, repayAmount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, liquidator: AddressA, borrower: AddressA, seizeTokens: NumberA }>(`
        #### Seize

        * "AToken <aToken> Seize liquidator:<User> borrower:<User> seizeTokens:<Number>" - Seizes a given number of tokens from a user (to be called from other AToken)
          * E.g. "AToken aZRX Seize Geoff Torrey 1.0e18"
      `,
      "Seize",
      [
        new Arg("aToken", getATokenV),
        new Arg("liquidator", getAddressA),
        new Arg("borrower", getAddressA),
        new Arg("seizeTokens", getNumberA)
      ],
      (world, from, { aToken, liquidator, borrower, seizeTokens }) => seize(world, from, aToken, liquidator.val, borrower.val, seizeTokens),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, treasure: AToken, liquidator: AddressA, borrower: AddressA, seizeTokens: NumberA }>(`
        #### EvilSeize

        * "AToken <aToken> EvilSeize treasure:<Token> liquidator:<User> borrower:<User> seizeTokens:<Number>" - Improperly seizes a given number of tokens from a user
          * E.g. "AToken aEVL EvilSeize aZRX Geoff Torrey 1.0e18"
      `,
      "EvilSeize",
      [
        new Arg("aToken", getATokenV),
        new Arg("treasure", getATokenV),
        new Arg("liquidator", getAddressA),
        new Arg("borrower", getAddressA),
        new Arg("seizeTokens", getNumberA)
      ],
      (world, from, { aToken, treasure, liquidator, borrower, seizeTokens }) => evilSeize(world, from, aToken, treasure, liquidator.val, borrower.val, seizeTokens),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA }>(`
        #### ReduceReserves

        * "AToken <aToken> ReduceReserves amount:<Number>" - Reduces the reserves of the aToken
          * E.g. "AToken aZRX ReduceReserves 1.0e18"
      `,
      "ReduceReserves",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA)
      ],
      (world, from, { aToken, amount }) => reduceReserves(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, amount: NumberA }>(`
    #### AddReserves

    * "AToken <aToken> AddReserves amount:<Number>" - Adds reserves to the aToken
      * E.g. "AToken aZRX AddReserves 1.0e18"
  `,
      "AddReserves",
      [
        new Arg("aToken", getATokenV),
        new Arg("amount", getNumberA)
      ],
      (world, from, { aToken, amount }) => addReserves(world, from, aToken, amount),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, newPendingAdmin: AddressA }>(`
        #### SetPendingAdmin

        * "AToken <aToken> SetPendingAdmin newPendingAdmin:<Address>" - Sets the pending admin for the aToken
          * E.g. "AToken aZRX SetPendingAdmin Geoff"
      `,
      "SetPendingAdmin",
      [
        new Arg("aToken", getATokenV),
        new Arg("newPendingAdmin", getAddressA)
      ],
      (world, from, { aToken, newPendingAdmin }) => setPendingAdmin(world, from, aToken, newPendingAdmin.val),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken }>(`
        #### AcceptAdmin

        * "AToken <aToken> AcceptAdmin" - Accepts admin for the aToken
          * E.g. "From Geoff (AToken aZRX AcceptAdmin)"
      `,
      "AcceptAdmin",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, from, { aToken }) => acceptAdmin(world, from, aToken),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, reserveFactor: NumberA }>(`
        #### SetReserveFactor

        * "AToken <aToken> SetReserveFactor reserveFactor:<Number>" - Sets the reserve factor for the aToken
          * E.g. "AToken aZRX SetReserveFactor 0.1"
      `,
      "SetReserveFactor",
      [
        new Arg("aToken", getATokenV),
        new Arg("reserveFactor", getExpNumberA)
      ],
      (world, from, { aToken, reserveFactor }) => setReserveFactor(world, from, aToken, reserveFactor),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, interestRateModel: AddressA }>(`
        #### SetInterestRateModel

        * "AToken <aToken> SetInterestRateModel interestRateModel:<Contract>" - Sets the interest rate model for the given aToken
          * E.g. "AToken aZRX SetInterestRateModel (FixedRate 1.5)"
      `,
      "SetInterestRateModel",
      [
        new Arg("aToken", getATokenV),
        new Arg("interestRateModel", getAddressA)
      ],
      (world, from, { aToken, interestRateModel }) => setInterestRateModel(world, from, aToken, interestRateModel.val),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, comptroller: AddressA }>(`
        #### SetComptroller

        * "AToken <aToken> SetComptroller comptroller:<Contract>" - Sets the comptroller for the given aToken
          * E.g. "AToken aZRX SetComptroller Comptroller"
      `,
      "SetComptroller",
      [
        new Arg("aToken", getATokenV),
        new Arg("comptroller", getAddressA)
      ],
      (world, from, { aToken, comptroller }) => setComptroller(world, from, aToken, comptroller.val),
      { namePos: 1 }
    ),
    new Command<{
      aToken: AToken;
      becomeImplementationData: StringA;
    }>(
      `
        #### BecomeImplementation

        * "AToken <aToken> BecomeImplementation becomeImplementationData:<String>"
          * E.g. "AToken aDAI BecomeImplementation "0x01234anyByTeS56789""
      `,
      'BecomeImplementation',
      [
        new Arg('aToken', getATokenV),
        new Arg('becomeImplementationData', getStringA)
      ],
      (world, from, { aToken, becomeImplementationData }) =>
        becomeImplementation(
          world,
          from,
          aToken,
          becomeImplementationData.val
        ),
      { namePos: 1 }
    ),
    new Command<{aToken: AToken;}>(
      `
        #### ResignImplementation

        * "AToken <aToken> ResignImplementation"
          * E.g. "AToken aDAI ResignImplementation"
      `,
      'ResignImplementation',
      [new Arg('aToken', getATokenV)],
      (world, from, { aToken }) =>
        resignImplementation(
          world,
          from,
          aToken
        ),
      { namePos: 1 }
    ),
    new Command<{
      aToken: ABep20Delegator;
      implementation: AddressA;
      allowResign: BoolA;
      becomeImplementationData: StringA;
    }>(
      `
        #### SetImplementation

        * "AToken <aToken> SetImplementation implementation:<Address> allowResign:<Bool> becomeImplementationData:<String>"
          * E.g. "AToken aDAI SetImplementation (AToken aDAIDelegate Address) True "0x01234anyByTeS56789"
      `,
      'SetImplementation',
      [
        new Arg('aToken', getABep20DelegatorV),
        new Arg('implementation', getAddressA),
        new Arg('allowResign', getBoolA),
        new Arg('becomeImplementationData', getStringA)
      ],
      (world, from, { aToken, implementation, allowResign, becomeImplementationData }) =>
        setImplementation(
          world,
          from,
          aToken,
          implementation.val,
          allowResign.val,
          becomeImplementationData.val
        ),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken }>(`
        #### Donate

        * "AToken <aToken> Donate" - Calls the donate (payable no-op) function
          * E.g. "(Trx Value 5.0e18 (AToken aBNB Donate))"
      `,
      "Donate",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, from, { aToken }) => donate(world, from, aToken),
      { namePos: 1 }
    ),
    new Command<{ aToken: AToken, variable: StringA, value: NumberA }>(`
        #### Mock

        * "AToken <aToken> Mock variable:<String> value:<Number>" - Mocks a given value on aToken. Note: value must be a supported mock and this will only work on a "ATokenScenario" contract.
          * E.g. "AToken aZRX Mock totalBorrows 5.0e18"
          * E.g. "AToken aZRX Mock totalReserves 0.5e18"
      `,
      "Mock",
      [
        new Arg("aToken", getATokenV),
        new Arg("variable", getStringA),
        new Arg("value", getNumberA),
      ],
      (world, from, { aToken, variable, value }) => setATokenMock(world, from, <ATokenScenario>aToken, variable.val, value),
      { namePos: 1 }
    ),
    new View<{ aToken: AToken }>(`
        #### Minters

        * "AToken <aToken> Minters" - Print address of all minters
      `,
      "Minters",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => printMinters(world, aToken),
      { namePos: 1 }
    ),
    new View<{ aToken: AToken }>(`
        #### Borrowers

        * "AToken <aToken> Borrowers" - Print address of all borrowers
      `,
      "Borrowers",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => printBorrowers(world, aToken),
      { namePos: 1 }
    ),
    new View<{ aToken: AToken }>(`
        #### Liquidity

        * "AToken <aToken> Liquidity" - Prints liquidity of all minters or borrowers
      `,
      "Liquidity",
      [
        new Arg("aToken", getATokenV)
      ],
      (world, { aToken }) => printLiquidity(world, aToken),
      { namePos: 1 }
    ),
    new View<{ aToken: AToken, input: StringA }>(`
        #### Decode

        * "Decode <aToken> input:<String>" - Prints information about a call to a aToken contract
      `,
      "Decode",
      [
        new Arg("aToken", getATokenV),
        new Arg("input", getStringA)

      ],
      (world, { aToken, input }) => decodeCall(world, aToken, input.val),
      { namePos: 1 }
    )
  ];
}

export async function processATokenEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("AToken", aTokenCommands(), world, event, from);
}
