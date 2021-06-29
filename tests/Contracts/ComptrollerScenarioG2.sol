pragma solidity ^0.5.16;

import "../../contracts/ComptrollerG2.sol";

contract ComptrollerScenarioG2 is ComptrollerG2 {
    uint public blockNumber;

    constructor() ComptrollerG2() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function membershipLength(AToken aToken) public view returns (uint) {
        return accountAssets[address(aToken)].length;
    }

    function unlist(AToken aToken) public {
        markets[address(aToken)].isListed = false;
    }

    function setAnnexSpeed(address aToken, uint annexSpeed) public {
        annexSpeeds[aToken] = annexSpeed;
    }
}
