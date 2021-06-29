import {Event} from '../Event';
import {addAction, describeUser, World} from '../World';
import {decodeCall, getPastEvents} from '../Contract';
import {XAIController} from '../Contract/XAIController';
import {XAIControllerImpl} from '../Contract/XAIControllerImpl';
import {AToken} from '../Contract/AToken';
import {invoke} from '../Invokation';
import {
  getAddressA,
  getBoolA,
  getEventV,
  getExpNumberA,
  getNumberA,
  getPercentV,
  getStringA,
  getCoreValue
} from '../CoreValue';
import {
  AddressA,
  BoolA,
  EventV,
  NumberA,
  StringA
} from '../Value';
import {Arg, Command, View, processCommandEvent} from '../Command';
import {buildXAIControllerImpl} from '../Builder/XAIControllerImplBuilder';
import {XAIControllerErrorReporter} from '../ErrorReporter';
import {getXAIController, getXAIControllerImpl} from '../ContractLookup';
// import {getLiquidity} from '../Value/XAIControllerValue';
import {getATokenV} from '../Value/ATokenValue';
import {encodedNumber} from '../Encoding';
import {encodeABI, rawValues} from "../Utils";

async function genXAIController(world: World, from: string, params: Event): Promise<World> {
  let {world: nextWorld, xaicontrollerImpl: xaicontroller, xaicontrollerImplData: xaicontrollerData} = await buildXAIControllerImpl(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added XAIController (${xaicontrollerData.description}) at address ${xaicontroller._address}`,
    xaicontrollerData.invokation
  );

  return world;
};

async function setPendingAdmin(world: World, from: string, xaicontroller: XAIController, newPendingAdmin: string): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods._setPendingAdmin(newPendingAdmin), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `XAIController: ${describeUser(world, from)} sets pending admin to ${newPendingAdmin}`,
    invokation
  );

  return world;
}

async function acceptAdmin(world: World, from: string, xaicontroller: XAIController): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods._acceptAdmin(), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `XAIController: ${describeUser(world, from)} accepts admin`,
    invokation
  );

  return world;
}

async function sendAny(world: World, from:string, xaicontroller: XAIController, signature: string, callArgs: string[]): Promise<World> {
  const fnData = encodeABI(world, signature, callArgs);
  await world.web3.eth.sendTransaction({
      to: xaicontroller._address,
      data: fnData,
      from: from
    })
  return world;
}

async function setComptroller(world: World, from: string, xaicontroller: XAIController, comptroller: string): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods._setComptroller(comptroller), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `Set Comptroller to ${comptroller} as ${describeUser(world, from)}`,
    invokation
  );

  return world;
}

async function mint(world: World, from: string, xaicontroller: XAIController, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods.mintXAI(amount.encode()), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `XAIController: ${describeUser(world, from)} borrows ${amount.show()}`,
    invokation
  );

  return world;
}

async function repay(world: World, from: string, xaicontroller: XAIController, amount: NumberA): Promise<World> {
  let invokation;
  let showAmount;

  showAmount = amount.show();
  invokation = await invoke(world, xaicontroller.methods.repayXAI(amount.encode()), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `XAIController: ${describeUser(world, from)} repays ${showAmount} of borrow`,
    invokation
  );

  return world;
}


async function liquidateXAI(world: World, from: string, xaicontroller: XAIController, borrower: string, collateral: AToken, repayAmount: NumberA): Promise<World> {
  let invokation;
  let showAmount;

  showAmount = repayAmount.show();
  invokation = await invoke(world, xaicontroller.methods.liquidateXAI(borrower, repayAmount.encode(), collateral._address), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `XAIController: ${describeUser(world, from)} liquidates ${showAmount} from of ${describeUser(world, borrower)}, seizing ${collateral.name}.`,
    invokation
  );

  return world;
}

async function setTreasuryData(
  world: World,
  from: string,
  xaicontroller: XAIController,
  guardian: string,
  address: string,
  percent: NumberA,
): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods._setTreasuryData(guardian, address, percent.encode()), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `Set treasury data to guardian: ${guardian}, address: ${address}, percent: ${percent.show()}`,
    invokation
  );

  return world;
}

async function initialize(
  world: World,
  from: string,
  xaicontroller: XAIController
): Promise<World> {
  let invokation = await invoke(world, xaicontroller.methods.initialize(), from, XAIControllerErrorReporter);

  world = addAction(
    world,
    `Initizlied the XAIController`,
    invokation
  );

  return world;
}

export function xaicontrollerCommands() {
  return [
    new Command<{xaicontrollerParams: EventV}>(`
        #### Deploy

        * "XAIController Deploy ...xaicontrollerParams" - Generates a new XAIController (not as Impl)
          * E.g. "XAIController Deploy YesNo"
      `,
      "Deploy",
      [new Arg("xaicontrollerParams", getEventV, {variadic: true})],
      (world, from, {xaicontrollerParams}) => genXAIController(world, from, xaicontrollerParams.val)
    ),

    new Command<{xaicontroller: XAIController, signature: StringA, callArgs: StringA[]}>(`
      #### Send
      * XAIController Send functionSignature:<String> callArgs[] - Sends any transaction to xaicontroller
      * E.g: XAIController Send "setXAIAddress(address)" (Address XAI)
      `,
      "Send",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("signature", getStringA),
        new Arg("callArgs", getCoreValue, {variadic: true, mapped: true})
      ],
      (world, from, {xaicontroller, signature, callArgs}) => sendAny(world, from, xaicontroller, signature.val, rawValues(callArgs))
    ),

    new Command<{ xaicontroller: XAIController, comptroller: AddressA}>(`
        #### SetComptroller

        * "XAIController SetComptroller comptroller:<Address>" - Sets the comptroller address
          * E.g. "XAIController SetComptroller 0x..."
      `,
      "SetComptroller",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("comptroller", getAddressA)
      ],
      (world, from, {xaicontroller, comptroller}) => setComptroller(world, from, xaicontroller, comptroller.val)
    ),

    new Command<{ xaicontroller: XAIController, amount: NumberA }>(`
        #### Mint

        * "XAIController Mint amount:<Number>" - Mint the given amount of XAI as specified user
          * E.g. "XAIController Mint 1.0e18"
      `,
      "Mint",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("amount", getNumberA)
      ],
      // Note: we override from
      (world, from, { xaicontroller, amount }) => mint(world, from, xaicontroller, amount),
    ),

    new Command<{ xaicontroller: XAIController, amount: NumberA }>(`
        #### Repay

        * "XAIController Repay amount:<Number>" - Repays XAI in the given amount as specified user
          * E.g. "XAIController Repay 1.0e18"
      `,
      "Repay",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("amount", getNumberA, { nullable: true })
      ],
      (world, from, { xaicontroller, amount }) => repay(world, from, xaicontroller, amount),
    ),

    new Command<{ xaicontroller: XAIController, borrower: AddressA, aToken: AToken, collateral: AToken, repayAmount: NumberA }>(`
        #### LiquidateXAI

        * "XAIController LiquidateXAI borrower:<User> aTokenCollateral:<Address> repayAmount:<Number>" - Liquidates repayAmount of XAI seizing collateral token
          * E.g. "XAIController LiquidateXAI Geoff aBAT 1.0e18"
      `,
      "LiquidateXAI",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("borrower", getAddressA),
        new Arg("collateral", getATokenV),
        new Arg("repayAmount", getNumberA, { nullable: true })
      ],
      (world, from, { xaicontroller, borrower, collateral, repayAmount }) => liquidateXAI(world, from, xaicontroller, borrower.val, collateral, repayAmount),
    ),

    new Command<{xaicontroller: XAIController, guardian: AddressA, address: AddressA, percent: NumberA}>(`
      #### SetTreasuryData
      * "XAIController SetTreasuryData <guardian> <address> <rate>" - Sets Treasury Data
      * E.g. "XAIController SetTreasuryData 0x.. 0x.. 1e18
      `,
      "SetTreasuryData",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true}),
        new Arg("guardian", getAddressA),
        new Arg("address", getAddressA),
        new Arg("percent", getNumberA)
      ],
      (world, from, {xaicontroller, guardian, address, percent}) => setTreasuryData(world, from, xaicontroller, guardian.val, address.val, percent)
    ),

    new Command<{xaicontroller: XAIController}>(`
      #### Initialize
      * "XAIController Initialize" - Call Initialize
      * E.g. "XAIController Initialize
      `,
      "Initialize",
      [
        new Arg("xaicontroller", getXAIController, {implicit: true})
      ],
      (world, from, {xaicontroller}) => initialize(world, from, xaicontroller)
    )
  ];
}

export async function processXAIControllerEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XAIController", xaicontrollerCommands(), world, event, from);
}
