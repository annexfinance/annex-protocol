import { Event } from '../Event';
import { addAction, World, describeUser } from '../World';
import { XAI, XAIScenario } from '../Contract/XAI';
import { buildXAI } from '../Builder/XAIBuilder';
import { invoke } from '../Invokation';
import {
  getAddressA,
  getEventV,
  getNumberA,
  getStringA,
} from '../CoreValue';
import {
  AddressA,
  EventV,
  NumberA,
  StringA
} from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getXAI } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';
import { verify } from '../Verify';
import { encodedNumber } from '../Encoding';

async function genXAI(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, xai, tokenData } = await buildXAI(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed XAI (${xai.name}) to address ${xai._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyXAI(world: World, xai: XAI, apiKey: string, modelName: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, xai._address);
  }

  return world;
}

async function approve(world: World, from: string, xai: XAI, address: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Approved XAI token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function faucet(world: World, from: string, xai: XAI, address: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.allocateTo(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Fauceted ${amount.show()} XAI tokens to ${address}`,
    invokation
  );

  return world;
}

async function transfer(world: World, from: string, xai: XAI, address: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} XAI tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(world: World, from: string, xai: XAI, owner: string, spender: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.transferFrom(owner, spender, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} XAI tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function transferScenario(world: World, from: string, xai: XAIScenario, addresses: string[], amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.transferScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} XAI tokens from ${from} to ${addresses}`,
    invokation
  );

  return world;
}

async function transferFromScenario(world: World, from: string, xai: XAIScenario, addresses: string[], amount: NumberA): Promise<World> {
  let invokation = await invoke(world, xai.methods.transferFromScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} XAI tokens from ${addresses} to ${from}`,
    invokation
  );

  return world;
}

async function rely(world: World, from: string, xai: XAI, address: string): Promise<World> {
  let invokation = await invoke(world, xai.methods.rely(address), from, NoErrorReporter);

  world = addAction(
    world,
    `Add rely to XAI token to ${address}`,
    invokation
  );

  return world;
}

export function xaiCommands() {
  return [
    new Command<{ params: EventV }>(`
        #### Deploy

        * "Deploy ...params" - Generates a new XAI token
          * E.g. "XAI Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genXAI(world, from, params.val)
    ),

    new View<{ xai: XAI, apiKey: StringA, contractName: StringA }>(`
        #### Verify

        * "<XAI> Verify apiKey:<String> contractName:<String>=XAI" - Verifies XAI token in BscScan
          * E.g. "XAI Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("apiKey", getStringA),
        new Arg("contractName", getStringA, { default: new StringA("XAI") })
      ],
      async (world, { xai, apiKey, contractName }) => {
        return await verifyXAI(world, xai, apiKey.val, xai.name, contractName.val)
      }
    ),

    new Command<{ xai: XAI, spender: AddressA, amount: NumberA }>(`
        #### Approve

        * "XAI Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "XAI Approve Geoff 1.0e18"
      `,
      "Approve",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("spender", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { xai, spender, amount }) => {
        return approve(world, from, xai, spender.val, amount)
      }
    ),

    new Command<{ xai: XAI, recipient: AddressA, amount: NumberA}>(`
        #### Faucet

        * "XAI Faucet recipient:<User> <Amount>" - Adds an arbitrary balance to given user
          * E.g. "XAI Faucet Geoff 1.0e18"
      `,
      "Faucet",
      [ 
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("recipient", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, {xai, recipient, amount}) => {
        return faucet(world, from, xai, recipient.val, amount)
      }
    ),

    new Command<{ xai: XAI, recipient: AddressA, amount: NumberA }>(`
        #### Transfer

        * "XAI Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "XAI Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("recipient", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { xai, recipient, amount }) => transfer(world, from, xai, recipient.val, amount)
    ),

    new Command<{ xai: XAI, owner: AddressA, spender: AddressA, amount: NumberA }>(`
        #### TransferFrom

        * "XAI TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "XAI TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("owner", getAddressA),
        new Arg("spender", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { xai, owner, spender, amount }) => transferFrom(world, from, xai, owner.val, spender.val, amount)
    ),

    new Command<{ xai: XAIScenario, recipients: AddressA[], amount: NumberA }>(`
        #### TransferScenario

        * "XAI TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "XAI TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("recipients", getAddressA, { mapped: true }),
        new Arg("amount", getNumberA)
      ],
      (world, from, { xai, recipients, amount }) => transferScenario(world, from, xai, recipients.map(recipient => recipient.val), amount)
    ),

    new Command<{ xai: XAIScenario, froms: AddressA[], amount: NumberA }>(`
        #### TransferFromScenario

        * "XAI TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "XAI TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("froms", getAddressA, { mapped: true }),
        new Arg("amount", getNumberA)
      ],
      (world, from, { xai, froms, amount }) => transferFromScenario(world, from, xai, froms.map(_from => _from.val), amount)
    ),

    new Command<{ xai: XAI, address: AddressA, amount: NumberA }>(`
        #### Rely

        * "XAI Rely rely:<Address>" - Adds rely address
          * E.g. "XAI Rely 0xXX..."
      `,
      "Rely",
      [
        new Arg("xai", getXAI, { implicit: true }),
        new Arg("address", getAddressA)
      ],
      (world, from, { xai, address }) => {
        return rely(world, from, xai, address.val)
      }
    ),
  ];
}

export async function processXAIEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("XAI", xaiCommands(), world, event, from);
}
