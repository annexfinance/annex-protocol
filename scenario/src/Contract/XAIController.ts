import {Contract} from '../Contract';
import {Callable, Sendable} from '../Invokation';
import {encodedNumber} from '../Encoding';

interface XAIControllerMethods {
  admin(): Callable<string>
  pendingAdmin(): Callable<string>
  _setPendingAdmin(string): Sendable<number>
  _acceptAdmin(): Sendable<number>
  _setComptroller(string): Sendable<number>
  mintXAI(amount: encodedNumber): Sendable<number>
  repayXAI(amount: encodedNumber): Sendable<{0: number, 1: number}>
  getMintableXAI(string): Callable<{0: number, 1: number}>
  liquidateXAI(borrower: string, repayAmount: encodedNumber, aTokenCollateral: string): Sendable<{0: number, 1: number}>
  _setTreasuryData(guardian, address, percent: encodedNumber): Sendable<number>
  initialize(): Sendable<void>
}

export interface XAIController extends Contract {
  methods: XAIControllerMethods
}
