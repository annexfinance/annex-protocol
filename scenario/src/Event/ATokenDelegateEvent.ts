import { Event } from '../Event';
import { addAction, describeUser, World } from '../World';
import { decodeCall, getPastEvents } from '../Contract';
import { AToken, ATokenScenario } from '../Contract/AToken';
import { ABep20Delegate } from '../Contract/ABep20Delegate'
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
import { Arg, Command, View, processCommandEvent } from '../Command';
import { getATokenDelegateData } from '../ContractLookup';
import { buildATokenDelegate } from '../Builder/ATokenDelegateBuilder';
import { verify } from '../Verify';

async function genATokenDelegate(world: World, from: string, event: Event): Promise<World> {
  let { world: nextWorld, aTokenDelegate, delegateData } = await buildATokenDelegate(world, from, event);
  world = nextWorld;

  world = addAction(
    world,
    `Added aToken ${delegateData.name} (${delegateData.contract}) at address ${aTokenDelegate._address}`,
    delegateData.invokation
  );

  return world;
}

async function verifyATokenDelegate(world: World, aTokenDelegate: ABep20Delegate, name: string, contract: string, apiKey: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, name, contract, aTokenDelegate._address);
  }

  return world;
}

export function aTokenDelegateCommands() {
  return [
    new Command<{ aTokenDelegateParams: EventV }>(`
        #### Deploy

        * "ATokenDelegate Deploy ...aTokenDelegateParams" - Generates a new ATokenDelegate
          * E.g. "ATokenDelegate Deploy ADaiDelegate aDAIDelegate"
      `,
      "Deploy",
      [new Arg("aTokenDelegateParams", getEventV, { variadic: true })],
      (world, from, { aTokenDelegateParams }) => genATokenDelegate(world, from, aTokenDelegateParams.val)
    ),
    new View<{ aTokenDelegateArg: StringA, apiKey: StringA }>(`
        #### Verify

        * "ATokenDelegate <aTokenDelegate> Verify apiKey:<String>" - Verifies ATokenDelegate in BscScan
          * E.g. "ATokenDelegate aDaiDelegate Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("aTokenDelegateArg", getStringA),
        new Arg("apiKey", getStringA)
      ],
      async (world, { aTokenDelegateArg, apiKey }) => {
        let [aToken, name, data] = await getATokenDelegateData(world, aTokenDelegateArg.val);

        return await verifyATokenDelegate(world, aToken, name, data.get('contract')!, apiKey.val);
      },
      { namePos: 1 }
    ),
  ];
}

export async function processATokenDelegateEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("ATokenDelegate", aTokenDelegateCommands(), world, event, from);
}
