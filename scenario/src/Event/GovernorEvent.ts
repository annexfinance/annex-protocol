import { Event } from '../Event';
import { addAction, World } from '../World';
import { Governor } from '../Contract/Governor';
import { buildGovernor } from '../Builder/GovernorBuilder';
import { invoke } from '../Invokation';
import {
  getAddressA,
  getArrayV,
  getEventV,
  getNumberA,
  getStringA,
  getCoreValue,
} from '../CoreValue';
import {
  AddressA,
  ArrayV,
  EventV,
  NumberA,
  StringA
} from '../Value';
import { Arg, Command, processCommandEvent, View } from '../Command';
import { getGovernorData } from '../ContractLookup';
import { verify } from '../Verify';
import { encodedNumber } from '../Encoding';
import { processProposalEvent } from './ProposalEvent';
import { processGuardianEvent } from './GovGuardianEvent';
import { encodeParameters, rawValues } from '../Utils';
import { getGovernorV } from '../Value/GovernorValue';

async function genGovernor(world: World, from: string, params: Event): Promise<World> {
  let { world: nextWorld, governor, govData } = await buildGovernor(world, from, params);
  world = nextWorld;

  return addAction(
    world,
    `Deployed Governor ${govData.contract} to address ${governor._address}`,
    govData.invokation
  );
}

async function verifyGovernor(world: World, governor: Governor, apiKey: string, modelName: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, modelName, contractName, governor._address);
  }

  return world;
}

async function propose(world: World, from: string, governor: Governor, targets: string[], values: encodedNumber[], signatures: string[], calldatas: string[], description: string): Promise<World> {
  const invokation = await invoke(world, governor.methods.propose(targets, values, signatures, calldatas, description), from);
  return addAction(
    world,
    `Created new proposal "${description}" with id=${invokation.value} in Governor`,
    invokation
  );
}

async function setBlockNumber(
  world: World,
  from: string,
  governor: Governor,
  blockNumber: NumberA
): Promise<World> {
  return addAction(
    world,
    `Set Governor blockNumber to ${blockNumber.show()}`,
    await invoke(world, governor.methods.setBlockNumber(blockNumber.encode()), from)
  );
}

async function setBlockTimestamp(
  world: World,
  from: string,
  governor: Governor,
  blockTimestamp: NumberA
): Promise<World> {
  return addAction(
    world,
    `Set Governor blockTimestamp to ${blockTimestamp.show()}`,
    await invoke(world, governor.methods.setBlockTimestamp(blockTimestamp.encode()), from)
  );
}

export function governorCommands() {
  return [
    new Command<{ params: EventV }>(`
        #### Deploy

        * "Deploy ...params" - Generates a new Governor
          * E.g. "Governor Deploy Alpha"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { params }) => genGovernor(world, from, params.val)
    ),

    new View<{ governorArg: StringA, apiKey: StringA }>(`
        #### Verify

        * "<Governor> Verify apiKey:<String>" - Verifies Governor in BscScan
          * E.g. "Governor Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("governorArg", getStringA),
        new Arg("apiKey", getStringA)
      ],
      async (world, { governorArg, apiKey }) => {
        let [governor, name, data] = await getGovernorData(world, governorArg.val);

        return await verifyGovernor(world, governor, apiKey.val, name, data.get('contract')!)
      },
      { namePos: 1 }
    ),

    new Command<{ governor: Governor, description: StringA, targets: ArrayV<AddressA>, values: ArrayV<NumberA>, signatures: ArrayV<StringA>, callDataArgs: ArrayV<ArrayV<StringA>> }>(`
        #### Propose

        * "Governor <Governor> Propose description:<String> targets:<List> signatures:<List> callDataArgs:<List>" - Creates a new proposal in Governor
          * E.g. "Governor GovernorScenario Propose "New Interest Rate" [(Address aDAI)] [0] [("_setInterestRateModel(address)")] [[(Address MyInterestRateModel)]]
      `,
      "Propose",
      [
        new Arg("governor", getGovernorV),
        new Arg("description", getStringA),
        new Arg("targets", getArrayV(getAddressA)),
        new Arg("values", getArrayV(getNumberA)),
        new Arg("signatures", getArrayV(getStringA)),
        new Arg("callDataArgs", getArrayV(getArrayV(getCoreValue))),
      ],
      async (world, from, { governor, description, targets, values, signatures, callDataArgs }) => {
        const targetsU = targets.val.map(a => a.val);
        const valuesU = values.val.map(a => a.encode());
        const signaturesU = signatures.val.map(a => a.val);
        const callDatasU: string[] = signatures.val.reduce((acc, cur, idx) => {
          const args = rawValues(callDataArgs.val[idx]);
          acc.push(encodeParameters(world, cur.val, args));
          return acc;
        }, <string[]>[]);
        return await propose(world, from, governor, targetsU, valuesU, signaturesU, callDatasU, description.val);
      },
      { namePos: 1 }
    ),
    new Command<{ governor: Governor, params: EventV }>(`
        #### Proposal

        * "Governor <Governor> Proposal <...proposalEvent>" - Returns information about a proposal
          * E.g. "Governor GovernorScenario Proposal LastProposal Vote For"
      `,
      "Proposal",
      [
        new Arg('governor', getGovernorV),
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { governor, params }) => processProposalEvent(world, governor, params.val, from),
      { namePos: 1 }
    ),
    new Command<{ governor: Governor, params: EventV }>(`
        #### Guardian

        * "Governor <Governor> Guardian <...guardianEvent>" - Returns information about a guardian
          * E.g. "Governor GovernorScenario Guardian Abdicate"
      `,
      "Guardian",
      [
        new Arg('governor', getGovernorV),
        new Arg("params", getEventV, { variadic: true })
      ],
      (world, from, { governor, params }) => processGuardianEvent(world, governor, params.val, from),
      { namePos: 1 }
    ),
    new Command<{ governor: Governor, blockNumber: NumberA }>(`
        #### SetBlockNumber

        * "Governor <Governor> SetBlockNumber <Seconds>" - Sets the blockNumber of the Governance Harness
        * E.g. "Governor SetBlockNumber 500"
    `,
      'SetBlockNumber',
      [
        new Arg('governor', getGovernorV),
        new Arg('blockNumber', getNumberA)
      ],
      (world, from, { governor, blockNumber }) => setBlockNumber(world, from, governor, blockNumber),
      { namePos: 1 }
    ),
    new Command<{ governor: Governor, blockTimestamp: NumberA }>(`
        #### SetBlockTimestamp

        * "Governor <Governor> SetBlockNumber <Seconds>" - Sets the blockTimestamp of the Governance Harness
        * E.g. "Governor GovernorScenario SetBlockTimestamp 500"
    `,
      'SetBlockTimestamp',
      [
        new Arg('governor', getGovernorV),
        new Arg('blockTimestamp', getNumberA)
      ],
      (world, from, { governor, blockTimestamp }) => setBlockTimestamp(world, from, governor, blockTimestamp),
      { namePos: 1 }
    )
  ];
}

export async function processGovernorEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("Governor", governorCommands(), world, event, from);
}
