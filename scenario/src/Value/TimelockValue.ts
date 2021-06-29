import { Event } from '../Event';
import { World } from '../World';
import { Timelock } from '../Contract/Timelock';
import { getAddressA, getCoreValue, getNumberA, getStringA } from '../CoreValue';
import { AddressA, BoolA, NumberA, StringA, Value } from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getTimelock } from '../ContractLookup';
import { encodeParameters } from '../Utils';

export async function getTimelockAddress(world: World, timelock: Timelock): Promise<AddressA> {
  return new AddressA(timelock._address);
}

async function getAdmin(world: World, timelock: Timelock): Promise<AddressA> {
  return new AddressA(await timelock.methods.admin().call());
}

async function getPendingAdmin(world: World, timelock: Timelock): Promise<AddressA> {
  return new AddressA(await timelock.methods.pendingAdmin().call());
}

async function getDelay(world: World, timelock: Timelock): Promise<NumberA> {
  return new NumberA(await timelock.methods.delay().call());
}

async function queuedTransaction(world: World, timelock: Timelock, txHash: string): Promise<BoolA> {
  return new BoolA(await timelock.methods.queuedTransactions(txHash).call());
}

export function timelockFetchers() {
  return [
    new Fetcher<{ timelock: Timelock }, AddressA>(
      `
        #### Address

        * "Address" - Gets the address of the Timelock
      `,
      'Address',
      [new Arg('timelock', getTimelock, { implicit: true })],
      (world, { timelock }) => getTimelockAddress(world, timelock)
    ),
    new Fetcher<{ timelock: Timelock }, AddressA>(
      `
        #### Admin

        * "Admin" - Gets the address of the Timelock admin
      `,
      'Admin',
      [new Arg('timelock', getTimelock, { implicit: true })],
      (world, { timelock }) => getAdmin(world, timelock)
    ),
    new Fetcher<{ timelock: Timelock }, AddressA>(
      `
        #### PendingAdmin

        * "PendingAdmin" - Gets the address of the Timelock pendingAdmin
      `,
      'PendingAdmin',
      [new Arg('timelock', getTimelock, { implicit: true })],
      (world, { timelock }) => getPendingAdmin(world, timelock)
    ),
    new Fetcher<{ timelock: Timelock }, NumberA>(
      `
        #### Delay

        * "Delay" - Gets the delay of the Timelock
      `,
      'Delay',
      [new Arg('timelock', getTimelock, { implicit: true })],
      (world, { timelock }) => getDelay(world, timelock)
    ),
    new Fetcher<
      {
        target: AddressA;
        value: NumberA;
        eta: NumberA;
        signature: StringA;
        data: StringA[];
      },
      StringA
    >(
      `
        #### TxHash

        * "TxHash target:<Address> value:<Number> eta:<Number> signature:<String> ...funArgs:<CoreValue>" - Returns a hash of a transactions values
        * E.g. "Timelock TxHash \"0x0000000000000000000000000000000000000000\" 0 1569286014 \"setDelay(uint256)\" 60680"
      `,
      'TxHash',
      [
        new Arg('target', getAddressA),
        new Arg('value', getNumberA),
        new Arg('eta', getNumberA),
        new Arg('signature', getStringA),
        new Arg('data', getCoreValue, { variadic: true, mapped: true })
      ],
      (world, { target, value, signature, data, eta }) => {
        const encodedData = encodeParameters(world, signature.val, data.map(a => a.val));
        const encodedTransaction = world.web3.eth.abi.encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target.val, value.val, signature.val, encodedData, eta.val]
        );

        return Promise.resolve(new StringA(world.web3.utils.keccak256(encodedTransaction)));
      }
    ),
    new Fetcher<{ timelock: Timelock; txHash: StringA }, BoolA>(
      `
        #### QueuedTransaction

        * "QueuedTransaction txHash:<String>" - Gets the boolean value of the given txHash in the queuedTransactions mapping
      `,
      'QueuedTransaction',
      [new Arg('timelock', getTimelock, { implicit: true }), new Arg('txHash', getStringA)],
      (world, { timelock, txHash }) => queuedTransaction(world, timelock, txHash.val)
    )
  ];
}

export async function getTimelockValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>('Timelock', timelockFetchers(), world, event);
}
