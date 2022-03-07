pragma solidity ^0.5.16;

import "../../contracts/Comptroller.sol";
import "../../contracts/PriceOracle.sol";

contract ComptrollerKovan is Comptroller {
  function getANNAddress() public view returns (address) {
    return 0x61460874a7196d6a22D1eE4922473664b3E95270;
  }
}

contract ComptrollerRopsten is Comptroller {
  function getANNAddress() public view returns (address) {
    return 0x1Fe16De955718CFAb7A44605458AB023838C2793;
  }
}

contract ComptrollerHarness is Comptroller {
    address annAddress;
    uint public blockNumber;

    constructor() Comptroller() public {}

    function setAnnexSupplyState(address aToken, uint224 index, uint32 blockNumber_) public {
        annexSupplyState[aToken].index = index;
        annexSupplyState[aToken].block = blockNumber_;
    }

    function setAnnexBorrowState(address aToken, uint224 index, uint32 blockNumber_) public {
        annexBorrowState[aToken].index = index;
        annexBorrowState[aToken].block = blockNumber_;
    }

    function setAnnexAccrued(address user, uint userAccrued) public {
        annexAccrued[user] = userAccrued;
    }

    function setANNAddress(address annAddress_) public {
        annAddress = annAddress_;
    }

    function getANNAddress() public view returns (address) {
        return annAddress;
    }

    /**
     * @notice Set the amount of ANN distributed per block
     * @param annexRate_ The amount of ANN wei per block to distribute
     */
    function harnessSetAnnexRate(uint annexRate_) public {
        annexRate = annexRate_;
    }

    /**
     * @notice Recalculate and update ANN speeds for all ANN markets
     */
    function harnessRefreshAnnexSpeeds() public {
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

    function setAnnexBorrowerIndex(address aToken, address borrower, uint index) public {
        annexBorrowerIndex[aToken][borrower] = index;
    }

    function setAnnexSupplierIndex(address aToken, address supplier, uint index) public {
        annexSupplierIndex[aToken][supplier] = index;
    }

    function harnessDistributeAllBorrowerAnnex(address aToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerAnnex(aToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}),false);
        annexAccrued[borrower] = grantANNInternal(borrower, annexAccrued[borrower]);
    }

    function harnessDistributeAllSupplierAnnex(address aToken, address supplier) public {
        distributeSupplierAnnex(aToken, supplier,false);
        annexAccrued[supplier] = grantANNInternal(supplier, annexAccrued[supplier]);
    }

    function harnessUpdateAnnexBorrowIndex(address aToken, uint marketBorrowIndexMantissa) public {
        updateAnnexBorrowIndex(aToken, Exp({mantissa: marketBorrowIndexMantissa}));
    }

    function harnessUpdateAnnexSupplyIndex(address aToken) public {
        updateAnnexSupplyIndex(aToken);
    }

    function harnessDistributeBorrowerAnnex(address aToken, address borrower, uint marketBorrowIndexMantissa) public {
        distributeBorrowerAnnex(aToken, borrower, Exp({mantissa: marketBorrowIndexMantissa}),false);
    }

    function harnessDistributeSupplierAnnex(address aToken, address supplier) public {
        distributeSupplierAnnex(aToken, supplier,false);
    }

    function harnessDistributeXAIMinterAnnex(address xaiMinter) public {
        distributeXAIMinterAnnex(xaiMinter);
    }

    function harnessTransferAnnex(address user, uint userAccrued, uint threshold) public returns (uint) {
        if (userAccrued > 0 && userAccrued >= threshold) {
            return grantANNInternal(user, userAccrued);
        }
        return userAccrued;
    }

    function harnessAddAnnexMarkets(address[] memory aTokens) public {
        for (uint i = 0; i < aTokens.length; i++) {
            // temporarily set annexSpeed to 1 (will be fixed by `harnessRefreshAnnexSpeeds`)
            setAnnexSpeedInternal(AToken(aTokens[i]), 1);
        }
    }

    function harnessSetMintedXAIs(address user, uint amount) public {
        mintedXAIs[user] = amount;
    }

    function harnessFastForward(uint blocks) public returns (uint) {
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
            if (annexSpeeds[address(allMarkets[i])] > 0) {
                n++;
            }
        }

        address[] memory annexMarkets = new address[](n);
        uint k = 0;
        for (uint i = 0; i < m; i++) {
            if (annexSpeeds[address(allMarkets[i])] > 0) {
                annexMarkets[k++] = address(allMarkets[i]);
            }
        }
        return annexMarkets;
    }
}

contract ComptrollerBorked {
    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        unitroller._acceptImplementation();
    }
}

contract BoolComptroller is ComptrollerInterface {
    bool allowMint = true;
    bool allowRedeem = true;
    bool allowBorrow = true;
    bool allowRepayBorrow = true;
    bool allowLiquidateBorrow = true;
    bool allowSeize = true;
    bool allowTransfer = true;

    bool verifyMint = true;
    bool verifyRedeem = true;
    bool verifyBorrow = true;
    bool verifyRepayBorrow = true;
    bool verifyLiquidateBorrow = true;
    bool verifySeize = true;
    bool verifyTransfer = true;

    bool failCalculateSeizeTokens;
    uint calculatedSeizeTokens;

    bool public protocolPaused = false;

    mapping(address => uint) public mintedXAIs;
    bool xaiFailCalculateSeizeTokens;
    uint xaiCalculatedSeizeTokens;

    uint noError = 0;
    uint opaqueError = noError + 11; // an arbitrary, opaque error code

    address public treasuryGuardian;
    address public treasuryAddress;
    uint public treasuryPercent;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata _aTokens) external returns (uint[] memory) {
        _aTokens;
        uint[] memory ret;
        return ret;
    }

    function exitMarket(address _aToken) external returns (uint) {
        _aToken;
        return noError;
    }

    /*** Policy Hooks ***/

    function mintAllowed(address _aToken, address _minter, uint _mintAmount) external returns (uint) {
        _aToken;
        _minter;
        _mintAmount;
        return allowMint ? noError : opaqueError;
    }

    function mintVerify(address _aToken, address _minter, uint _mintAmount, uint _mintTokens) external {
        _aToken;
        _minter;
        _mintAmount;
        _mintTokens;
        require(verifyMint, "mintVerify rejected mint");
    }

    function redeemAllowed(address _aToken, address _redeemer, uint _redeemTokens) external returns (uint) {
        _aToken;
        _redeemer;
        _redeemTokens;
        return allowRedeem ? noError : opaqueError;
    }

    function redeemVerify(address _aToken, address _redeemer, uint _redeemAmount, uint _redeemTokens) external {
        _aToken;
        _redeemer;
        _redeemAmount;
        _redeemTokens;
        require(verifyRedeem, "redeemVerify rejected redeem");
    }

    function borrowAllowed(address _aToken, address _borrower, uint _borrowAmount) external returns (uint) {
        _aToken;
        _borrower;
        _borrowAmount;
        return allowBorrow ? noError : opaqueError;
    }

    function borrowVerify(address _aToken, address _borrower, uint _borrowAmount) external {
        _aToken;
        _borrower;
        _borrowAmount;
        require(verifyBorrow, "borrowVerify rejected borrow");
    }

    function repayBorrowAllowed(
        address _aToken,
        address _payer,
        address _borrower,
        uint _repayAmount) external returns (uint) {
        _aToken;
        _payer;
        _borrower;
        _repayAmount;
        return allowRepayBorrow ? noError : opaqueError;
    }

    function repayBorrowVerify(
        address _aToken,
        address _payer,
        address _borrower,
        uint _repayAmount,
        uint _borrowerIndex) external {
        _aToken;
        _payer;
        _borrower;
        _repayAmount;
        _borrowerIndex;
        require(verifyRepayBorrow, "repayBorrowVerify rejected repayBorrow");
    }

    function liquidateBorrowAllowed(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount) external returns (uint) {
        _aTokenBorrowed;
        _aTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        return allowLiquidateBorrow ? noError : opaqueError;
    }

    function liquidateBorrowVerify(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        address _liquidator,
        address _borrower,
        uint _repayAmount,
        uint _seizeTokens) external {
        _aTokenBorrowed;
        _aTokenCollateral;
        _liquidator;
        _borrower;
        _repayAmount;
        _seizeTokens;
        require(verifyLiquidateBorrow, "liquidateBorrowVerify rejected liquidateBorrow");
    }

    function seizeAllowed(
        address _aTokenCollateral,
        address _aTokenBorrowed,
        address _borrower,
        address _liquidator,
        uint _seizeTokens) external returns (uint) {
        _aTokenCollateral;
        _aTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        return allowSeize ? noError : opaqueError;
    }

    function seizeVerify(
        address _aTokenCollateral,
        address _aTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint _seizeTokens) external {
        _aTokenCollateral;
        _aTokenBorrowed;
        _liquidator;
        _borrower;
        _seizeTokens;
        require(verifySeize, "seizeVerify rejected seize");
    }

    function transferAllowed(
        address _aToken,
        address _src,
        address _dst,
        uint _transferTokens) external returns (uint) {
        _aToken;
        _src;
        _dst;
        _transferTokens;
        return allowTransfer ? noError : opaqueError;
    }

    function transferVerify(
        address _aToken,
        address _src,
        address _dst,
        uint _transferTokens) external {
        _aToken;
        _src;
        _dst;
        _transferTokens;
        require(verifyTransfer, "transferVerify rejected transfer");
    }

    /*** Special Liquidation Calculation ***/

    function liquidateCalculateSeizeTokens(
        address _aTokenBorrowed,
        address _aTokenCollateral,
        uint _repayAmount) external view returns (uint, uint) {
        _aTokenBorrowed;
        _aTokenCollateral;
        _repayAmount;
        return failCalculateSeizeTokens ? (opaqueError, 0) : (noError, calculatedSeizeTokens);
    }

    /*** Special Liquidation Calculation ***/

    function liquidateXAICalculateSeizeTokens(
        address _aTokenCollateral,
        uint _repayAmount) external view returns (uint, uint) {
        _aTokenCollateral;
        _repayAmount;
        return xaiFailCalculateSeizeTokens ? (opaqueError, 0) : (noError, xaiCalculatedSeizeTokens);
    }

    /**** Mock Settors ****/

    /*** Policy Hooks ***/

    function setMintAllowed(bool allowMint_) public {
        allowMint = allowMint_;
    }

    function setMintVerify(bool verifyMint_) public {
        verifyMint = verifyMint_;
    }

    function setRedeemAllowed(bool allowRedeem_) public {
        allowRedeem = allowRedeem_;
    }

    function setRedeemVerify(bool verifyRedeem_) public {
        verifyRedeem = verifyRedeem_;
    }

    function setBorrowAllowed(bool allowBorrow_) public {
        allowBorrow = allowBorrow_;
    }

    function setBorrowVerify(bool verifyBorrow_) public {
        verifyBorrow = verifyBorrow_;
    }

    function setRepayBorrowAllowed(bool allowRepayBorrow_) public {
        allowRepayBorrow = allowRepayBorrow_;
    }

    function setRepayBorrowVerify(bool verifyRepayBorrow_) public {
        verifyRepayBorrow = verifyRepayBorrow_;
    }

    function setLiquidateBorrowAllowed(bool allowLiquidateBorrow_) public {
        allowLiquidateBorrow = allowLiquidateBorrow_;
    }

    function setLiquidateBorrowVerify(bool verifyLiquidateBorrow_) public {
        verifyLiquidateBorrow = verifyLiquidateBorrow_;
    }

    function setSeizeAllowed(bool allowSeize_) public {
        allowSeize = allowSeize_;
    }

    function setSeizeVerify(bool verifySeize_) public {
        verifySeize = verifySeize_;
    }

    function setTransferAllowed(bool allowTransfer_) public {
        allowTransfer = allowTransfer_;
    }

    function setTransferVerify(bool verifyTransfer_) public {
        verifyTransfer = verifyTransfer_;
    }

    /*** Liquidity/Liquidation Calculations ***/

    function setCalculatedSeizeTokens(uint seizeTokens_) public {
        calculatedSeizeTokens = seizeTokens_;
    }

    function setFailCalculateSeizeTokens(bool shouldFail) public {
        failCalculateSeizeTokens = shouldFail;
    }

    function setXAICalculatedSeizeTokens(uint xaiSeizeTokens_) public {
        xaiCalculatedSeizeTokens = xaiSeizeTokens_;
    }

    function setXAIFailCalculateSeizeTokens(bool xaiShouldFail) public {
        xaiFailCalculateSeizeTokens = xaiShouldFail;
    }

    function harnessSetMintedXAIOf(address owner, uint amount) external returns (uint) {
        mintedXAIs[owner] = amount;
        return noError;
    }

    // function mintedXAIs(address owner) external pure returns (uint) {
    //     owner;
    //     return 1e18;
    // }

    function setMintedXAIOf(address owner, uint amount) external returns (uint) {
        owner;
        amount;
        return noError;
    }

    function xaiMintRate() external pure returns (uint) {
        return 1e18;
    }

    function setTreasuryData(address treasuryGuardian_, address treasuryAddress_, uint treasuryPercent_) external {
        treasuryGuardian = treasuryGuardian_;
        treasuryAddress = treasuryAddress_;
        treasuryPercent = treasuryPercent_;
    }
}

contract EchoTypesComptroller is UnitrollerAdminStorage {
    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }

    function becomeBrains(address payable unitroller) public {
        Unitroller(unitroller)._acceptImplementation();
    }
}
