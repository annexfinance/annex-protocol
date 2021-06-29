import { Contract } from '../Contract';
import { encodedNumber } from '../Encoding';
import { Callable, Sendable } from '../Invokation';

export interface XAIMethods {
  name(): Callable<string>;
  symbol(): Callable<string>;
  decimals(): Callable<number>;
  totalSupply(): Callable<number>;
  balanceOf(address: string): Callable<string>;
  allowance(owner: string, spender: string): Callable<string>;
  approve(address: string, amount: encodedNumber): Sendable<number>;
  allocateTo(address: string, amount: encodedNumber): Sendable<number>
  transfer(address: string, amount: encodedNumber): Sendable<boolean>;
  transferFrom(owner: string, spender: string, amount: encodedNumber): Sendable<boolean>;
  rely(address: string): Sendable<void>;
}

export interface XAIScenarioMethods extends XAIMethods {
  transferScenario(destinations: string[], amount: encodedNumber): Sendable<boolean>;
  transferFromScenario(froms: string[], amount: encodedNumber): Sendable<boolean>;
}

export interface XAI extends Contract {
  methods: XAIMethods;
  name: string;
}

export interface XAIScenario extends Contract {
  methods: XAIScenarioMethods;
  name: string;
}
