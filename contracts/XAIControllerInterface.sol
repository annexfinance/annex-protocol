pragma solidity ^0.5.16;

contract XAIControllerInterface {
    function getXAIAddress() public view returns (address);
    function getMintableXAI(address minter) public view returns (uint, uint);
    function mintXAI(address minter, uint mintXAIAmount) external returns (uint);
    function repayXAI(address repayer, uint repayXAIAmount) external returns (uint);

    function _initializeAnnexXAIState(uint blockNumber) external returns (uint);
    function updateAnnexXAIMintIndex() external returns (uint);
    function calcDistributeXAIMinterAnnex(address xaiMinter) external returns(uint, uint, uint, uint);
}
