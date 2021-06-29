pragma solidity ^0.5.16;

import "../../contracts/XAIController.sol";
import "./ComptrollerScenario.sol";

contract XAIControllerScenario is XAIController {
    uint blockNumber;
    address public annAddress;
    address public xaiAddress;

    constructor() XAIController() public {}

    function setXAIAddress(address xaiAddress_) public {
        xaiAddress = xaiAddress_;
    }

    function getXAIAddress() public view returns (address) {
        return xaiAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}
