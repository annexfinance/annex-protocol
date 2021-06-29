import { Event } from '../Event';
import { addAction, World } from '../World';
import { XAIControllerImpl } from '../Contract/XAIControllerImpl';
import { Invokation, invoke } from '../Invokation';
import { getAddressA, getExpNumberA, getNumberA, getStringA } from '../CoreValue';
import { AddressA, NumberA, StringA } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract, getTestContract } from '../Contract';

const XAIControllerScenarioContract = getTestContract('XAIControllerScenario');
const XAIControllerContract = getContract('XAIController');

const XAIControllerBorkedContract = getTestContract('XAIControllerBorked');

export interface XAIControllerImplData {
  invokation: Invokation<XAIControllerImpl>;
  name: string;
  contract: string;
  description: string;
}

export async function buildXAIControllerImpl(
  world: World,
  from: string,
  event: Event
): Promise<{ world: World; xaicontrollerImpl: XAIControllerImpl; xaicontrollerImplData: XAIControllerImplData }> {
  const fetchers = [

    new Fetcher<{ name: StringA }, XAIControllerImplData>(
      `
        #### Scenario

        * "Scenario name:<String>" - The XAIController Scenario for local testing
          * E.g. "XAIControllerImpl Deploy Scenario MyScen"
      `,
      'Scenario',
      [new Arg('name', getStringA)],
      async (world, { name }) => ({
        invokation: await XAIControllerScenarioContract.deploy<XAIControllerImpl>(world, from, []),
        name: name.val,
        contract: 'XAIControllerScenario',
        description: 'Scenario XAIController Impl'
      })
    ),

    new Fetcher<{ name: StringA }, XAIControllerImplData>(
      `
        #### Standard

        * "Standard name:<String>" - The standard XAIController contract
          * E.g. "XAIControllerImpl Deploy Standard MyStandard"
      `,
      'Standard',
      [new Arg('name', getStringA)],
      async (world, { name }) => {
        return {
          invokation: await XAIControllerContract.deploy<XAIControllerImpl>(world, from, []),
          name: name.val,
          contract: 'XAIController',
          description: 'Standard XAIController Impl'
        };
      }
    ),

    new Fetcher<{ name: StringA }, XAIControllerImplData>(
      `
        #### Borked

        * "Borked name:<String>" - A Borked XAIController for testing
          * E.g. "XAIControllerImpl Deploy Borked MyBork"
      `,
      'Borked',
      [new Arg('name', getStringA)],
      async (world, { name }) => ({
        invokation: await XAIControllerBorkedContract.deploy<XAIControllerImpl>(world, from, []),
        name: name.val,
        contract: 'XAIControllerBorked',
        description: 'Borked XAIController Impl'
      })
    ),
    new Fetcher<{ name: StringA }, XAIControllerImplData>(
      `
        #### Default

        * "name:<String>" - The standard XAIController contract
          * E.g. "XAIControllerImpl Deploy MyDefault"
      `,
      'Default',
      [new Arg('name', getStringA)],
      async (world, { name }) => {
        if (world.isLocalNetwork()) {
          // Note: we're going to use the scenario contract as the standard deployment on local networks
          return {
            invokation: await XAIControllerScenarioContract.deploy<XAIControllerImpl>(world, from, []),
            name: name.val,
            contract: 'XAIControllerScenario',
            description: 'Scenario XAIController Impl'
          };
        } else {
          return {
            invokation: await XAIControllerContract.deploy<XAIControllerImpl>(world, from, []),
            name: name.val,
            contract: 'XAIController',
            description: 'Standard XAIController Impl'
          };
        }
      },
      { catchall: true }
    )
  ];

  let xaicontrollerImplData = await getFetcherValue<any, XAIControllerImplData>(
    'DeployXAIControllerImpl',
    fetchers,
    world,
    event
  );
  let invokation = xaicontrollerImplData.invokation;
  delete xaicontrollerImplData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const xaicontrollerImpl = invokation.value!;

  world = await storeAndSaveContract(world, xaicontrollerImpl, xaicontrollerImplData.name, invokation, [
    {
      index: ['XAIController', xaicontrollerImplData.name],
      data: {
        address: xaicontrollerImpl._address,
        contract: xaicontrollerImplData.contract,
        description: xaicontrollerImplData.description
      }
    }
  ]);

  return { world, xaicontrollerImpl, xaicontrollerImplData };
}
