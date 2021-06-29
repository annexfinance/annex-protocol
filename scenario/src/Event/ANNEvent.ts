import { Event } from '../Event';
import { addAction, World, describeUser } from '../World';
import { ANN, ANNScenario } from '../Contract/ANN';
import { buildANN } from '../Builder/ANNBuilder';
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
import { getANN } from '../ContractLookup';
import { NoErrorReporter } from '../ErrorReporter';
import { verify } from '../Verify';
import { encodedNumber } from '../Encoding';

async function genANN(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, ann, tokenData } = await buildANN(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed ANN (${ann.name}) to address ${ann._address}`,
    tokenData.invokation
  );

  return world;
}

async function verifyANN(world: World, ann: ANN, apiKey: string, modelName: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, ann._address);
  }

  return world;
}

async function approve(world: World, from: string, ann: ANN, address: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, ann.methods.approve(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Approved ANN token for ${from} of ${amount.show()}`,
    invokation
  );

  return world;
}

async function transfer(world: World, from: string, ann: ANN, address: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, ann.methods.transfer(address, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} ANN tokens from ${from} to ${address}`,
    invokation
  );

  return world;
}

async function transferFrom(world: World, from: string, ann: ANN, owner: string, spender: string, amount: NumberA): Promise<World> {
  let invokation = await invoke(world, ann.methods.transferFrom(owner, spender, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `"Transferred from" ${amount.show()} ANN tokens from ${owner} to ${spender}`,
    invokation
  );

  return world;
}

async function transferScenario(world: World, from: string, ann: ANNScenario, addresses: string[], amount: NumberA): Promise<World> {
  let invokation = await invoke(world, ann.methods.transferScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} ANN tokens from ${from} to ${addresses}`,
    invokation
  );

  return world;
}

async function transferFromScenario(world: World, from: string, ann: ANNScenario, addresses: string[], amount: NumberA): Promise<World> {
  let invokation = await invoke(world, ann.methods.transferFromScenario(addresses, amount.encode()), from, NoErrorReporter);

  world = addAction(
    world,
    `Transferred ${amount.show()} ANN tokens from ${addresses} to ${from}`,
    invokation
  );

  return world;
}

async function delegate(world: World, from: string, ann: ANN, account: string): Promise<World> {
  let invokation = await invoke(world, ann.methods.delegate(account), from, NoErrorReporter);

  world = addAction(
    world,
    `"Delegated from" ${from} to ${account}`,
    invokation
  );

  return world;
}

async function setBlockNumber(
  world: World,
  from: string,
  ann: ANN,
  blockNumber: NumberA
): Promise<World> {
  return addAction(
    world,
    `Set ANN blockNumber to ${blockNumber.show()}`,
    await invoke(world, ann.methods.setBlockNumber(blockNumber.encode()), from)
  );
}

export function annCommands() {
  return [
    new Command<{ params: EventV }>(`
        #### Deploy

        * "Deploy ...params" - Generates a new ANN token
          * E.g. "ANN Deploy"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genANN(world, from, params.val)
    ),

    new View<{ ann: ANN, apiKey: StringA, contractName: StringA }>(`
        #### Verify

        * "<ANN> Verify apiKey:<String> contractName:<String>=ANN" - Verifies ANN token in BscScan
          * E.g. "ANN Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("apiKey", getStringA),
        new Arg("contractName", getStringA, { default: new StringA("ANN") })
      ],
      async (world, { ann, apiKey, contractName }) => {
        return await verifyANN(world, ann, apiKey.val, ann.name, contractName.val)
      }
    ),

    new Command<{ ann: ANN, spender: AddressA, amount: NumberA }>(`
        #### Approve

        * "ANN Approve spender:<Address> <Amount>" - Adds an allowance between user and address
          * E.g. "ANN Approve Geoff 1.0e18"
      `,
      "Approve",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("spender", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { ann, spender, amount }) => {
        return approve(world, from, ann, spender.val, amount)
      }
    ),

    new Command<{ ann: ANN, recipient: AddressA, amount: NumberA }>(`
        #### Transfer

        * "ANN Transfer recipient:<User> <Amount>" - Transfers a number of tokens via "transfer" as given user to recipient (this does not depend on allowance)
          * E.g. "ANN Transfer Torrey 1.0e18"
      `,
      "Transfer",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("recipient", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { ann, recipient, amount }) => transfer(world, from, ann, recipient.val, amount)
    ),

    new Command<{ ann: ANN, owner: AddressA, spender: AddressA, amount: NumberA }>(`
        #### TransferFrom

        * "ANN TransferFrom owner:<User> spender:<User> <Amount>" - Transfers a number of tokens via "transfeFrom" to recipient (this depends on allowances)
          * E.g. "ANN TransferFrom Geoff Torrey 1.0e18"
      `,
      "TransferFrom",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("owner", getAddressA),
        new Arg("spender", getAddressA),
        new Arg("amount", getNumberA)
      ],
      (world, from, { ann, owner, spender, amount }) => transferFrom(world, from, ann, owner.val, spender.val, amount)
    ),

    new Command<{ ann: ANNScenario, recipients: AddressA[], amount: NumberA }>(`
        #### TransferScenario

        * "ANN TransferScenario recipients:<User[]> <Amount>" - Transfers a number of tokens via "transfer" to the given recipients (this does not depend on allowance)
          * E.g. "ANN TransferScenario (Jared Torrey) 10"
      `,
      "TransferScenario",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("recipients", getAddressA, { mapped: true }),
        new Arg("amount", getNumberA)
      ],
      (world, from, { ann, recipients, amount }) => transferScenario(world, from, ann, recipients.map(recipient => recipient.val), amount)
    ),

    new Command<{ ann: ANNScenario, froms: AddressA[], amount: NumberA }>(`
        #### TransferFromScenario

        * "ANN TransferFromScenario froms:<User[]> <Amount>" - Transfers a number of tokens via "transferFrom" from the given users to msg.sender (this depends on allowance)
          * E.g. "ANN TransferFromScenario (Jared Torrey) 10"
      `,
      "TransferFromScenario",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("froms", getAddressA, { mapped: true }),
        new Arg("amount", getNumberA)
      ],
      (world, from, { ann, froms, amount }) => transferFromScenario(world, from, ann, froms.map(_from => _from.val), amount)
    ),

    new Command<{ ann: ANN, account: AddressA }>(`
        #### Delegate

        * "ANN Delegate account:<Address>" - Delegates votes to a given account
          * E.g. "ANN Delegate Torrey"
      `,
      "Delegate",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
      ],
      (world, from, { ann, account }) => delegate(world, from, ann, account.val)
    ),
    new Command<{ ann: ANN, blockNumber: NumberA }>(`
      #### SetBlockNumber

      * "SetBlockNumber <Seconds>" - Sets the blockTimestamp of the ANN Harness
      * E.g. "ANN SetBlockNumber 500"
      `,
        'SetBlockNumber',
        [new Arg('ann', getANN, { implicit: true }), new Arg('blockNumber', getNumberA)],
        (world, from, { ann, blockNumber }) => setBlockNumber(world, from, ann, blockNumber)
      )
  ];
}

export async function processANNEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("ANN", annCommands(), world, event, from);
}
