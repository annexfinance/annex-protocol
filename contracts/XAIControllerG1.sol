pragma solidity ^0.5.16;

import "./AToken.sol";
import "./PriceOracle.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./XAIControllerStorage.sol";
import "./XAIUnitroller.sol";
import "./XAI/XAI.sol";

interface ComptrollerLensInterface {
    function protocolPaused() external view returns (bool);
    function mintedXAIs(address account) external view returns (uint);
    function xaiMintRate() external view returns (uint);
    function annexXAIRate() external view returns (uint);
    function annexAccrued(address account) external view returns(uint);
    function getAssetsIn(address account) external view returns (AToken[] memory);
    function oracle() external view returns (PriceOracle);

    function distributeXAIMinterAnnex(address xaiMinter, bool distributeAll) external;
}

/**
 * @title Annex's XAI Comptroller Contract
 * @author Annex
 */
contract XAIControllerG1 is XAIControllerStorageG1, XAIControllerErrorReporter, Exponential {

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /**
     * @notice Event emitted when XAI is minted
     */
    event MintXAI(address minter, uint mintXAIAmount);

    /**
     * @notice Event emitted when XAI is repaid
     */
    event RepayXAI(address repayer, uint repayXAIAmount);

    /// @notice The initial Annex index for a market
    uint224 public constant annexInitialIndex = 1e36;

    /*** Main Actions ***/

    function mintXAI(uint mintXAIAmount) external returns (uint) {
        if(address(comptroller) != address(0)) {
            require(!ComptrollerLensInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            address minter = msg.sender;

            // Keep the flywheel moving
            updateAnnexXAIMintIndex();
            ComptrollerLensInterface(address(comptroller)).distributeXAIMinterAnnex(minter, false);

            uint oErr;
            MathError mErr;
            uint accountMintXAINew;
            uint accountMintableXAI;

            (oErr, accountMintableXAI) = getMintableXAI(minter);
            if (oErr != uint(Error.NO_ERROR)) {
                return uint(Error.REJECTION);
            }

            // check that user have sufficient mintableXAI balance
            if (mintXAIAmount > accountMintableXAI) {
                return fail(Error.REJECTION, FailureInfo.XAI_MINT_REJECTION);
            }

            (mErr, accountMintXAINew) = addUInt(ComptrollerLensInterface(address(comptroller)).mintedXAIs(minter), mintXAIAmount);
            require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");
            uint error = comptroller.setMintedXAIOf(minter, accountMintXAINew);
            if (error != 0 ) {
                return error;
            }

            XAI(getXAIAddress()).mint(minter, mintXAIAmount);
            emit MintXAI(minter, mintXAIAmount);

            return uint(Error.NO_ERROR);
        }
    }

    /**
     * @notice Repay XAI
     */
    function repayXAI(uint repayXAIAmount) external returns (uint) {
        if(address(comptroller) != address(0)) {
            require(!ComptrollerLensInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            address repayer = msg.sender;

            updateAnnexXAIMintIndex();
            ComptrollerLensInterface(address(comptroller)).distributeXAIMinterAnnex(repayer, false);

            uint actualBurnAmount;

            uint xaiBalance = ComptrollerLensInterface(address(comptroller)).mintedXAIs(repayer);

            if(xaiBalance > repayXAIAmount) {
                actualBurnAmount = repayXAIAmount;
            } else {
                actualBurnAmount = xaiBalance;
            }

            uint error = comptroller.setMintedXAIOf(repayer, xaiBalance - actualBurnAmount);
            if (error != 0) {
                return error;
            }

            XAI(getXAIAddress()).burn(repayer, actualBurnAmount);
            emit RepayXAI(repayer, actualBurnAmount);

            return uint(Error.NO_ERROR);
        }
    }

    /**
     * @notice Initialize the AnnexXAIState
     */
    function _initializeAnnexXAIState(uint blockNumber) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        if (isAnnexXAIInitialized == false) {
            isAnnexXAIInitialized = true;
            uint xaiBlockNumber = blockNumber == 0 ? getBlockNumber() : blockNumber;
            annexXAIState = AnnexXAIState({
                index: annexInitialIndex,
                block: safe32(xaiBlockNumber, "block number overflows")
            });
        }
    }

    /**
     * @notice Accrue ANN to by updating the XAI minter index
     */
    function updateAnnexXAIMintIndex() public returns (uint) {
        uint xaiMinterSpeed = ComptrollerLensInterface(address(comptroller)).annexXAIRate();
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = sub_(blockNumber, uint(annexXAIState.block));
        if (deltaBlocks > 0 && xaiMinterSpeed > 0) {
            uint xaiAmount = XAI(getXAIAddress()).totalSupply();
            uint annexAccrued = mul_(deltaBlocks, xaiMinterSpeed);
            Double memory ratio = xaiAmount > 0 ? fraction(annexAccrued, xaiAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: annexXAIState.index}), ratio);
            annexXAIState = AnnexXAIState({
                index: safe224(index.mantissa, "new index overflows"),
                block: safe32(blockNumber, "block number overflows")
            });
        } else if (deltaBlocks > 0) {
            annexXAIState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @notice Calculate ANN accrued by a XAI minter
     * @param xaiMinter The address of the XAI minter to distribute ANN to
     */
    function calcDistributeXAIMinterAnnex(address xaiMinter) public returns(uint, uint, uint, uint) {
        // Check caller is comptroller
        if (msg.sender != address(comptroller)) {
            return (fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK), 0, 0, 0);
        }

        Double memory xaiMintIndex = Double({mantissa: annexXAIState.index});
        Double memory xaiMinterIndex = Double({mantissa: annexXAIMinterIndex[xaiMinter]});
        annexXAIMinterIndex[xaiMinter] = xaiMintIndex.mantissa;

        if (xaiMinterIndex.mantissa == 0 && xaiMintIndex.mantissa > 0) {
            xaiMinterIndex.mantissa = annexInitialIndex;
        }

        Double memory deltaIndex = sub_(xaiMintIndex, xaiMinterIndex);
        uint xaiMinterAmount = ComptrollerLensInterface(address(comptroller)).mintedXAIs(xaiMinter);
        uint xaiMinterDelta = mul_(xaiMinterAmount, deltaIndex);
        uint xaiMinterAccrued = add_(ComptrollerLensInterface(address(comptroller)).annexAccrued(xaiMinter), xaiMinterDelta);
        return (uint(Error.NO_ERROR), xaiMinterAccrued, xaiMinterDelta, xaiMintIndex.mantissa);
    }

    /*** Admin Functions ***/

    /**
      * @notice Sets a new comptroller
      * @dev Admin function to set a new comptroller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setComptroller(ComptrollerInterface comptroller_) public returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);

        return uint(Error.NO_ERROR);
    }

    function _become(XAIUnitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can change brains");
        require(unitroller._acceptImplementation() == 0, "change not authorized");
    }

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account total supply balance.
     *  Note that `aTokenBalance` is the number of aTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountAmountLocalVars {
        uint totalSupplyAmount;
        uint sumSupply;
        uint sumBorrowPlusEffects;
        uint aTokenBalance;
        uint borrowBalance;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    function getMintableXAI(address minter) public view returns (uint, uint) {
        PriceOracle oracle = ComptrollerLensInterface(address(comptroller)).oracle();
        AToken[] memory enteredMarkets = ComptrollerLensInterface(address(comptroller)).getAssetsIn(minter);

        AccountAmountLocalVars memory vars; // Holds all our calculation results

        uint oErr;
        MathError mErr;

        uint accountMintableXAI;
        uint i;

        /**
         * We use this formula to calculate mintable XAI amount.
         * totalSupplyAmount * XAIMintRate - (totalBorrowAmount + mintedXAIOf)
         */
        for (i = 0; i < enteredMarkets.length; i++) {
            (oErr, vars.aTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = enteredMarkets[i].getAccountSnapshot(minter);
            if (oErr != 0) { // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (uint(Error.SNAPSHOT_ERROR), 0);
            }
            vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(enteredMarkets[i]);
            if (vars.oraclePriceMantissa == 0) {
                return (uint(Error.PRICE_ERROR), 0);
            }
            vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

            (mErr, vars.tokensToDenom) = mulExp(vars.exchangeRate, vars.oraclePrice);
            if (mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // sumSupply += tokensToDenom * aTokenBalance
            (mErr, vars.sumSupply) = mulScalarTruncateAddUInt(vars.tokensToDenom, vars.aTokenBalance, vars.sumSupply);
            if (mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.oraclePrice, vars.borrowBalance, vars.sumBorrowPlusEffects);
            if (mErr != MathError.NO_ERROR) {
                return (uint(Error.MATH_ERROR), 0);
            }
        }

        (mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, ComptrollerLensInterface(address(comptroller)).mintedXAIs(minter));
        if (mErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (mErr, accountMintableXAI) = mulUInt(vars.sumSupply, ComptrollerLensInterface(address(comptroller)).xaiMintRate());
        require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mErr, accountMintableXAI) = divUInt(accountMintableXAI, 10000);
        require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");


        (mErr, accountMintableXAI) = subUInt(accountMintableXAI, vars.sumBorrowPlusEffects);
        if (mErr != MathError.NO_ERROR) {
            return (uint(Error.REJECTION), 0);
        }

        return (uint(Error.NO_ERROR), accountMintableXAI);
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the XAI token
     * @return The address of XAI
     */
    function getXAIAddress() public view returns (address) {
        return 0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd7;
    }
}
