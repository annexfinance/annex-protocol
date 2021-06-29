import {Event} from '../Event';
import {addAction, World} from '../World';
import {PriceOracleProxy} from '../Contract/PriceOracleProxy';
import {buildPriceOracleProxy} from '../Builder/PriceOracleProxyBuilder';
import {invoke} from '../Invokation';
import {
  getAddressA,
  getEventV,
  getExpNumberA,
  getStringA
} from '../CoreValue';
import {
  AddressA,
  EventV,
  NumberA,
  StringA
} from '../Value';
import {Arg, Command, processCommandEvent, View} from '../Command';
import {getPriceOracleProxy} from '../ContractLookup';
import {verify} from '../Verify';
import {encodedNumber} from '../Encoding';

async function genPriceOracleProxy(world: World, from: string, params: Event): Promise<World> {
  let priceOracleProxy;
  let invokation;

  ({world, priceOracleProxy, invokation} = await buildPriceOracleProxy(world, from, params));

  world = addAction(
    world,
    `Deployed PriceOracleProxy to address ${priceOracleProxy._address}`,
    invokation
  );

  return world;
}

async function verifyPriceOracleProxy(world: World, priceOracleProxy: PriceOracleProxy, apiKey: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, "PriceOracleProxy", contractName, priceOracleProxy._address);
  }

  return world;
}

async function setSaiPrice(world: World, from: string, priceOracleProxy: PriceOracleProxy, amount: NumberA): Promise<World> {
  return addAction(
    world,
    `Set price oracle SAI price to ${amount.show()}`,
    await invoke(world, priceOracleProxy.methods.setSaiPrice(amount.encode()), from)
  );
}

export function priceOracleProxyCommands() {
  return [
    new Command<{params: EventV}>(`
        #### Deploy

        * "Deploy ...params" - Generates a new price oracle proxy
          * E.g. "PriceOracleProxy Deploy (Unitroller Address) (PriceOracle Address) (aBnb Address)"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, {variadic: true})
      ],
      (world, from, {params}) => genPriceOracleProxy(world, from, params.val)
    ),

    new View<{priceOracleProxy: PriceOracleProxy, apiKey: StringA, contractName: StringA}>(`
        #### Verify

        * "Verify apiKey:<String> contractName:<String>=PriceOracleProxy" - Verifies PriceOracleProxy in BscScan
          * E.g. "PriceOracleProxy Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("priceOracleProxy", getPriceOracleProxy, {implicit: true}),
        new Arg("apiKey", getStringA),
        new Arg("contractName", getStringA, {default: new StringA("PriceOracleProxy")})
      ],
      (world, {priceOracleProxy, apiKey, contractName}) => verifyPriceOracleProxy(world, priceOracleProxy, apiKey.val, contractName.val)
    ),

    new Command<{priceOracleProxy: PriceOracleProxy, amount: NumberA}>(`
        #### SetSaiPrice

        * "SetSaiPrice <Amount>" - Sets the per-bnb price for SAI
          * E.g. "PriceOracleProxy SetSaiPrice 1.0"
      `,
      "SetSaiPrice",
      [
        new Arg("priceOracleProxy", getPriceOracleProxy, {implicit: true}),
        new Arg("amount", getExpNumberA)
      ],
      (world, from, {priceOracleProxy, amount}) => setSaiPrice(world, from, priceOracleProxy, amount)
    )
  ];
}

export async function processPriceOracleProxyEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("PriceOracleProxy", priceOracleProxyCommands(), world, event, from);
}
