import {Event} from '../Event';
import {addAction, World} from '../World';
import {Maximillion} from '../Contract/Maximillion';
import {Invokation} from '../Invokation';
import {Arg, Fetcher, getFetcherValue} from '../Command';
import {storeAndSaveContract} from '../Networks';
import {getContract} from '../Contract';
import {getAddressA} from '../CoreValue';
import {AddressA} from '../Value';

const MaximillionContract = getContract("Maximillion");

export interface MaximillionData {
  invokation: Invokation<Maximillion>,
  description: string,
  aBnbAddress: string,
  address?: string
}

export async function buildMaximillion(world: World, from: string, event: Event): Promise<{world: World, maximillion: Maximillion, maximillionData: MaximillionData}> {
  const fetchers = [
    new Fetcher<{aBnb: AddressA}, MaximillionData>(`
        #### Maximillion

        * "" - Maximum Bnb Repays Contract
          * E.g. "Maximillion Deploy"
      `,
      "Maximillion",
      [
        new Arg("aBnb", getAddressA)
      ],
      async (world, {aBnb}) => {
        return {
          invokation: await MaximillionContract.deploy<Maximillion>(world, from, [aBnb.val]),
          description: "Maximillion",
          aBnbAddress: aBnb.val
        };
      },
      {catchall: true}
    )
  ];

  let maximillionData = await getFetcherValue<any, MaximillionData>("DeployMaximillion", fetchers, world, event);
  let invokation = maximillionData.invokation;
  delete maximillionData.invokation;

  if (invokation.error) {
    throw invokation.error;
  }
  const maximillion = invokation.value!;
  maximillionData.address = maximillion._address;

  world = await storeAndSaveContract(
    world,
    maximillion,
    'Maximillion',
    invokation,
    [
      { index: ['Maximillion'], data: maximillionData }
    ]
  );

  return {world, maximillion, maximillionData};
}
