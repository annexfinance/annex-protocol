import { Event } from '../Event';
import { World, addAction } from '../World';
import { XAI, XAIScenario } from '../Contract/XAI';
import { Invokation } from '../Invokation';
import { getAddressA } from '../CoreValue';
import { StringA, AddressA } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const XAIContract = getContract('XAI');
const XAIScenarioContract = getContract('XAIScenario');

export interface TokenData {
  invokation: Invokation<XAI>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildXAI(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; xai: XAI; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressA }, TokenData>(
      `
      #### Scenario

      * "XAI Deploy Scenario account:<Address>" - Deploys Scenario XAI Token
        * E.g. "XAI Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressA),
      ],
      async (world, { account }) => {
        return {
          invokation: await XAIScenarioContract.deploy<XAIScenario>(world, from, [account.val]),
          contract: 'XAIScenario',
          symbol: 'XAI',
          name: 'XAI Stablecoin',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressA }, TokenData>(
      `
      #### XAI

      * "XAI Deploy account:<Address>" - Deploys XAI Token
        * E.g. "XAI Deploy Geoff"
    `,
      'XAI',
      [
        new Arg("account", getAddressA),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await XAIScenarioContract.deploy<XAIScenario>(world, from, [account.val]),
            contract: 'XAIScenario',
            symbol: 'XAI',
            name: 'XAI Stablecoin',
            decimals: 18
          };
        } else {
          return {
            invokation: await XAIContract.deploy<XAI>(world, from, [account.val]),
            contract: 'XAI',
            symbol: 'XAI',
            name: 'XAI Stablecoin',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployXAI", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const xai = invokation.value!;
  tokenData.address = xai._address;

  world = await storeAndSaveContract(
    world,
    xai,
    'XAI',
    invokation,
    [
      { index: ['XAI'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, xai, tokenData };
}
