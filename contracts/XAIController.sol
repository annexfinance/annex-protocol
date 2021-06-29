pragma solidity ^0.5.16;

import "./AToken.sol";
import "./PriceOracle.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./XAIControllerStorage.sol";
import "./XAIUnitroller.sol";
import "./XAI/XAI.sol";

interface ComptrollerImplInterface {
    function protocolPaused() external view returns (bool);
    function mintedXAIs(address account) external view returns (uint);
    function xaiMintRate() external view returns (uint);
    function annexXAIRate() external view returns (uint);
    function annexAccrued(address account) external view returns(uint);
    function getAssetsIn(address account) external view returns (AToken[] memory);
    function oracle() external view returns (PriceOracle);

    function distributeXAIMinterAnnex(address xaiMinter) external;
}

/**
 * @title Annex's XAI Comptroller Contract
 * @author Annex
 */
contract XAIController is XAIControllerStorageG2, XAIControllerErrorReporter, Exponential {

    /// @notice Emitted when Comptroller is changed
    event NewComptroller(ComptrollerInterface oldComptroller, ComptrollerInterface newComptroller);

    /**
     * @notice Event emitted when XAI is minted
     */
    event MintXAI(address minter, uint mintXAIAmount);

    /**
     * @notice Event emitted when XAI is repaid
     */
    event RepayXAI(address payer, address borrower, uint repayXAIAmount);

    /// @notice The initial Annex index for a market
    uint224 public constant annexInitialIndex = 1e36;

    /**
     * @notice Event emitted when a borrow is liquidated
     */
    event LiquidateXAI(address liquidator, address borrower, uint repayAmount, address aTokenCollateral, uint seizeTokens);

    /**
     * @notice Emitted when treasury guardian is changed
     */
    event NewTreasuryGuardian(address oldTreasuryGuardian, address newTreasuryGuardian);

    /**
     * @notice Emitted when treasury address is changed
     */
    event NewTreasuryAddress(address oldTreasuryAddress, address newTreasuryAddress);

    /**
     * @notice Emitted when treasury percent is changed
     */
    event NewTreasuryPercent(uint oldTreasuryPercent, uint newTreasuryPercent);

    /**
     * @notice Event emitted when XAIs are minted and fee are transferred
     */
    event MintFee(address minter, uint feeAmount);

    /*** Main Actions ***/
    struct MintLocalVars {
        Error err;
        MathError mathErr;
        uint mintAmount;
    }

    function mintXAI(uint mintXAIAmount) external nonReentrant returns (uint) {
        if(address(comptroller) != address(0)) {
            require(mintXAIAmount > 0, "mintXAIAmount cannt be zero");

            require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            MintLocalVars memory vars;

            address minter = msg.sender;

            // Keep the flywheel moving
            updateAnnexXAIMintIndex();
            ComptrollerImplInterface(address(comptroller)).distributeXAIMinterAnnex(minter);

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

            (mErr, accountMintXAINew) = addUInt(ComptrollerImplInterface(address(comptroller)).mintedXAIs(minter), mintXAIAmount);
            require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");
            uint error = comptroller.setMintedXAIOf(minter, accountMintXAINew);
            if (error != 0 ) {
                return error;
            }

            uint feeAmount;
            uint remainedAmount;
            vars.mintAmount = mintXAIAmount;
            if (treasuryPercent != 0) {
                (vars.mathErr, feeAmount) = mulUInt(vars.mintAmount, treasuryPercent);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                (vars.mathErr, feeAmount) = divUInt(feeAmount, 1e18);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                (vars.mathErr, remainedAmount) = subUInt(vars.mintAmount, feeAmount);
                if (vars.mathErr != MathError.NO_ERROR) {
                    return failOpaque(Error.MATH_ERROR, FailureInfo.MINT_FEE_CALCULATION_FAILED, uint(vars.mathErr));
                }

                XAI(getXAIAddress()).mint(treasuryAddress, feeAmount);

                emit MintFee(minter, feeAmount);
            } else {
                remainedAmount = vars.mintAmount;
            }

            XAI(getXAIAddress()).mint(minter, remainedAmount);

            emit MintXAI(minter, remainedAmount);

            return uint(Error.NO_ERROR);
        }
    }

    /**
     * @notice Repay XAI
     */
    function repayXAI(uint repayXAIAmount) external nonReentrant returns (uint, uint) {
        if(address(comptroller) != address(0)) {
            require(repayXAIAmount > 0, "repayXAIAmount cannt be zero");

            require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

            address payer = msg.sender;

            updateAnnexXAIMintIndex();
            ComptrollerImplInterface(address(comptroller)).distributeXAIMinterAnnex(payer);

            return repayXAIFresh(msg.sender, msg.sender, repayXAIAmount);
        }
    }

    /**
     * @notice Repay XAI Internal
     * @notice Borrowed XAIs are repaid by another user (possibly the borrower).
     * @param payer the account paying off the XAI
     * @param borrower the account with the debt being payed off
     * @param repayAmount the amount of XAI being returned
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function repayXAIFresh(address payer, address borrower, uint repayAmount) internal returns (uint, uint) {
        uint actualBurnAmount;

        uint xaiBalanceBorrower = ComptrollerImplInterface(address(comptroller)).mintedXAIs(borrower);

        if(xaiBalanceBorrower > repayAmount) {
            actualBurnAmount = repayAmount;
        } else {
            actualBurnAmount = xaiBalanceBorrower;
        }

        MathError mErr;
        uint accountXAINew;

        XAI(getXAIAddress()).burn(payer, actualBurnAmount);

        (mErr, accountXAINew) = subUInt(xaiBalanceBorrower, actualBurnAmount);
        require(mErr == MathError.NO_ERROR, "XAI_BURN_AMOUNT_CALCULATION_FAILED");

        uint error = comptroller.setMintedXAIOf(borrower, accountXAINew);
        if (error != 0) {
            return (error, 0);
        }
        emit RepayXAI(payer, borrower, actualBurnAmount);

        return (uint(Error.NO_ERROR), actualBurnAmount);
    }

    /**
     * @notice The sender liquidates the xai minters collateral.
     *  The collateral seized is transferred to the liquidator.
     * @param borrower The borrower of xai to be liquidated
     * @param aTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the underlying borrowed asset to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment amount.
     */
    function liquidateXAI(address borrower, uint repayAmount, ATokenInterface aTokenCollateral) external nonReentrant returns (uint, uint) {
        require(!ComptrollerImplInterface(address(comptroller)).protocolPaused(), "protocol is paused");

        uint error = aTokenCollateral.accrueInterest();
        if (error != uint(Error.NO_ERROR)) {
            // accrueInterest emits logs on errors, but we still want to log the fact that an attempted liquidation failed
            return (fail(Error(error), FailureInfo.XAI_LIQUIDATE_ACCRUE_COLLATERAL_INTEREST_FAILED), 0);
        }

        // liquidateXAIFresh emits borrow-specific logs on errors, so we don't need to
        return liquidateXAIFresh(msg.sender, borrower, repayAmount, aTokenCollateral);
    }

    /**
     * @notice The liquidator liquidates the borrowers collateral by repay borrowers XAI.
     *  The collateral seized is transferred to the liquidator.
     * @param liquidator The address repaying the XAI and seizing collateral
     * @param borrower The borrower of this XAI to be liquidated
     * @param aTokenCollateral The market in which to seize collateral from the borrower
     * @param repayAmount The amount of the XAI to repay
     * @return (uint, uint) An error code (0=success, otherwise a failure, see ErrorReporter.sol), and the actual repayment XAI.
     */
    function liquidateXAIFresh(address liquidator, address borrower, uint repayAmount, ATokenInterface aTokenCollateral) internal returns (uint, uint) {
        if(address(comptroller) != address(0)) {
            /* Fail if liquidate not allowed */
            uint allowed = comptroller.liquidateBorrowAllowed(address(this), address(aTokenCollateral), liquidator, borrower, repayAmount);
            if (allowed != 0) {
                return (failOpaque(Error.REJECTION, FailureInfo.XAI_LIQUIDATE_COMPTROLLER_REJECTION, allowed), 0);
            }

            /* Verify aTokenCollateral market's block number equals current block number */
            //if (aTokenCollateral.accrualBlockNumber() != accrualBlockNumber) {
            if (aTokenCollateral.accrualBlockNumber() != getBlockNumber()) {
                return (fail(Error.REJECTION, FailureInfo.XAI_LIQUIDATE_COLLATERAL_FRESHNESS_CHECK), 0);
            }

            /* Fail if borrower = liquidator */
            if (borrower == liquidator) {
                return (fail(Error.REJECTION, FailureInfo.XAI_LIQUIDATE_LIQUIDATOR_IS_BORROWER), 0);
            }

            /* Fail if repayAmount = 0 */
            if (repayAmount == 0) {
                return (fail(Error.REJECTION, FailureInfo.XAI_LIQUIDATE_CLOSE_AMOUNT_IS_ZERO), 0);
            }

            /* Fail if repayAmount = -1 */
            if (repayAmount == uint(-1)) {
                return (fail(Error.REJECTION, FailureInfo.XAI_LIQUIDATE_CLOSE_AMOUNT_IS_UINT_MAX), 0);
            }


            /* Fail if repayXAI fails */
            (uint repayBorrowError, uint actualRepayAmount) = repayXAIFresh(liquidator, borrower, repayAmount);
            if (repayBorrowError != uint(Error.NO_ERROR)) {
                return (fail(Error(repayBorrowError), FailureInfo.XAI_LIQUIDATE_REPAY_BORROW_FRESH_FAILED), 0);
            }

            /////////////////////////
            // EFFECTS & INTERACTIONS
            // (No safe failures beyond this point)

            /* We calculate the number of collateral tokens that will be seized */
            (uint amountSeizeError, uint seizeTokens) = comptroller.liquidateXAICalculateSeizeTokens(address(aTokenCollateral), actualRepayAmount);
            require(amountSeizeError == uint(Error.NO_ERROR), "XAI_LIQUIDATE_COMPTROLLER_CALCULATE_AMOUNT_SEIZE_FAILED");

            /* Revert if borrower collateral token balance < seizeTokens */
            require(aTokenCollateral.balanceOf(borrower) >= seizeTokens, "XAI_LIQUIDATE_SEIZE_TOO_MUCH");

            uint seizeError;
            seizeError = aTokenCollateral.seize(liquidator, borrower, seizeTokens);

            /* Revert if seize tokens fails (since we cannot be sure of side effects) */
            require(seizeError == uint(Error.NO_ERROR), "token seizure failed");

            /* We emit a LiquidateBorrow event */
            emit LiquidateXAI(liquidator, borrower, actualRepayAmount, address(aTokenCollateral), seizeTokens);

            /* We call the defense hook */
            comptroller.liquidateBorrowVerify(address(this), address(aTokenCollateral), liquidator, borrower, actualRepayAmount, seizeTokens);

            return (uint(Error.NO_ERROR), actualRepayAmount);
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

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Accrue ANN to by updating the XAI minter index
     */
    function updateAnnexXAIMintIndex() public returns (uint) {
        uint xaiMinterSpeed = ComptrollerImplInterface(address(comptroller)).annexXAIRate();
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

        return uint(Error.NO_ERROR);
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
        uint xaiMinterAmount = ComptrollerImplInterface(address(comptroller)).mintedXAIs(xaiMinter);
        uint xaiMinterDelta = mul_(xaiMinterAmount, deltaIndex);
        uint xaiMinterAccrued = add_(ComptrollerImplInterface(address(comptroller)).annexAccrued(xaiMinter), xaiMinterDelta);
        return (uint(Error.NO_ERROR), xaiMinterAccrued, xaiMinterDelta, xaiMintIndex.mantissa);
    }

    /*** Admin Functions ***/

    /**
      * @notice Sets a new comptroller
      * @dev Admin function to set a new comptroller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setComptroller(ComptrollerInterface comptroller_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COMPTROLLER_OWNER_CHECK);
        }

        ComptrollerInterface oldComptroller = comptroller;
        comptroller = comptroller_;
        emit NewComptroller(oldComptroller, comptroller_);

        return uint(Error.NO_ERROR);
    }

    function _become(XAIUnitroller unitroller) external {
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
        PriceOracle oracle = ComptrollerImplInterface(address(comptroller)).oracle();
        AToken[] memory enteredMarkets = ComptrollerImplInterface(address(comptroller)).getAssetsIn(minter);

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

        (mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, ComptrollerImplInterface(address(comptroller)).mintedXAIs(minter));
        if (mErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (mErr, accountMintableXAI) = mulUInt(vars.sumSupply, ComptrollerImplInterface(address(comptroller)).xaiMintRate());
        require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");

        (mErr, accountMintableXAI) = divUInt(accountMintableXAI, 10000);
        require(mErr == MathError.NO_ERROR, "XAI_MINT_AMOUNT_CALCULATION_FAILED");


        (mErr, accountMintableXAI) = subUInt(accountMintableXAI, vars.sumBorrowPlusEffects);
        if (mErr != MathError.NO_ERROR) {
            return (uint(Error.REJECTION), 0);
        }

        return (uint(Error.NO_ERROR), accountMintableXAI);
    }

    function _setTreasuryData(address newTreasuryGuardian, address newTreasuryAddress, uint newTreasuryPercent) external returns (uint) {
        // Check caller is admin
        if (!(msg.sender == admin || msg.sender == treasuryGuardian)) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_TREASURY_OWNER_CHECK);
        }

        require(newTreasuryPercent < 1e18, "treasury percent cap overflow");

        address oldTreasuryGuardian = treasuryGuardian;
        address oldTreasuryAddress = treasuryAddress;
        uint oldTreasuryPercent = treasuryPercent;

        treasuryGuardian = newTreasuryGuardian;
        treasuryAddress = newTreasuryAddress;
        treasuryPercent = newTreasuryPercent;

        emit NewTreasuryGuardian(oldTreasuryGuardian, newTreasuryGuardian);
        emit NewTreasuryAddress(oldTreasuryAddress, newTreasuryAddress);
        emit NewTreasuryPercent(oldTreasuryPercent, newTreasuryPercent);

        return uint(Error.NO_ERROR);
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

    function initialize() onlyAdmin public {
        // The counter starts true to prevent changing it from zero to non-zero (i.e. smaller cost/refund)
        _notEntered = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    /*** Reentrancy Guard ***/

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_notEntered, "re-entered");
        _notEntered = false;
        _;
        _notEntered = true; // get a gas-refund post-Istanbul
    }
}
