import { Contract } from '../Contract';
import { encodedNumber } from '../Encoding';
import { Callable, Sendable } from '../Invokation';

export interface AnnexLensMethods {
  aTokenBalances(aToken: string, account: string): Sendable<[string,number,number,number,number,number]>;
  aTokenBalancesAll(aTokens: string[], account: string): Sendable<[string,number,number,number,number,number][]>;
  aTokenMetadata(aToken: string): Sendable<[string,number,number,number,number,number,number,number,number,boolean,number,string,number,number]>;
  aTokenMetadataAll(aTokens: string[]): Sendable<[string,number,number,number,number,number,number,number,number,boolean,number,string,number,number][]>;
  aTokenUnderlyingPrice(aToken: string): Sendable<[string,number]>;
  aTokenUnderlyingPriceAll(aTokens: string[]): Sendable<[string,number][]>;
  getAccountLimits(comptroller: string, account: string): Sendable<[string[],number,number]>;
}

export interface AnnexLens extends Contract {
  methods: AnnexLensMethods;
  name: string;
}
