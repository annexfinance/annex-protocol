import {Event} from '../Event';
import {addAction, World} from '../World';
import {PriceOracle} from '../Contract/PriceOracle';
import {buildPriceOracle, setPriceOracle} from '../Builder/PriceOracleBuilder';
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
import {getPriceOracle} from '../ContractLookup';
import {verify} from '../Verify';
import {encodedNumber} from '../Encoding';

async function genPriceOracle(world: World, from: string, params: Event): Promise<World> {
  let {world: nextWorld, priceOracle, priceOracleData} = await buildPriceOracle(world, from, params);
  world = nextWorld;

  world = addAction(
    world,
    `Deployed PriceOracle (${priceOracleData.description}) to address ${priceOracle._address}`,
    priceOracleData.invokation!
  );

  return world;
}

async function setPriceOracleFn(world: World, params: Event): Promise<World> {
  let {world: nextWorld, priceOracle, priceOracleData} = await setPriceOracle(world, params);

  return nextWorld;
}

async function setPrice(world: World, from: string, priceOracle: PriceOracle, aToken: string, amount: NumberA): Promise<World> {
  return addAction(
    world,
    `Set price oracle price for ${aToken} to ${amount.show()}`,
    await invoke(world, priceOracle.methods.setUnderlyingPrice(aToken, amount.encode()), from)
  );
}

async function setDirectPrice(world: World, from: string, priceOracle: PriceOracle, address: string, amount: NumberA): Promise<World> {
  return addAction(
    world,
    `Set price oracle price for ${address} to ${amount.show()}`,
    await invoke(world, priceOracle.methods.setDirectPrice(address, amount.encode()), from)
  );
}

async function verifyPriceOracle(world: World, priceOracle: PriceOracle, apiKey: string, contractName: string): Promise<World> {
  if (world.isLocalNetwork()) {
    world.printer.printLine(`Politely declining to verify on local network: ${world.network}.`);
  } else {
    await verify(world, apiKey, "PriceOracle", contractName, priceOracle._address);
  }

  return world;
}

export function priceOracleCommands() {
  return [
    new Command<{params: EventV}>(`
        #### Deploy

        * "Deploy ...params" - Generates a new price oracle
          * E.g. "PriceOracle Deploy Fixed 1.0"
          * E.g. "PriceOracle Deploy Simple"
          * E.g. "PriceOracle Deploy NotPriceOracle"
      `,
      "Deploy",
      [
        new Arg("params", getEventV, {variadic: true})
      ],
      (world, from, {params}) => genPriceOracle(world, from, params.val)
    ),
    new Command<{params: EventV}>(`
        #### Set

        * "Set ...params" - Sets the price oracle to given deployed contract
          * E.g. "PriceOracle Set Standard \"0x...\" \"My Already Deployed Oracle\""
      `,
      "Set",
      [
        new Arg("params", getEventV, {variadic: true})
      ],
      (world, from, {params}) => setPriceOracleFn(world, params.val)
    ),

    new Command<{priceOracle: PriceOracle, aToken: AddressA, amount: NumberA}>(`
        #### SetPrice

        * "SetPrice <AToken> <Amount>" - Sets the per-bnb price for the given aToken
          * E.g. "PriceOracle SetPrice aZRX 1.0"
      `,
      "SetPrice",
      [
        new Arg("priceOracle", getPriceOracle, {implicit: true}),
        new Arg("aToken", getAddressA),
        new Arg("amount", getExpNumberA)
      ],
      (world, from, {priceOracle, aToken, amount}) => setPrice(world, from, priceOracle, aToken.val, amount)
    ),

    new Command<{priceOracle: PriceOracle, address: AddressA, amount: NumberA}>(`
        #### SetDirectPrice

        * "SetDirectPrice <Address> <Amount>" - Sets the per-bnb price for the given aToken
          * E.g. "PriceOracle SetDirectPrice (Address Zero) 1.0"
      `,
      "SetDirectPrice",
      [
        new Arg("priceOracle", getPriceOracle, {implicit: true}),
        new Arg("address", getAddressA),
        new Arg("amount", getExpNumberA)
      ],
      (world, from, {priceOracle, address, amount}) => setDirectPrice(world, from, priceOracle, address.val, amount)
    ),

    new View<{priceOracle: PriceOracle, apiKey: StringA, contractName: StringA}>(`
        #### Verify

        * "Verify apiKey:<String> contractName:<String>=PriceOracle" - Verifies PriceOracle in BscScan
          * E.g. "PriceOracle Verify "myApiKey"
      `,
      "Verify",
      [
        new Arg("priceOracle", getPriceOracle, {implicit: true}),
        new Arg("apiKey", getStringA),
        new Arg("contractName", getStringA, {default: new StringA("PriceOracle")})
      ],
      (world, {priceOracle, apiKey, contractName}) => verifyPriceOracle(world, priceOracle, apiKey.val, contractName.val)
    )
  ];
}

export async function processPriceOracleEvent(world: World, event: Event, from: string | null): Promise<World> {
  return await processCommandEvent<any>("PriceOracle", priceOracleCommands(), world, event, from);
}
