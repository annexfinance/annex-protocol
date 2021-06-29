pragma solidity ^0.5.16;

import "../../contracts/XAIController.sol";

contract XAIControllerHarness is XAIController {
    address xaiAddress;
    uint public blockNumber;

    constructor() XAIController() public {}

    function setAnnexXAIState(uint224 index, uint32 blockNumber_) public {
        annexXAIState.index = index;
        annexXAIState.block = blockNumber_;
    }

    function setXAIAddress(address xaiAddress_) public {
        xaiAddress = xaiAddress_;
    }

    function getXAIAddress() public view returns (address) {
        return xaiAddress;
    }

    function setAnnexXAIMinterIndex(address xaiMinter, uint index) public {
        annexXAIMinterIndex[xaiMinter] = index;
    }

    function harnessUpdateAnnexXAIMintIndex() public {
        updateAnnexXAIMintIndex();
    }

    function harnessCalcDistributeXAIMinterAnnex(address xaiMinter) public {
        calcDistributeXAIMinterAnnex(xaiMinter);
    }

    function harnessRepayXAIFresh(address payer, address account, uint repayAmount) public returns (uint) {
       (uint err,) = repayXAIFresh(payer, account, repayAmount);
       return err;
    }

    function harnessLiquidateXAIFresh(address liquidator, address borrower, uint repayAmount, AToken aTokenCollateral) public returns (uint) {
        (uint err,) = liquidateXAIFresh(liquidator, borrower, repayAmount, aTokenCollateral);
        return err;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }
}
