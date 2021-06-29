pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";

contract ComptrollerScenario is Comptroller {
    uint public blockNumber;
    address public annAddress;
    address public xaiAddress;

    constructor() Comptroller() public {}

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

    /**
     * @notice Recalculate and update ANN speeds for all ANN markets
     */
    function refreshAnnexSpeeds() public {
        AToken[] memory allMarkets_ = allMarkets;

        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets_[i];
            Exp memory borrowIndex = Exp({mantissa: aToken.borrowIndex()});
            updateAnnexSupplyIndex(address(aToken));
            updateAnnexBorrowIndex(address(aToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets_.length);
        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets_[i];
            if (annexSpeeds[address(aToken)] > 0) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(aToken)});
                Exp memory utility = mul_(assetPrice, aToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (uint i = 0; i < allMarkets_.length; i++) {
            AToken aToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(annexRate, div_(utilities[i], totalUtility)) : 0;
            setAnnexSpeedInternal(aToken, newSpeed);
        }
    }
}
