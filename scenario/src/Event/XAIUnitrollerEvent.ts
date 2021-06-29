import { Event } from '../Event';
import { addAction, describeUser, World } from '../World';
import { XAIUnitroller } from '../Contract/XAIUnitroller';
import { XAIControllerImpl } from '../Contract/XAIControllerImpl';
import { invoke } from '../Invokation';
import { getEventV, getStringA, getAddressA } from '../CoreValue';
import { EventV, StringA, AddressA } from '../Value';
import { Arg, Command, View, processCommandEvent } from '../Command';
import { XAIControllerErrorReporter } from '../ErrorReporter';
import { buildXAIUnitroller } from '../Builder/XAIUnitrollerBuilder';
import { getXAIControllerImpl, getXAIUnitroller } from '../ContractLookup';
import { verify } from '../Verify';

async function genXAIUnitroller(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, xaiunitroller, xaiunitrollerData } = await buildXAIUnitroller(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Added XAIUnitroller (${xaiunitrollerData.description}) at address ${xaiunitroller._address}`,
    xaiunitrollerData.invokation
  );

  return world;
}

async function verifyXAIUnitroller(world: World, xaiunitroller: XAIUnitroller, apiKey: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, 'XAIUnitroller', 'XAIUnitroller', xaiunitroller._address);
  }

  return world;
}

async function acceptAdmin(world: World, from: string, xaiunitroller: XAIUnitroller): Promise<World> {
  let invokation = await invoke(world, xaiunitroller.methods._acceptAdmin(), from, XAIControllerErrorReporter);

  world = addAction(world, `Accept admin as ${from}`, invokation);

  return world;
}

async function setPendingAdmin(
  world: World,
  from: string,
  xaiunitroller: XAIUnitroller,
  pendingAdmin: string
): Promise<World> {
  let invokation = await invoke(
    world,
    xaiunitroller.methods._setPendingAdmin(pendingAdmin),
    from,
    XAIControllerErrorReporter
  );

  world = addAction(world, `Set pending admin to ${pendingAdmin}`, invokation);

  return world;
}

async function setPendingImpl(
  world: World,
  from: string,
  xaiunitroller: XAIUnitroller,
  xaicontrollerImpl: XAIControllerImpl
): Promise<World> {
  let invokation = await invoke(
    world,
    xaiunitroller.methods._setPendingImplementation(xaicontrollerImpl._address),
    from,
    XAIControllerErrorReporter
  );

  world = addAction(world, `Set pending xaicontroller impl to ${xaicontrollerImpl.name}`, invokation);

  return world;
}

export function xaiunitrollerCommands() {
  return [
    new Command<{ xaiunitrollerParams: EventV }>(
      `
        #### Deploy

        * "XAIUnitroller Deploy ...xaiunitrollerParams" - Generates a new XAIUnitroller
          * E.g. "XAIUnitroller Deploy"
      `,
      'Deploy',
      [new Arg('xaiunitrollerParams', getEventV, { variadic: true })],
      (world, from, { xaiunitrollerParams }) => genXAIUnitroller(world, from, xaiunitrollerParams.val)
    ),
    new View<{ xaiunitroller: XAIUnitroller; apiKey: StringA }>(
      `
        #### Verify

        * "XAIUnitroller Verify apiKey:<String>" - Verifies XAIUnitroller in BscScan
          * E.g. "XAIUnitroller Verify "myApiKey"
      `,
      'Verify',
      [new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }), new Arg('apiKey', getStringA)],
      (world, { xaiunitroller, apiKey }) => verifyXAIUnitroller(world, xaiunitroller, apiKey.val)
    ),
    new Command<{ xaiunitroller: XAIUnitroller; pendingAdmin: AddressA }>(
      `
        #### AcceptAdmin

        * "AcceptAdmin" - Accept admin for this xaiunitroller
          * E.g. "XAIUnitroller AcceptAdmin"
      `,
      'AcceptAdmin',
      [new Arg('xaiunitroller', getXAIUnitroller, { implicit: true })],
      (world, from, { xaiunitroller }) => acceptAdmin(world, from, xaiunitroller)
    ),
    new Command<{ xaiunitroller: XAIUnitroller; pendingAdmin: AddressA }>(
      `
        #### SetPendingAdmin

        * "SetPendingAdmin admin:<Admin>" - Sets the pending admin for this xaiunitroller
          * E.g. "XAIUnitroller SetPendingAdmin Jared"
      `,
      'SetPendingAdmin',
      [new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }), new Arg('pendingAdmin', getAddressA)],
      (world, from, { xaiunitroller, pendingAdmin }) =>
        setPendingAdmin(world, from, xaiunitroller, pendingAdmin.val)
    ),
    new Command<{ xaiunitroller: XAIUnitroller; xaicontrollerImpl: XAIControllerImpl }>(
      `
        #### SetPendingImpl

        * "SetPendingImpl impl:<Impl>" - Sets the pending xaicontroller implementation for this xaiunitroller
          * E.g. "XAIUnitroller SetPendingImpl MyScenImpl" - Sets the current xaicontroller implementation to MyScenImpl
      `,
      'SetPendingImpl',
      [
        new Arg('xaiunitroller', getXAIUnitroller, { implicit: true }),
        new Arg('xaicontrollerImpl', getXAIControllerImpl)
      ],
      (world, from, { xaiunitroller, xaicontrollerImpl }) =>
        setPendingImpl(world, from, xaiunitroller, xaicontrollerImpl)
    )
  ];
}

export async function processXAIUnitrollerEvent(
  world: World,
  event: Event,
  from: string | null
): Promise<World> {
  return await processCommandEvent<any>('XAIUnitroller', xaiunitrollerCommands(), world, event, from);
}
