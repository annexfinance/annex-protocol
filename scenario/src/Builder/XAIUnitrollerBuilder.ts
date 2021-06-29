import {Event} from '../Event';
import {addAction, World} from '../World';
import {XAIUnitroller} from '../Contract/XAIUnitroller';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';

const XAIUnitrollerContract = getContract("XAIUnitroller");

export interface XAIUnitrollerData {
  invokation: Invokation<XAIUnitroller>,
  description: string,
  address?: string
}

export async function buildXAIUnitroller(world: World, from: string, event: Event): Promise<{world: World, xaiunitroller: XAIUnitroller, xaiunitrollerData: XAIUnitrollerData}> {
  const fetchers = [
    new Fetcher<{}, XAIUnitrollerData>(`
        #### XAIUnitroller

        * "" - The Upgradable Comptroller
          * E.g. "XAIUnitroller Deploy"
      `,
      "XAIUnitroller",
      [],
      async (world, {}) => {
        return {
          invokation: await XAIUnitrollerContract.deploy<XAIUnitroller>(world, from, []),
          description: "XAIUnitroller"
        };
      },
      {catchall: true}
    )
  ];

  let xaiunitrollerData = await getFetcherValue<any, XAIUnitrollerData>("DeployXAIUnitroller", fetchers, world, event);
  let invokation = xaiunitrollerData.invokation;
  delete xaiunitrollerData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const xaiunitroller = invokation.value!;
  xaiunitrollerData.address = xaiunitroller._address;

  world = await storeAndSaveContract(
    world,
    xaiunitroller,
    'XAIUnitroller',
    invokation,
    [
      { index: ['XAIUnitroller'], data: xaiunitrollerData }
    ]
  );

  return {world, xaiunitroller, xaiunitrollerData};
}
