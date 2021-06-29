import { Event } from '../Event';
import { World, addAction } from '../World';
import { ANN, ANNScenario } from '../Contract/ANN';
import { Invokation } from '../Invokation';
import { getAddressA } from '../CoreValue';
import { StringA, AddressA } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { storeAndSaveContract } from '../Networks';
import { getContract } from '../Contract';

const ANNContract = getContract('ANN');
const ANNScenarioContract = getContract('ANNScenario');

export interface TokenData {
  invokation: Invokation<ANN>;
  contract: string;
  address?: string;
  symbol: string;
  name: string;
  decimals?: number;
}

export async function buildANN(
  world: World,
  from: string,
  params: Event
): Promise<{ world: World; ann: ANN; tokenData: TokenData }> {
  const fetchers = [
    new Fetcher<{ account: AddressA }, TokenData>(
      `
      #### Scenario

      * "ANN Deploy Scenario account:<Address>" - Deploys Scenario ANN Token
        * E.g. "ANN Deploy Scenario Geoff"
    `,
      'Scenario',
      [
        new Arg("account", getAddressA),
      ],
      async (world, { account }) => {
        return {
          invokation: await ANNScenarioContract.deploy<ANNScenario>(world, from, [account.val]),
          contract: 'ANNScenario',
          symbol: 'ANN',
          name: 'Annex Governance Token',
          decimals: 18
        };
      }
    ),

    new Fetcher<{ account: AddressA }, TokenData>(
      `
      #### ANN

      * "ANN Deploy account:<Address>" - Deploys ANN Token
        * E.g. "ANN Deploy Geoff"
    `,
      'ANN',
      [
        new Arg("account", getAddressA),
      ],
      async (world, { account }) => {
        if (world.isLocalNetwork()) {
          return {
            invokation: await ANNScenarioContract.deploy<ANNScenario>(world, from, [account.val]),
            contract: 'ANNScenario',
            symbol: 'ANN',
            name: 'Annex Governance Token',
            decimals: 18
          };
        } else {
          return {
            invokation: await ANNContract.deploy<ANN>(world, from, [account.val]),
            contract: 'ANN',
            symbol: 'ANN',
            name: 'Annex Governance Token',
            decimals: 18
          };
        }
      },
      { catchall: true }
    )
  ];

  let tokenData = await getFetcherValue<any, TokenData>("DeployANN", fetchers, world, params);
  let invokation = tokenData.invokation;
  delete tokenData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }

  const ann = invokation.value!;
  tokenData.address = ann._address;

  world = await storeAndSaveContract(
    world,
    ann,
    'ANN',
    invokation,
    [
      { index: ['ANN'], data: tokenData },
      { index: ['Tokens', tokenData.symbol], data: tokenData }
    ]
  );

  tokenData.invokation = invokation;

  return { world, ann, tokenData };
}
