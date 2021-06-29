import { Event } from './Event';
import { World } from './World';
import {
  AddressA,
  AnythingV,
  ArrayV,
  BoolA,
  EventV,
  ExpNumberA,
  ListV,
  MapV,
  NothingA,
  NumberA,
  PercentV,
  PreciseV,
  StringA,
  Value
} from './Value';
import { Arg, Fetcher, getFetcherValue } from './Command';
import { getUserValue, userFetchers } from './Value/UserValue';
import { comptrollerFetchers, getComptrollerValue } from './Value/ComptrollerValue';
import { comptrollerImplFetchers, getComptrollerImplValue } from './Value/ComptrollerImplValue';
import { xaicontrollerFetchers, getXAIControllerValue } from './Value/XAIControllerValue';
import { xaicontrollerImplFetchers, getXAIControllerImplValue } from './Value/XAIControllerImplValue';
import { getUnitrollerValue, unitrollerFetchers } from './Value/UnitrollerValue';
import { aTokenFetchers, getATokenValue } from './Value/ATokenValue';
import { aTokenDelegateFetchers, getATokenDelegateValue } from './Value/ATokenDelegateValue';
import { bep20Fetchers, getBep20Value } from './Value/Bep20Value';
import { mcdFetchers, getMCDValue } from './Value/MCDValue';
import { getInterestRateModelValue, interestRateModelFetchers } from './Value/InterestRateModelValue';
import { getPriceOracleValue, priceOracleFetchers } from './Value/PriceOracleValue';
import { getPriceOracleProxyValue, priceOracleProxyFetchers } from './Value/PriceOracleProxyValue';
import { getTimelockValue, timelockFetchers, getTimelockAddress } from './Value/TimelockValue';
import { getMaximillionValue, maximillionFetchers } from './Value/MaximillionValue';
import { getANNValue, annFetchers } from './Value/ANNValue';
import { getXAIValue, xaiFetchers } from './Value/XAIValue';
import { getGovernorValue, governorFetchers } from './Value/GovernorValue';
import { getAddress } from './ContractLookup';
import { getCurrentBlockNumber, getCurrentTimestamp, mustArray, sendRPC } from './Utils';
import { toEncodableNum } from './Encoding';
import { BigNumber } from 'bignumber.js';
import { buildContractFetcher } from './EventBuilder';

import {
  padLeft,
  sha3,
  toBN,
  toDecimal,
  toHex
} from 'web3-utils';

const expMantissa = new BigNumber('1000000000000000000');

function getSigFigs(value) {
  let str = value.toString();

  str = str.replace(/e\d+/, ''); // Remove e01
  str = str.replace(/\./, ''); // Remove decimal point

  return str.length;
}

export async function getEventV(world: World, event: Event): Promise<EventV> {
  return new EventV(event);
}

// TODO: We may want to handle simple values -> complex values at the parser level
//       This is currently trying to parse simple values as simple or complex values,
//       and this is because items like `Some` could work either way.
export async function mapValue<T>(
  world: World,
  event: Event,
  simple: (string) => T,
  complex: (World, Event) => Promise<Value>,
  type: any
): Promise<T> {
  let simpleErr;
  let val;

  if (typeof event === 'string') {
    try {
      return simple(<string>event);
    } catch (err) {
      // Collect the error, but fallback to a complex expression
      simpleErr = err;
    }
  }

  try {
    val = await complex(world, event);
  } catch (complexErr) {
    // If we had an error before and this was the fallback, now throw that one
    if (simpleErr) {
      throw simpleErr;
    } else {
      throw complexErr;
    }
  }

  if (!(val instanceof type)) {
    throw new Error(`Expected "${type.name}" from event "${event.toString()}", was: "${val.toString()}"`);
  }

  // We just did a typecheck above...
  return <T>(<unknown>val);
}

export async function getBoolA(world: World, event: Event): Promise<BoolA> {
  return mapValue<BoolA>(
    world,
    event,
    str => {
      const lower = str.trim().toLowerCase();

      if (lower == 'true' || lower == 't' || lower == '1') {
        return new BoolA(true);
      } else {
        return new BoolA(false);
      }
    },
    getCoreValue,
    BoolA
  );
}

export async function getAddressA(world: World, event: Event): Promise<AddressA> {
  return mapValue<AddressA>(
    world,
    event,
    str => new AddressA(getAddress(world, str)),
    async (currWorld, val) => {
      const coreVal = await getCoreValue(currWorld, val);

      if (coreVal instanceof StringA) {
        return new AddressA(coreVal.val);
      } else {
        return coreVal;
      }
    },
    AddressA
  );
}

function strToNumberA(str: string): NumberA {
  if (isNaN(Number(str))) {
    throw 'not a number';
  }

  return new NumberA(str);
}

function strToExpNumberA(str: string): NumberA {
  const r = new BigNumber(str);

  return new NumberA(r.multipliedBy(expMantissa).toFixed());
}

export async function getNumberA(world: World, event: Event): Promise<NumberA> {
  return mapValue<NumberA>(world, event, strToNumberA, getCoreValue, NumberA);
}

export async function getExpNumberA(world: World, event: Event): Promise<NumberA> {
  let res = await mapValue<NumberA>(world, event, strToNumberA, getCoreValue, NumberA);

  const r = new BigNumber(res.val);

  return new ExpNumberA(r.multipliedBy(expMantissa).toFixed());
}

export async function getPercentV(world: World, event: Event): Promise<NumberA> {
  let res = await getExpNumberA(world, event);

  return new PercentV(res.val);
}

// Note: MapV does not currently parse its contents
export async function getMapV(world: World, event: Event): Promise<MapV> {
  const res: object = {};

  await Promise.all(
    mustArray(event).map(async e => {
      if (Array.isArray(e) && e.length === 2 && typeof e[0] === 'string') {
        const [key, valueEvent] = e;
        let value;
        if (typeof valueEvent === 'string') {
          value = new StringA(valueEvent);
        } else {
          value = await getCoreValue(world, <Event>valueEvent);
        }

        res[key] = value;
      } else {
        throw new Error(`Expected all string pairs for MapV from ${event.toString()}, got: ${e.toString()}`);
      }
    })
  );

  return new MapV(res);
}

export function getArrayV<T extends Value>(fetcher: (World, Event) => Promise<T>): (World, Event) => Promise<ArrayV<T>> {
  return async (world: World, event: Event): Promise<ArrayV<T>> => {
    const res = await Promise.all(
      mustArray(event).filter((x) => x !== 'List').map(e => fetcher(world, e))
    );
    return new ArrayV(res);
  }
}

export async function getStringA(world: World, event: Event): Promise<StringA> {
  return mapValue<StringA>(world, event, str => new StringA(str), getCoreValue, StringA);
}

async function getBNBBalance(world: World, address: string): Promise<NumberA> {
  let balance = await world.web3.eth.getBalance(address);

  return new NumberA(balance);
}

const fetchers = [
  new Fetcher<{}, BoolA>(
    `
      #### True

      * "True" - Returns true
    `,
    'True',
    [],
    async (world, {}) => new BoolA(true)
  ),

  new Fetcher<{}, BoolA>(
    `
      #### False

      * "False" - Returns false
    `,
    'False',
    [],
    async (world, {}) => new BoolA(false)
  ),

  new Fetcher<{}, NumberA>(
    `
      #### Zero

      * "Zero" - Returns 0
    `,
    'Zero',
    [],
    async (world, {}) => strToNumberA('0')
  ),

  new Fetcher<{}, NumberA>(
    `
      #### UInt96Max

      * "UInt96Max" - Returns 2^96 - 1
    `,
    'UInt96Max',
    [],
    async (world, {}) =>
      new NumberA('79228162514264337593543950335')
  ),

  new Fetcher<{}, NumberA>(
    `
      #### UInt256Max

      * "UInt256Max" - Returns 2^256 - 1
    `,
    'UInt256Max',
    [],
    async (world, {}) =>
      new NumberA('115792089237316195423570985008687907853269984665640564039457584007913129639935')
  ),

  new Fetcher<{}, NumberA>(
    `
      #### Some

      * "Some" - Returns 100e18
    `,
    'Some',
    [],
    async (world, {}) => strToNumberA('100e18')
  ),

  new Fetcher<{}, NumberA>(
    `
      #### Little

      * "Little" - Returns 100e10
    `,
    'Little',
    [],
    async (world, {}) => strToNumberA('100e10')
  ),

  new Fetcher<{ amt: EventV }, NumberA>(
    `
      #### Exactly

      * "Exactly <Amount>" - Returns a strict numerical value
        * E.g. "Exactly 5.0"
    `,
    'Exactly',
    [new Arg('amt', getEventV)],
    async (world, { amt }) => getNumberA(world, amt.val)
    ),

  new Fetcher<{ hexVal: EventV }, StringA>(
    `
      #### Hex

      * "Hex <HexVal>" - Returns a byte string with given hex value
        * E.g. "Hex \"0xffff\""
    `,
    'Hex',
    [new Arg('hexVal', getEventV)],
    async (world, { hexVal }) => getStringA(world, hexVal.val)
  ),

  new Fetcher<{ str: EventV }, StringA>(
    `
      #### String

      * "String <Str>" - Returns a string literal
        * E.g. "String MyString"
    `,
    'String',
    [new Arg('str', getEventV)],
    async (world, { str }) => getStringA(world, str.val)
  ),

  new Fetcher<{ amt: EventV }, NumberA>(
    `
      #### Exp

      * "Exp <Amount>" - Returns the mantissa for a given exp
        * E.g. "Exp 5.5"
    `,
    'Exp',
    [new Arg('amt', getEventV)],
    async (world, { amt }) => getExpNumberA(world, amt.val)
  ),

  new Fetcher<{ amt: EventV }, NumberA>(
    `
      #### Neg

      * "Neg <Amount>" - Returns the amount subtracted from zero
        * E.g. "Neg amount"
    `,
    'Neg',
    [new Arg('amt', getEventV)],
    async (world, { amt }) => new NumberA(0).sub(await getNumberA(world, amt.val))
  ),

  new Fetcher<{ amt: StringA }, PreciseV>(
    `
      #### Precisely

      * "Precisely <Amount>" - Matches a number to given number of significant figures
        * E.g. "Precisely 5.1000" - Matches to 5 sig figs
    `,
    'Precisely',
    [new Arg('amt', getStringA)],
    async (world, { amt }) => new PreciseV(toEncodableNum(amt.val), getSigFigs(amt.val))
  ),

  new Fetcher<{}, AnythingV>(
    `
      #### Anything

      * "Anything" - Matches any value for assertions
    `,
    'Anything',
    [],
    async (world, {}) => new AnythingV()
  ),

  new Fetcher<{}, NothingA>(
    `
      #### Nothing

      * "Nothing" - Matches no values and is nothing.
    `,
    'Nothing',
    [],
    async (world, {}) => new NothingA()
  ),

  new Fetcher<{ addr: AddressA }, AddressA>(
    `
      #### Address

      * "Address arg:<Address>" - Returns an address
    `,
    'Address',
    [new Arg('addr', getAddressA)],
    async (world, { addr }) => addr
  ),

  new Fetcher<
    { addr: AddressA; slot: NumberA; start: NumberA; valType: StringA },
    BoolA | AddressA | ExpNumberA | NothingA
  >(
    `
    #### StorageAt

    * "StorageAt addr:<Address> slot:<Number> start:<Number>, valType:<VToCastTo>" - Returns bytes at storage slot
    `,
    'StorageAt',
    [
      new Arg('addr', getAddressA),
      new Arg('slot', getNumberA),
      new Arg('start', getNumberA),
      new Arg('valType', getStringA)
    ],
    async (world, { addr, slot, start, valType }) => {
      const startVal = start.toNumber()
      const reverse = s => s.split('').reverse().join('');
      const storage = await world.web3.eth.getStorageAt(addr.val, slot.toNumber());
      const stored = reverse(storage.slice(2)); // drop leading 0x and reverse since items are packed from the back of the slot

      // Don't forget to re-reverse
      switch (valType.val) {
        case 'bool':
          return new BoolA(!!reverse(stored.slice(startVal, startVal + 2)));
        case 'address':
          return new AddressA('0x' + padLeft(reverse(stored.slice(startVal, startVal + 40)), 40));
        case 'number':
          return new NumberA(toBN('0x' + reverse(stored)).toString());
        default:
          return new NothingA();
      }
    }
  ),

  new Fetcher<
    { addr: AddressA; slot: NumberA; key: AddressA; nestedKey: AddressA; valType: StringA },
    ListV | NothingA
  >(
    `
    #### StorageAtNestedMapping

    * "StorageAtNestedMapping addr:<Address> slot:<Number>, key:<address>, nestedKey:<address>, valType:<VToCastTo>" - Returns bytes at storage slot
    `,
    'StorageAtNestedMapping',
    [
      new Arg('addr', getAddressA),
      new Arg('slot', getNumberA),
      new Arg('key', getAddressA),
      new Arg('nestedKey', getAddressA),
      new Arg('valType', getStringA)
    ],
    async (world, { addr, slot, key, nestedKey, valType }) => {
      const areEqual = (v, x) => toBN(v).eq(toBN(x));
      let paddedSlot = slot.toNumber().toString(16).padStart(64, '0');
      let paddedKey = padLeft(key.val, 64);
      let newKey = sha3(paddedKey + paddedSlot);
      let val = await world.web3.eth.getStorageAt(addr.val, newKey);

      switch (valType.val) {
        case 'marketStruct':
          let isListed = areEqual(val, 1);
          let collateralFactorKey = '0x' + toBN(newKey).add(toBN(1)).toString(16);
          let collateralFactorStr = await world.web3.eth.getStorageAt(addr.val, collateralFactorKey);
          let collateralFactor = toBN(collateralFactorStr);
          let userMarketBaseKey = padLeft(toBN(newKey).add(toBN(2)).toString(16), 64);
          let paddedSlot = padLeft(userMarketBaseKey, 64);
          let paddedKey = padLeft(nestedKey.val, 64);
          let newKeyTwo = sha3(paddedKey + paddedSlot);
          let userInMarket = await world.web3.eth.getStorageAt(addr.val, newKeyTwo);

          let isCompKey = '0x' + toBN(newKey).add(toBN(3)).toString(16);
          let isAnnexStr = await world.web3.eth.getStorageAt(addr.val, isCompKey);

          return new ListV([
            new BoolA(isListed),
            new ExpNumberA(collateralFactor.toString(), 1e18),
            new BoolA(areEqual(userInMarket, 1)),
            new BoolA(areEqual(isAnnexStr, 1))
          ]);
        default:
          return new NothingA();
      }
    }
  ),

  new Fetcher<
    { addr: AddressA; slot: NumberA; key: AddressA; valType: StringA },
    AddressA | BoolA | ExpNumberA | ListV | NothingA
  >(
    `
    #### StorageAtMapping

    * "StorageAtMapping addr:<Address> slot:<Number>, key:<address>, valType:<VToCastTo>" - Returns bytes at storage slot
    `,
    'StorageAtMapping',
    [
      new Arg('addr', getAddressA),
      new Arg('slot', getNumberA),
      new Arg('key', getAddressA),
      new Arg('valType', getStringA)
    ],
    async (world, { addr, slot, key, valType }) => {
      let paddedSlot = slot.toNumber().toString(16).padStart(64, '0');
      let paddedKey = padLeft(key.val, 64);
      let newKey = sha3(paddedKey + paddedSlot);
      let val = await world.web3.eth.getStorageAt(addr.val, newKey);

      switch (valType.val) {
        case 'list(address)':
          let p = new Array(toDecimal(val)).fill(undefined).map(async (_v, index) => {
            let newKeySha = sha3(newKey);
            let itemKey = toBN(newKeySha).add(toBN(index));
            let address = await world.web3.eth.getStorageAt(addr.val, padLeft(toHex(itemKey), 40));
            return new AddressA(address);
          });

          let all = await Promise.all(p);
          return new ListV(all);

        case 'bool':
          return new BoolA(val != '0x' && val != '0x0');
        case 'address':
          return new AddressA(val);
        case 'number':
          return new NumberA(toBN(val).toString());
        default:
          return new NothingA();
      }
    }
  ),

  new Fetcher<{}, NumberA>(
    `
    #### BlockNumber
    * BlockNumber
    `,
    'BlockNumber',
    [],
    async (world, {}) => {
      return new NumberA(await getCurrentBlockNumber(world));
    }
  ),

  new Fetcher<{}, NumberA>(
    `
    #### GasCounter
    * GasCounter
    `,
    'GasCounter',
    [],
    async (world, {}) => new NumberA(world.gasCounter.value)
  ),

  new Fetcher<{}, AddressA>(
    `
      #### LastContract

      * "LastContract" - The address of last constructed contract
    `,
    'LastContract',
    [],
    async (world, { }) => new AddressA(world.get('lastContract'))
  ),

  new Fetcher<{}, NumberA>(
    `
      #### LastBlock

      * "LastBlock" - The block of the last transaction
    `,
    'LastBlock',
    [],
    async (world, { }) => {
      let invokation = world.get('lastInvokation');
      if (!invokation) {
        throw new Error(`Expected last invokation for "lastBlock" but none found.`);
      }

      if (!invokation.receipt) {
        throw new Error(`Expected last invokation to have receipt for "lastBlock" but none found.`);
      }

      return new NumberA(invokation.receipt.blockNumber);
    }
  ),

  new Fetcher<{}, NumberA>(
    `
      #### LastGas

      * "LastGas" - The gas consumed by the last transaction
    `,
    'LastGas',
    [],
    async (world, {}) => {
      let invokation = world.get('lastInvokation');
      if (!invokation) {
        throw new Error(`Expected last invokation for "lastGas" but none found.`);
      }

      if (!invokation.receipt) {
        throw new Error(`Expected last invokation to have receipt for "lastGas" but none found.`);
      }

      return new NumberA(invokation.receipt.gasUsed);
    }
  ),

  new Fetcher<{ els: Value[] }, AnythingV>(
    `
      #### List

      * "List ..." - Returns a list of given elements
    `,
    'List',
    [new Arg('els', getCoreValue, { variadic: true, mapped: true })],
    async (world, { els }) => new ListV(els)
  ),
  new Fetcher<{ val: Value; def: EventV }, Value>(
    `
      #### Default

      * "Default val:<Value> def:<Value>" - Returns value if truthy, otherwise default. Note: this **does** short circuit.
    `,
    'Default',
    [new Arg('val', getCoreValue), new Arg('def', getEventV)],
    async (world, { val, def }) => {
      if (val.truthy()) {
        return val;
      } else {
        return await getCoreValue(world, def.val);
      }
    }
  ),
  new Fetcher<{ minutes: NumberA }, NumberA>(
    `
      #### Minutes

      * "Minutes minutes:<NumberA>" - Returns number of minutes in seconds
    `,
    'Minutes',
    [new Arg('minutes', getNumberA)],
    async (world, { minutes }) => {
      const minutesBn = new BigNumber(minutes.val);
      return new NumberA(minutesBn.times(60).toFixed(0));
    }
  ),
  new Fetcher<{ hours: NumberA }, NumberA>(
    `
      #### Hours

      * "Hours hours:<NumberA>" - Returns number of hours in seconds
    `,
    'Hours',
    [new Arg('hours', getNumberA)],
    async (world, { hours }) => {
      const hoursBn = new BigNumber(hours.val);
      return new NumberA(hoursBn.times(3600).toFixed(0));
    }
  ),
  new Fetcher<{ days: NumberA }, NumberA>(
    `
      #### Days

      * "Days days:<NumberA>" - Returns number of days in seconds
    `,
    'Days',
    [new Arg('days', getNumberA)],
    async (world, { days }) => {
      const daysBn = new BigNumber(days.val);
      return new NumberA(daysBn.times(86400).toFixed(0));
    }
  ),
  new Fetcher<{ weeks: NumberA }, NumberA>(
    `
      #### Weeks

      * "Weeks weeks:<NumberA>" - Returns number of weeks in seconds
    `,
    'Weeks',
    [new Arg('weeks', getNumberA)],
    async (world, { weeks }) => {
      const weeksBn = new BigNumber(weeks.val);
      return new NumberA(weeksBn.times(604800).toFixed(0));
    }
  ),
  new Fetcher<{ years: NumberA }, NumberA>(
    `
      #### Years

      * "Years years:<NumberA>" - Returns number of years in seconds
    `,
    'Years',
    [new Arg('years', getNumberA)],
    async (world, { years }) => {
      const yearsBn = new BigNumber(years.val);
      return new NumberA(yearsBn.times(31536000).toFixed(0));
    }
  ),
  new Fetcher<{ seconds: NumberA }, NumberA>(
    `
      #### FromNow

      * "FromNow seconds:<NumberA>" - Returns future timestamp of given seconds from now
    `,
    'FromNow',
    [new Arg('seconds', getNumberA)],
    async (world, { seconds }) => {
      const secondsBn = new BigNumber(seconds.val);
      return new NumberA(secondsBn.plus(getCurrentTimestamp()).toFixed(0));
    }
  ),
    new Fetcher<{}, NumberA>(
    `
      #### Now

      * "Now seconds:<NumberA>" - Returns current timestamp
    `,
    'Now',
    [],
    async (world, {}) => {
      return new NumberA(getCurrentTimestamp());
    }
  ),
  new Fetcher<{}, NumberA>(
    `
      #### BlockTimestamp

      * "BlockTimestamp" - Returns the current block's timestamp
        * E.g. "BlockTimestamp"
    `,
    'BlockTimestamp',
    [],
    async (world, {}) => {
      const {result: blockNumber}: any = await sendRPC(world, 'eth_blockNumber', []);
      const {result: block}: any = await sendRPC(world, 'eth_getBlockByNumber', [blockNumber, false]);
      return new NumberA(parseInt(block.timestamp, 16));
    }
  ),
  new Fetcher<{}, StringA>(
    `
      #### Network

      * "Network" - Returns the current Network
    `,
    'Network',
    [],
    async world => new StringA(world.network)
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### User

      * "User ...userArgs" - Returns user value
    `,
    'User',
    [new Arg('res', getUserValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: userFetchers() }
  ),
  new Fetcher<{ address: AddressA }, Value>(
    `
      #### BNBBalance

      * "BNBBalance <Address>" - Returns given address' bnb balance.
    `,
    'BNBBalance',
    [new Arg('address', getAddressA)],
    (world, { address }) => getBNBBalance(world, address.val)
  ),
  new Fetcher<{ given: Value; expected: Value }, BoolA>(
    `
      #### Equal

      * "Equal given:<Value> expected:<Value>" - Returns true if given values are equal
        * E.g. "Equal (Exactly 0) Zero"
        * E.g. "Equal (AToken aZRX TotalSupply) (Exactly 55)"
        * E.g. "Equal (AToken aZRX Comptroller) (Comptroller Address)"
    `,
    'Equal',
    [new Arg('given', getCoreValue), new Arg('expected', getCoreValue)],
    async (world, { given, expected }) => new BoolA(expected.compareTo(world, given))
  ),
  new Fetcher<
      {
        argTypes: StringA[];
        args: StringA[];
      },
      StringA
    >(
      `
        #### EncodeParameters

        * "EncodeParameters (...argTypes:<String>) (...args:<Anything>)
          * E.g. "EncodeParameters (\"address\" \"address\") (\"0xabc\" \"0x123\")
      `,
      'EncodeParameters',
      [
        new Arg('argTypes', getStringA, { mapped: true }),
        new Arg('args', getStringA, { mapped: true })
      ],
      async (world, { argTypes, args }) => {
        const realArgs = args.map((a, i) => {
          if (argTypes[i].val == 'address')
            return getAddress(world, a.val);
          return a.val;
        });
        return new StringA(world.web3.eth.abi.encodeParameters(argTypes.map(t => t.val), realArgs));
      }
    ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Unitroller

      * "Unitroller ...unitrollerArgs" - Returns unitroller value
    `,
    'Unitroller',
    [new Arg('res', getUnitrollerValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: unitrollerFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Comptroller

      * "Comptroller ...comptrollerArgs" - Returns comptroller value
    `,
    'Comptroller',
    [new Arg('res', getComptrollerValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: comptrollerFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### ComptrollerImpl

      * "ComptrollerImpl ...comptrollerImplArgs" - Returns comptroller implementation value
    `,
    'ComptrollerImpl',
    [new Arg('res', getComptrollerImplValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: comptrollerImplFetchers() }
  ),

  new Fetcher<{ res: Value }, Value>(
    `
      #### XAIController

      * "XAIController ...xaicontrollerArgs" - Returns xaicontroller value
    `,
    'XAIController',
    [new Arg('res', getXAIControllerValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: xaicontrollerFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### XAIControllerImpl

      * "XAIControllerImpl ...xaicontrollerImplArgs" - Returns xaicontroller implementation value
    `,
    'XAIControllerImpl',
    [new Arg('res', getXAIControllerImplValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: xaicontrollerImplFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### AToken

      * "AToken ...aTokenArgs" - Returns aToken value
    `,
    'AToken',
    [new Arg('res', getATokenValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: aTokenFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### ATokenDelegate

      * "ATokenDelegate ...aTokenDelegateArgs" - Returns aToken delegate value
    `,
    'ATokenDelegate',
    [new Arg('res', getATokenDelegateValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: aTokenDelegateFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Bep20

      * "Bep20 ...bep20Args" - Returns Bep20 value
    `,
    'Bep20',
    [new Arg('res', getBep20Value, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: bep20Fetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### InterestRateModel

      * "InterestRateModel ...interestRateModelArgs" - Returns InterestRateModel value
    `,
    'InterestRateModel',
    [new Arg('res', getInterestRateModelValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: interestRateModelFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### PriceOracle

      * "PriceOracle ...priceOracleArgs" - Returns PriceOracle value
    `,
    'PriceOracle',
    [new Arg('res', getPriceOracleValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: priceOracleFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### PriceOracleProxy

      * "PriceOracleProxy ...priceOracleProxyArgs" - Returns PriceOracleProxy value
    `,
    'PriceOracleProxy',
    [new Arg('res', getPriceOracleProxyValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: priceOracleProxyFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Timelock

      * "Timelock ...timeLockArgs" - Returns Timelock value
    `,
    'Timelock',
    [new Arg('res', getTimelockValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: timelockFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Maximillion

      * "Maximillion ...maximillionArgs" - Returns Maximillion value
    `,
    'Maximillion',
    [new Arg('res', getMaximillionValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: maximillionFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### MCD

      * "MCD ...mcdArgs" - Returns MCD value
    `,
    'MCD',
    [new Arg('res', getMCDValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: mcdFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### ANN

      * "ANN ...annexArgs" - Returns ANN value
    `,
    'ANN',
    [new Arg('res', getANNValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: annFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### XAI

      * "XAI ...annexArgs" - Returns XAI value
    `,
    'XAI',
    [new Arg('res', getXAIValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: xaiFetchers() }
  ),
  new Fetcher<{ res: Value }, Value>(
    `
      #### Governor

      * "Governor ...governorArgs" - Returns Governor value
    `,
    'Governor',
    [new Arg('res', getGovernorValue, { variadic: true })],
    async (world, { res }) => res,
    { subExpressions: governorFetchers() }
  ),
];

let contractFetchers = [
  { contract: "Counter", implicit: false },
  { contract: "AnnexLens", implicit: false },
  { contract: "Reservoir", implicit: true }
];

export async function getFetchers(world: World) {
  if (world.fetchers) {
    return { world, fetchers: world.fetchers };
  }

  let allFetchers = fetchers.concat(await Promise.all(contractFetchers.map(({contract, implicit}) => {
    return buildContractFetcher(world, contract, implicit);
  })));

  return { world: world.set('fetchers', allFetchers), fetchers: allFetchers };
}

export async function getCoreValue(world: World, event: Event): Promise<Value> {
  let {world: nextWorld, fetchers} = await getFetchers(world);
  return await getFetcherValue<any, any>('Core', fetchers, nextWorld, event);
}
