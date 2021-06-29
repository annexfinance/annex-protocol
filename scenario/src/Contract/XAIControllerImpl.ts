import { Contract } from '../Contract';
import { Sendable } from '../Invokation';

interface XAIControllerImplMethods {
  _become(
    controller: string
  ): Sendable<string>;
}

export interface XAIControllerImpl extends Contract {
  methods: XAIControllerImplMethods;
}
