import { Event } from '../Event';
import { addAction, World } from '../World';
import { XAIControllerImpl } from '../Contract/XAIControllerImpl';
import { XAIUnitroller } from '../Contract/XAIUnitroller';
import { invoke } from '../Invokation';
import { getEventV, getStringA } from '../CoreValue';
import { EventV, StringA } from '../Value';
import { Arg, Command, View, processCommandEvent } from '../Command';
import { buildXAIControllerImpl } from '../Builder/XAIControllerImplBuilder';
import { XAIControllerErrorReporter } from '../ErrorReporter';
import { getXAIControllerImpl, getXAIControllerImplData, getXAIUnitroller } from '../ContractLookup';
import { verify } from '../Verify';
import { mergeContractABI } from '../Networks';

async function genXAIControllerImpl(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, xaicontrollerImpl, xaicontrollerImplData } = await buildXAIControllerImpl(
    world,
    from,
    params
  );
  world = nextWorld;

  world = addAction(
    world,
    `Added XAIController Implementation (${xaicontrollerImplData.description}) at address ${xaicontrollerImpl._address}`,
    xaicontrollerImplData.invokation
  );

  return world;
}

async function mergeABI(
  world: World,
  from: string,
  xaicontrollerImpl: XAIControllerImpl,
  xaiunitroller: XAIUnitroller
): Promise<World> {
  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, 'XAIController', xaiunitroller, xaiunitroller.name, xaicontrollerImpl.name);
  }

  return world;
}

async function becomeG1(
  world: World,
  from: string,
  xaicontrollerImpl: XAIControllerImpl,
  xaiunitroller: XAIUnitroller
): Promise<World> {
  let invokation = await invoke(
    world,
    xaicontrollerImpl.methods._become(xaiunitroller._address),
    from,
    XAIControllerErrorReporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, 'XAIController', xaiunitroller, xaiunitroller.name, xaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${xaiunitroller._address}'s XAIController Impl`, invokation);

  return world;
}

async function becomeG2(
  world: World,
  from: string,
  xaicontrollerImpl: XAIControllerImpl,
  xaiunitroller: XAIUnitroller
): Promise<World> {
  let invokation = await invoke(
    world,
    xaicontrollerImpl.methods._become(xaiunitroller._address),
    from,
    XAIControllerErrorReporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, 'XAIController', xaiunitroller, xaiunitroller.name, xaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${xaiunitroller._address}'s XAIController Impl`, invokation);

  return world;
}

async function become(
  world: World,
  from: string,
  xaicontrollerImpl: XAIControllerImpl,
  xaiunitroller: XAIUnitroller
): Promise<World> {
  let invokation = await invoke(
    world,
    xaicontrollerImpl.methods._become(xaiunitroller._address),
    from,
    XAIControllerErrorReporter
  );

  if (!world.dryRun) {
    // Skip this specifically on dry runs since it's likely to crash due to a number of reasons
    world = await mergeContractABI(world, 'XAIController', xaiunitroller, xaiunitroller.name, xaicontrollerImpl.name);
  }

  world = addAction(world, `Become ${xaiunitroller._address}'s XAIController Impl`, invokation);

  return world;
}

async function verifyXAIControllerImpl(
  world: World,
  xaicontrollerImpl: XAIControllerImpl,
  name: string,
  contract: string,
  apiKey: string
): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, xaicontrollerImpl._address);
  }

  return world;
}

export function xaicontrollerImplCommands() {
  return [
    new Command<{ xaicontrollerImplParams: EventV }>(
      `
        #### Deploy

        * "XAIControllerImpl Deploy ...xaicontrollerImplParams" - Generates a new XAIController Implementation
          * E.g. "XAIControllerImpl Deploy MyScen Scenario"
      `,
      'Deploy',
      [new Arg('xaicontrollerImplParams', getEventV, { variadic: true })],
      (world, from, { xaicontrollerImplParams }) => genXAIControllerImpl(world, from, xaicontrollerImplParams.val)
    ),
    new View<{ xaicontrollerImplArg: StringA; apiKey: StringA }>(
      `
        #### Verify

        * "XAIControllerImpl <Impl> Verify apiKey:<String>" - Verifies XAIController Implemetation in BscScan
          * E.g. "XAIControllerImpl Verify "myApiKey"
      `,
      'Verify',
      [new Arg('xaicontrollerImplArg', getStringA), new Arg('apiKey', getStringA)],
      async (world, { xaicontrollerImplArg, apiKey }) => {
        let [xaicontrollerImpl, name, data] = await getXAIControllerImplData(world, xaicontrollerImplArg.val);

        return await verifyXAIControllerImpl(world, xaicontrollerImpl, name, data.get('contract')!, apiKey.val);
      },
      { namePos: 1 }
    ),

    new Command<{
      xaiunitroller: XAIUnitroller;
      xaicontrollerImpl: XAIControllerImpl;
    }>(
      `
        #### BecomeG1
        * "XAIControllerImpl <Impl> BecomeG1" - Become the xaicontroller, if possible.
          * E.g. "XAIControllerImpl MyImpl BecomeG1
      `,
      'BecomeG1',
      [
        new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }),
        new Arg('xaicontrollerImpl', getXAIControllerImpl)
      ],
      (world, from, { xaiunitroller, xaicontrollerImpl }) => {
        return becomeG1(world, from, xaicontrollerImpl, xaiunitroller)
      },
      { namePos: 1 }
    ),

    new Command<{
      xaiunitroller: XAIUnitroller;
      xaicontrollerImpl: XAIControllerImpl;
    }>(
      `
        #### BecomeG2
        * "XAIControllerImpl <Impl> BecomeG2" - Become the xaicontroller, if possible.
          * E.g. "XAIControllerImpl MyImpl BecomeG2
      `,
      'BecomeG2',
      [
        new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }),
        new Arg('xaicontrollerImpl', getXAIControllerImpl)
      ],
      (world, from, { xaiunitroller, xaicontrollerImpl }) => {
        return becomeG2(world, from, xaicontrollerImpl, xaiunitroller)
      },
      { namePos: 1 }
    ),

    new Command<{
      xaiunitroller: XAIUnitroller;
      xaicontrollerImpl: XAIControllerImpl;
    }>(
      `
        #### Become

        * "XAIControllerImpl <Impl> Become" - Become the xaicontroller, if possible.
          * E.g. "XAIControllerImpl MyImpl Become
      `,
      'Become',
      [
        new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }),
        new Arg('xaicontrollerImpl', getXAIControllerImpl)
      ],
      (world, from, { xaiunitroller, xaicontrollerImpl }) => {
        return become(world, from, xaicontrollerImpl, xaiunitroller)
      },
      { namePos: 1 }
    ),

    new Command<{
      xaiunitroller: XAIUnitroller;
      xaicontrollerImpl: XAIControllerImpl;
    }>(
      `
        #### MergeABI

        * "XAIControllerImpl <Impl> MergeABI" - Merges the ABI, as if it was a become.
          * E.g. "XAIControllerImpl MyImpl MergeABI
      `,
      'MergeABI',
      [
        new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }),
        new Arg('xaicontrollerImpl', getXAIControllerImpl)
      ],
      (world, from, { xaiunitroller, xaicontrollerImpl }) => mergeABI(world, from, xaicontrollerImpl, xaiunitroller),
      { namePos: 1 }
    )
  ];
}

export async function processXAIControllerImplEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>('XAIControllerImpl', xaicontrollerImplCommands(), world, event, from);
}
