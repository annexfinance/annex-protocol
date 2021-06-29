import { Contract } from '../Contract';
import { Callable, Sendable } from '../Invokation';

interface XAIUnitrollerMethods {
  admin(): Callable<string>;
  pendingAdmin(): Callable<string>;
  _acceptAdmin(): Sendable<number>;
  _setPendingAdmin(pendingAdmin: string): Sendable<number>;
  _setPendingImplementation(pendingImpl: string): Sendable<number>;
  xaicontrollerImplementation(): Callable<string>;
  pendingXAIControllerImplementation(): Callable<string>;
}

export interface XAIUnitroller extends Contract {
  methods: XAIUnitrollerMethods;
}
