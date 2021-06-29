import { Event } from '../Event';
import { World } from '../World';
import { ANN } from '../Contract/ANN';
import {
  getAddressA,
  getNumberA
} from '../CoreValue';
import {
  AddressA,
  ListV,
  NumberA,
  StringA,
  Value
} from '../Value';
import { Arg, Fetcher, getFetcherValue } from '../Command';
import { getANN } from '../ContractLookup';

export function annFetchers() {
  return [
    new Fetcher<{ ann: ANN }, AddressA>(`
        #### Address

        * "<ANN> Address" - Returns the address of ANN token
          * E.g. "ANN Address"
      `,
      "Address",
      [
        new Arg("ann", getANN, { implicit: true })
      ],
      async (world, { ann }) => new AddressA(ann._address)
    ),

    new Fetcher<{ ann: ANN }, StringA>(`
        #### Name

        * "<ANN> Name" - Returns the name of the ANN token
          * E.g. "ANN Name"
      `,
      "Name",
      [
        new Arg("ann", getANN, { implicit: true })
      ],
      async (world, { ann }) => new StringA(await ann.methods.name().call())
    ),

    new Fetcher<{ ann: ANN }, StringA>(`
        #### Symbol

        * "<ANN> Symbol" - Returns the symbol of the ANN token
          * E.g. "ANN Symbol"
      `,
      "Symbol",
      [
        new Arg("ann", getANN, { implicit: true })
      ],
      async (world, { ann }) => new StringA(await ann.methods.symbol().call())
    ),

    new Fetcher<{ ann: ANN }, NumberA>(`
        #### Decimals

        * "<ANN> Decimals" - Returns the number of decimals of the ANN token
          * E.g. "ANN Decimals"
      `,
      "Decimals",
      [
        new Arg("ann", getANN, { implicit: true })
      ],
      async (world, { ann }) => new NumberA(await ann.methods.decimals().call())
    ),

    new Fetcher<{ ann: ANN }, NumberA>(`
        #### TotalSupply

        * "ANN TotalSupply" - Returns ANN token's total supply
      `,
      "TotalSupply",
      [
        new Arg("ann", getANN, { implicit: true })
      ],
      async (world, { ann }) => new NumberA(await ann.methods.totalSupply().call())
    ),

    new Fetcher<{ ann: ANN, address: AddressA }, NumberA>(`
        #### TokenBalance

        * "ANN TokenBalance <Address>" - Returns the ANN token balance of a given address
          * E.g. "ANN TokenBalance Geoff" - Returns Geoff's ANN balance
      `,
      "TokenBalance",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("address", getAddressA)
      ],
      async (world, { ann, address }) => new NumberA(await ann.methods.balanceOf(address.val).call())
    ),

    new Fetcher<{ ann: ANN, owner: AddressA, spender: AddressA }, NumberA>(`
        #### Allowance

        * "ANN Allowance owner:<Address> spender:<Address>" - Returns the ANN allowance from owner to spender
          * E.g. "ANN Allowance Geoff Torrey" - Returns the ANN allowance of Geoff to Torrey
      `,
      "Allowance",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("owner", getAddressA),
        new Arg("spender", getAddressA)
      ],
      async (world, { ann, owner, spender }) => new NumberA(await ann.methods.allowance(owner.val, spender.val).call())
    ),

    new Fetcher<{ ann: ANN, account: AddressA }, NumberA>(`
        #### GetCurrentVotes

        * "ANN GetCurrentVotes account:<Address>" - Returns the current ANN votes balance for an account
          * E.g. "ANN GetCurrentVotes Geoff" - Returns the current ANN vote balance of Geoff
      `,
      "GetCurrentVotes",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
      ],
      async (world, { ann, account }) => new NumberA(await ann.methods.getCurrentVotes(account.val).call())
    ),

    new Fetcher<{ ann: ANN, account: AddressA, blockNumber: NumberA }, NumberA>(`
        #### GetPriorVotes

        * "ANN GetPriorVotes account:<Address> blockBumber:<Number>" - Returns the current ANN votes balance at given block
          * E.g. "ANN GetPriorVotes Geoff 5" - Returns the ANN vote balance for Geoff at block 5
      `,
      "GetPriorVotes",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
        new Arg("blockNumber", getNumberA),
      ],
      async (world, { ann, account, blockNumber }) => new NumberA(await ann.methods.getPriorVotes(account.val, blockNumber.encode()).call())
    ),

    new Fetcher<{ ann: ANN, account: AddressA }, NumberA>(`
        #### GetCurrentVotesBlock

        * "ANN GetCurrentVotesBlock account:<Address>" - Returns the current ANN votes checkpoint block for an account
          * E.g. "ANN GetCurrentVotesBlock Geoff" - Returns the current ANN votes checkpoint block for Geoff
      `,
      "GetCurrentVotesBlock",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
      ],
      async (world, { ann, account }) => {
        const numCheckpoints = Number(await ann.methods.numCheckpoints(account.val).call());
        const checkpoint = await ann.methods.checkpoints(account.val, numCheckpoints - 1).call();

        return new NumberA(checkpoint.fromBlock);
      }
    ),

    new Fetcher<{ ann: ANN, account: AddressA }, NumberA>(`
        #### VotesLength

        * "ANN VotesLength account:<Address>" - Returns the ANN vote checkpoint array length
          * E.g. "ANN VotesLength Geoff" - Returns the ANN vote checkpoint array length of Geoff
      `,
      "VotesLength",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
      ],
      async (world, { ann, account }) => new NumberA(await ann.methods.numCheckpoints(account.val).call())
    ),

    new Fetcher<{ ann: ANN, account: AddressA }, ListV>(`
        #### AllVotes

        * "ANN AllVotes account:<Address>" - Returns information about all votes an account has had
          * E.g. "ANN AllVotes Geoff" - Returns the ANN vote checkpoint array
      `,
      "AllVotes",
      [
        new Arg("ann", getANN, { implicit: true }),
        new Arg("account", getAddressA),
      ],
      async (world, { ann, account }) => {
        const numCheckpoints = Number(await ann.methods.numCheckpoints(account.val).call());
        const checkpoints = await Promise.all(new Array(numCheckpoints).fill(undefined).map(async (_, i) => {
          const {fromBlock, votes} = await ann.methods.checkpoints(account.val, i).call();

          return new StringA(`Block ${fromBlock}: ${votes} vote${votes !== 1 ? "s" : ""}`);
        }));

        return new ListV(checkpoints);
      }
    )
  ];
}

export async function getANNValue(world: World, event: Event): Promise<Value> {
  return await getFetcherValue<any, any>("ANN", annFetchers(), world, event);
}
