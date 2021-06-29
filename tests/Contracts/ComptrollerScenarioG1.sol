pragma solidity ^0.5.16;

import "../../contracts/ComptrollerG1.sol";

contract ComptrollerScenarioG1 is ComptrollerG1 {
    uint public blockNumber;
    address public annAddress;
    address public xaiAddress;

    constructor() ComptrollerG1() public {}

    function setANNAddress(address annAddress_) public {
        annAddress = annAddress_;
    }

    function getANNAddress() public view returns (address) {
        return annAddress;
    }

    function setXAIAddress(address xaiAddress_) public {
        xaiAddress = xaiAddress_;
    }

    function getXAIAddress() public view returns (address) {
        return xaiAddress;
    }

    function membershipLength(AToken aToken) public view returns (uint) {
        return accountAssets[address(aToken)].length;
    }

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;

        return blockNumber;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function getAnnexMarkets() public view returns (address[] memory) {
        uint m = allMarkets.length;
        uint n = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isAnnex) {
                n++;
            }
        }

        address[] memory annexMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (markets[address(allMarkets[i])].isAnnex) {
                annexMarkets[k++] = address(allMarkets[i]);
            }
        }
        return annexMarkets;
    }

    function unlist(AToken aToken) public {
        markets[address(aToken)].isListed = false;
    }
}
