pragma solidity ^0.5.16;

import "./AToken.sol";
import "./ErrorReporter.sol";
import "./Exponential.sol";
import "./PriceOracle.sol";
import "./ComptrollerInterface.sol";
import "./ComptrollerStorage.sol";
import "./Unitroller.sol";
import "./Governance/ANN.sol";
import "./XAI/XAI.sol";

/**
 * @title Annex's Comptroller Contract
 * @author Annex
 */
contract ComptrollerG2 is ComptrollerV1Storage, ComptrollerInterfaceG1, ComptrollerErrorReporter, Exponential {
    /// @notice Emitted when an admin supports a market
    event MarketListed(AToken aToken);

    /// @notice Emitted when an account enters a market
    event MarketEntered(AToken aToken, address account);

    /// @notice Emitted when an account exits a market
    event MarketExited(AToken aToken, address account);

    /// @notice Emitted when close factor is changed by admin
    event NewCloseFactor(uint oldCloseFactorMantissa, uint newCloseFactorMantissa);

    /// @notice Emitted when a collateral factor is changed by admin
    event NewCollateralFactor(AToken aToken, uint oldCollateralFactorMantissa, uint newCollateralFactorMantissa);

    /// @notice Emitted when liquidation incentive is changed by admin
    event NewLiquidationIncentive(uint oldLiquidationIncentiveMantissa, uint newLiquidationIncentiveMantissa);

    /// @notice Emitted when maxAssets is changed by admin
    event NewMaxAssets(uint oldMaxAssets, uint newMaxAssets);

    /// @notice Emitted when price oracle is changed
    event NewPriceOracle(PriceOracle oldPriceOracle, PriceOracle newPriceOracle);

    /// @notice Emitted when pause guardian is changed
    event NewPauseGuardian(address oldPauseGuardian, address newPauseGuardian);

    /// @notice Emitted when an action is paused globally
    event ActionPaused(string action, bool pauseState);

    /// @notice Emitted when an action is paused on a market
    event ActionPaused(AToken aToken, string action, bool pauseState);

    /// @notice Emitted when market annex status is changed
    event MarketAnnex(AToken aToken, bool isAnnex);

    /// @notice Emitted when Annex rate is changed
    event NewAnnexRate(uint oldAnnexRate, uint newAnnexRate);

    /// @notice Emitted when Annex XAI rate is changed
    event NewAnnexXAIRate(uint oldAnnexXAIRate, uint newAnnexXAIRate);

    /// @notice Emitted when a new Annex speed is calculated for a market
    event AnnexSpeedUpdated(AToken indexed aToken, uint newSpeed);

    /// @notice Emitted when ANN is distributed to a supplier
    event DistributedSupplierAnnex(AToken indexed aToken, address indexed supplier, uint annexDelta, uint annexSupplyIndex);

    /// @notice Emitted when ANN is distributed to a borrower
    event DistributedBorrowerAnnex(AToken indexed aToken, address indexed borrower, uint annexDelta, uint annexBorrowIndex);

    /// @notice Emitted when ANN is distributed to a XAI minter
    event DistributedXAIMinterAnnex(address indexed xaiMinter, uint annexDelta, uint annexXAIMintIndex);

    /// @notice Emitted when XAIController is changed
    event NewXAIController(XAIControllerInterface oldXAIController, XAIControllerInterface newXAIController);

    /// @notice Emitted when XAI mint rate is changed by admin
    event NewXAIMintRate(uint oldXAIMintRate, uint newXAIMintRate);

    /// @notice Emitted when protocol state is changed by admin
    event ActionProtocolPaused(bool state);

    /// @notice The threshold above which the flywheel transfers ANN, in wei
    uint public constant annexClaimThreshold = 0.001e18;

    /// @notice The initial Annex index for a market
    uint224 public constant annexInitialIndex = 1e36;

    // closeFactorMantissa must be strictly greater than this value
    uint internal constant closeFactorMinMantissa = 0.05e18; // 0.05

    // closeFactorMantissa must not exceed this value
    uint internal constant closeFactorMaxMantissa = 0.9e18; // 0.9

    // No collateralFactorMantissa may exceed this value
    uint internal constant collateralFactorMaxMantissa = 0.9e18; // 0.9

    // liquidationIncentiveMantissa must be no less than this value
    uint internal constant liquidationIncentiveMinMantissa = 1.0e18; // 1.0

    // liquidationIncentiveMantissa must be no greater than this value
    uint internal constant liquidationIncentiveMaxMantissa = 1.5e18; // 1.5

    constructor() public {
        admin = msg.sender;
    }

    modifier onlyProtocolAllowed {
        require(!protocolPaused, "protocol is paused");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin can");
        _;
    }

    modifier onlyListedMarket(AToken aToken) {
        require(markets[address(aToken)].isListed, "annex market is not listed");
        _;
    }

    modifier validPauseState(bool state) {
        require(msg.sender == pauseGuardian || msg.sender == admin, "only pause guardian and admin can");
        require(msg.sender == admin || state == true, "only admin can unpause");
        _;
    }

    /*** Assets You Are In ***/

    /**
     * @notice Returns the assets an account has entered
     * @param account The address of the account to pull assets for
     * @return A dynamic list with the assets the account has entered
     */
    function getAssetsIn(address account) external view returns (AToken[] memory) {
        return accountAssets[account];
    }

    /**
     * @notice Returns whether the given account is entered in the given asset
     * @param account The address of the account to check
     * @param aToken The aToken to check
     * @return True if the account is in the asset, otherwise false.
     */
    function checkMembership(address account, AToken aToken) external view returns (bool) {
        return markets[address(aToken)].accountMembership[account];
    }

    /**
     * @notice Add assets to be included in account liquidity calculation
     * @param aTokens The list of addresses of the aToken markets to be enabled
     * @return Success indicator for whether each corresponding market was entered
     */
    function enterMarkets(address[] calldata aTokens) external returns (uint[] memory) {
        uint len = aTokens.length;

        uint[] memory results = new uint[](len);
        for (uint i = 0; i < len; i++) {
            results[i] = uint(addToMarketInternal(AToken(aTokens[i]), msg.sender));
        }

        return results;
    }

    /**
     * @notice Add the market to the borrower's "assets in" for liquidity calculations
     * @param aToken The market to enter
     * @param borrower The address of the account to modify
     * @return Success indicator for whether the market was entered
     */
    function addToMarketInternal(AToken aToken, address borrower) internal returns (Error) {
        Market storage marketToJoin = markets[address(aToken)];

        if (!marketToJoin.isListed) {
            // market is not listed, cannot join
            return Error.MARKET_NOT_LISTED;
        }

        if (marketToJoin.accountMembership[borrower]) {
            // already joined
            return Error.NO_ERROR;
        }

        if (accountAssets[borrower].length >= maxAssets)  {
            // no space, cannot join
            return Error.TOO_MANY_ASSETS;
        }

        // survived the gauntlet, add to list
        // NOTE: we store these somewhat redundantly as a significant optimization
        //  this avoids having to iterate through the list for the most common use cases
        //  that is, only when we need to perform liquidity checks
        //  and not whenever we want to check if an account is in a particular market
        marketToJoin.accountMembership[borrower] = true;
        accountAssets[borrower].push(aToken);

        emit MarketEntered(aToken, borrower);

        return Error.NO_ERROR;
    }

    /**
     * @notice Removes asset from sender's account liquidity calculation
     * @dev Sender must not have an outstanding borrow balance in the asset,
     *  or be providing necessary collateral for an outstanding borrow.
     * @param aTokenAddress The address of the asset to be removed
     * @return Whether or not the account successfully exited the market
     */
    function exitMarket(address aTokenAddress) external returns (uint) {
        AToken aToken = AToken(aTokenAddress);
        /* Get sender tokensHeld and amountOwed underlying from the aToken */
        (uint oErr, uint tokensHeld, uint amountOwed, ) = aToken.getAccountSnapshot(msg.sender);
        require(oErr == 0, "getAccountSnapshot failed"); // semi-opaque error code

        /* Fail if the sender has a borrow balance */
        if (amountOwed != 0) {
            return fail(Error.NONZERO_BORROW_BALANCE, FailureInfo.EXIT_MARKET_BALANCE_OWED);
        }

        /* Fail if the sender is not permitted to redeem all of their tokens */
        uint allowed = redeemAllowedInternal(aTokenAddress, msg.sender, tokensHeld);
        if (allowed != 0) {
            return failOpaque(Error.REJECTION, FailureInfo.EXIT_MARKET_REJECTION, allowed);
        }

        Market storage marketToExit = markets[address(aToken)];

        /* Return true if the sender is not already ‘in’ the market */
        if (!marketToExit.accountMembership[msg.sender]) {
            return uint(Error.NO_ERROR);
        }

        /* Set aToken account membership to false */
        delete marketToExit.accountMembership[msg.sender];

        /* Delete aToken from the account’s list of assets */
        // In order to delete aToken, copy last item in list to location of item to be removed, reduce length by 1
        AToken[] storage userAssetList = accountAssets[msg.sender];
        uint len = userAssetList.length;
        uint i;
        for (; i < len; i++) {
            if (userAssetList[i] == aToken) {
                userAssetList[i] = userAssetList[len - 1];
                userAssetList.length--;
                break;
            }
        }

        // We *must* have found the asset in the list or our redundant data structure is broken
        assert(i < len);

        emit MarketExited(aToken, msg.sender);

        return uint(Error.NO_ERROR);
    }

    /*** Policy Hooks ***/

    /**
     * @notice Checks if the account should be allowed to mint tokens in the given market
     * @param aToken The market to verify the mint against
     * @param minter The account which would get the minted tokens
     * @param mintAmount The amount of underlying being supplied to the market in exchange for tokens
     * @return 0 if the mint is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function mintAllowed(address aToken, address minter, uint mintAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintGuardianPaused[aToken], "mint is paused");

        // Shh - currently unused
        mintAmount;

        if (!markets[aToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        // Keep the flywheel moving
        updateAnnexSupplyIndex(aToken);
        distributeSupplierAnnex(aToken, minter, false);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates mint and reverts on rejection. May emit logs.
     * @param aToken Asset being minted
     * @param minter The address minting the tokens
     * @param actualMintAmount The amount of the underlying asset being minted
     * @param mintTokens The number of tokens being minted
     */
    function mintVerify(address aToken, address minter, uint actualMintAmount, uint mintTokens) external {
        // Shh - currently unused
        aToken;
        minter;
        actualMintAmount;
        mintTokens;
    }

    /**
     * @notice Checks if the account should be allowed to redeem tokens in the given market
     * @param aToken The market to verify the redeem against
     * @param redeemer The account which would redeem the tokens
     * @param redeemTokens The number of aTokens to exchange for the underlying asset in the market
     * @return 0 if the redeem is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function redeemAllowed(address aToken, address redeemer, uint redeemTokens) external onlyProtocolAllowed returns (uint) {
        uint allowed = redeemAllowedInternal(aToken, redeemer, redeemTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateAnnexSupplyIndex(aToken);
        distributeSupplierAnnex(aToken, redeemer, false);

        return uint(Error.NO_ERROR);
    }

    function redeemAllowedInternal(address aToken, address redeemer, uint redeemTokens) internal view returns (uint) {
        if (!markets[aToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        /* If the redeemer is not 'in' the market, then we can bypass the liquidity check */
        if (!markets[aToken].accountMembership[redeemer]) {
            return uint(Error.NO_ERROR);
        }

        /* Otherwise, perform a hypothetical liquidity check to guard against shortfall */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(redeemer, AToken(aToken), redeemTokens, 0);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates redeem and reverts on rejection. May emit logs.
     * @param aToken Asset being redeemed
     * @param redeemer The address redeeming the tokens
     * @param redeemAmount The amount of the underlying asset being redeemed
     * @param redeemTokens The number of tokens being redeemed
     */
    function redeemVerify(address aToken, address redeemer, uint redeemAmount, uint redeemTokens) external {
        // Shh - currently unused
        aToken;
        redeemer;

        // Require tokens is zero or amount is also zero
        require(redeemTokens != 0 || redeemAmount == 0, "redeemTokens zero");
    }

    /**
     * @notice Checks if the account should be allowed to borrow the underlying asset of the given market
     * @param aToken The market to verify the borrow against
     * @param borrower The account which would borrow the asset
     * @param borrowAmount The amount of underlying the account would borrow
     * @return 0 if the borrow is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function borrowAllowed(address aToken, address borrower, uint borrowAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!borrowGuardianPaused[aToken], "borrow is paused");

        if (!markets[aToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        if (!markets[aToken].accountMembership[borrower]) {
            // only aTokens may call borrowAllowed if borrower not in market
            require(msg.sender == aToken, "sender must be aToken");

            // attempt to add borrower to the market
            Error err = addToMarketInternal(AToken(aToken), borrower);
            if (err != Error.NO_ERROR) {
                return uint(err);
            }
        }

        if (oracle.getUnderlyingPrice(AToken(aToken)) == 0) {
            return uint(Error.PRICE_ERROR);
        }

        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, AToken(aToken), 0, borrowAmount);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall != 0) {
            return uint(Error.INSUFFICIENT_LIQUIDITY);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({mantissa: AToken(aToken).borrowIndex()});
        updateAnnexBorrowIndex(aToken, borrowIndex);
        distributeBorrowerAnnex(aToken, borrower, borrowIndex, false);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates borrow and reverts on rejection. May emit logs.
     * @param aToken Asset whose underlying is being borrowed
     * @param borrower The address borrowing the underlying
     * @param borrowAmount The amount of the underlying asset requested to borrow
     */
    function borrowVerify(address aToken, address borrower, uint borrowAmount) external {
        // Shh - currently unused
        aToken;
        borrower;
        borrowAmount;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to repay a borrow in the given market
     * @param aToken The market to verify the repay against
     * @param payer The account which would repay the asset
     * @param borrower The account which would repay the asset
     * @param repayAmount The amount of the underlying asset the account would repay
     * @return 0 if the repay is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function repayBorrowAllowed(
        address aToken,
        address payer,
        address borrower,
        uint repayAmount) external onlyProtocolAllowed returns (uint) {
        // Shh - currently unused
        payer;
        borrower;
        repayAmount;

        if (!markets[aToken].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        // Keep the flywheel moving
        Exp memory borrowIndex = Exp({mantissa: AToken(aToken).borrowIndex()});
        updateAnnexBorrowIndex(aToken, borrowIndex);
        distributeBorrowerAnnex(aToken, borrower, borrowIndex, false);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates repayBorrow and reverts on rejection. May emit logs.
     * @param aToken Asset being repaid
     * @param payer The address repaying the borrow
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function repayBorrowVerify(
        address aToken,
        address payer,
        address borrower,
        uint actualRepayAmount,
        uint borrowerIndex) external {
        // Shh - currently unused
        aToken;
        payer;
        borrower;
        actualRepayAmount;
        borrowerIndex;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the liquidation should be allowed to occur
     * @param aTokenBorrowed Asset which was borrowed by the borrower
     * @param aTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param repayAmount The amount of underlying being repaid
     */
    function liquidateBorrowAllowed(
        address aTokenBorrowed,
        address aTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount) external onlyProtocolAllowed returns (uint) {
        // Shh - currently unused
        liquidator;

        if (!markets[aTokenBorrowed].isListed || !markets[aTokenCollateral].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        /* The borrower must have shortfall in order to be liquidatable */
        (Error err, , uint shortfall) = getHypotheticalAccountLiquidityInternal(borrower, AToken(0), 0, 0);
        if (err != Error.NO_ERROR) {
            return uint(err);
        }
        if (shortfall == 0) {
            return uint(Error.INSUFFICIENT_SHORTFALL);
        }

        /* The liquidator may not repay more than what is allowed by the closeFactor */
        uint borrowBalance = AToken(aTokenBorrowed).borrowBalanceStored(borrower);
        (MathError mathErr, uint maxClose) = mulScalarTruncate(Exp({mantissa: closeFactorMantissa}), borrowBalance);
        if (mathErr != MathError.NO_ERROR) {
            return uint(Error.MATH_ERROR);
        }
        if (repayAmount > maxClose) {
            return uint(Error.TOO_MUCH_REPAY);
        }

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates liquidateBorrow and reverts on rejection. May emit logs.
     * @param aTokenBorrowed Asset which was borrowed by the borrower
     * @param aTokenCollateral Asset which was used as collateral and will be seized
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param actualRepayAmount The amount of underlying being repaid
     */
    function liquidateBorrowVerify(
        address aTokenBorrowed,
        address aTokenCollateral,
        address liquidator,
        address borrower,
        uint actualRepayAmount,
        uint seizeTokens) external {
        // Shh - currently unused
        aTokenBorrowed;
        aTokenCollateral;
        liquidator;
        borrower;
        actualRepayAmount;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the seizing of assets should be allowed to occur
     * @param aTokenCollateral Asset which was used as collateral and will be seized
     * @param aTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeAllowed(
        address aTokenCollateral,
        address aTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!seizeGuardianPaused, "seize is paused");

        // Shh - currently unused
        seizeTokens;

        if (!markets[aTokenCollateral].isListed || !markets[aTokenBorrowed].isListed) {
            return uint(Error.MARKET_NOT_LISTED);
        }

        if (AToken(aTokenCollateral).comptroller() != AToken(aTokenBorrowed).comptroller()) {
            return uint(Error.COMPTROLLER_MISMATCH);
        }

        // Keep the flywheel moving
        updateAnnexSupplyIndex(aTokenCollateral);
        distributeSupplierAnnex(aTokenCollateral, borrower, false);
        distributeSupplierAnnex(aTokenCollateral, liquidator, false);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates seize and reverts on rejection. May emit logs.
     * @param aTokenCollateral Asset which was used as collateral and will be seized
     * @param aTokenBorrowed Asset which was borrowed by the borrower
     * @param liquidator The address repaying the borrow and seizing the collateral
     * @param borrower The address of the borrower
     * @param seizeTokens The number of collateral tokens to seize
     */
    function seizeVerify(
        address aTokenCollateral,
        address aTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external {
        // Shh - currently unused
        aTokenCollateral;
        aTokenBorrowed;
        liquidator;
        borrower;
        seizeTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /**
     * @notice Checks if the account should be allowed to transfer tokens in the given market
     * @param aToken The market to verify the transfer against
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of aTokens to transfer
     * @return 0 if the transfer is allowed, otherwise a semi-opaque error code (See ErrorReporter.sol)
     */
    function transferAllowed(address aToken, address src, address dst, uint transferTokens) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!transferGuardianPaused, "transfer is paused");

        // Currently the only consideration is whether or not
        //  the src is allowed to redeem this many tokens
        uint allowed = redeemAllowedInternal(aToken, src, transferTokens);
        if (allowed != uint(Error.NO_ERROR)) {
            return allowed;
        }

        // Keep the flywheel moving
        updateAnnexSupplyIndex(aToken);
        distributeSupplierAnnex(aToken, src, false);
        distributeSupplierAnnex(aToken, dst, false);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Validates transfer and reverts on rejection. May emit logs.
     * @param aToken Asset being transferred
     * @param src The account which sources the tokens
     * @param dst The account which receives the tokens
     * @param transferTokens The number of aTokens to transfer
     */
    function transferVerify(address aToken, address src, address dst, uint transferTokens) external {
        // Shh - currently unused
        aToken;
        src;
        dst;
        transferTokens;

        // Shh - we don't ever want this hook to be marked pure
        if (false) {
            maxAssets = maxAssets;
        }
    }

    /*** Liquidity/Liquidation Calculations ***/

    /**
     * @dev Local vars for avoiding stack-depth limits in calculating account liquidity.
     *  Note that `aTokenBalance` is the number of aTokens the account owns in the market,
     *  whereas `borrowBalance` is the amount of underlying that the account has borrowed.
     */
    struct AccountLiquidityLocalVars {
        uint sumCollateral;
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

    /**
     * @notice Determine the current account liquidity wrt collateral requirements
     * @return (possible error code (semi-opaque),
                account liquidity in excess of collateral requirements,
     *          account shortfall below collateral requirements)
     */
    function getAccountLiquidity(address account) public view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(account, AToken(0), 0, 0);

        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param aTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @return (possible error code (semi-opaque),
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidity(
        address account,
        address aTokenModify,
        uint redeemTokens,
        uint borrowAmount) public view returns (uint, uint, uint) {
        (Error err, uint liquidity, uint shortfall) = getHypotheticalAccountLiquidityInternal(account, AToken(aTokenModify), redeemTokens, borrowAmount);
        return (uint(err), liquidity, shortfall);
    }

    /**
     * @notice Determine what the account liquidity would be if the given amounts were redeemed/borrowed
     * @param aTokenModify The market to hypothetically redeem/borrow in
     * @param account The account to determine liquidity for
     * @param redeemTokens The number of tokens to hypothetically redeem
     * @param borrowAmount The amount of underlying to hypothetically borrow
     * @dev Note that we calculate the exchangeRateStored for each collateral aToken using stored data,
     *  without calculating accumulated interest.
     * @return (possible error code,
                hypothetical account liquidity in excess of collateral requirements,
     *          hypothetical account shortfall below collateral requirements)
     */
    function getHypotheticalAccountLiquidityInternal(
        address account,
        AToken aTokenModify,
        uint redeemTokens,
        uint borrowAmount) internal view returns (Error, uint, uint) {

        AccountLiquidityLocalVars memory vars; // Holds all our calculation results
        uint oErr;
        MathError mErr;

        // For each asset the account is in
        AToken[] memory assets = accountAssets[account];
        for (uint i = 0; i < assets.length; i++) {
            AToken asset = assets[i];

            // Read the balances and exchange rate from the aToken
            (oErr, vars.aTokenBalance, vars.borrowBalance, vars.exchangeRateMantissa) = asset.getAccountSnapshot(account);
            if (oErr != 0) { // semi-opaque error code, we assume NO_ERROR == 0 is invariant between upgrades
                return (Error.SNAPSHOT_ERROR, 0, 0);
            }
            vars.collateralFactor = Exp({mantissa: markets[address(asset)].collateralFactorMantissa});
            vars.exchangeRate = Exp({mantissa: vars.exchangeRateMantissa});

            // Get the normalized price of the asset
            vars.oraclePriceMantissa = oracle.getUnderlyingPrice(asset);
            if (vars.oraclePriceMantissa == 0) {
                return (Error.PRICE_ERROR, 0, 0);
            }
            vars.oraclePrice = Exp({mantissa: vars.oraclePriceMantissa});

            // Pre-compute a conversion factor from tokens -> bnb (normalized price value)
            (mErr, vars.tokensToDenom) = mulExp3(vars.collateralFactor, vars.exchangeRate, vars.oraclePrice);
            if (mErr != MathError.NO_ERROR) {
                return (Error.MATH_ERROR, 0, 0);
            }

            // sumCollateral += tokensToDenom * aTokenBalance
            (mErr, vars.sumCollateral) = mulScalarTruncateAddUInt(vars.tokensToDenom, vars.aTokenBalance, vars.sumCollateral);
            if (mErr != MathError.NO_ERROR) {
                return (Error.MATH_ERROR, 0, 0);
            }

            // sumBorrowPlusEffects += oraclePrice * borrowBalance
            (mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.oraclePrice, vars.borrowBalance, vars.sumBorrowPlusEffects);
            if (mErr != MathError.NO_ERROR) {
                return (Error.MATH_ERROR, 0, 0);
            }

            // Calculate effects of interacting with aTokenModify
            if (asset == aTokenModify) {
                // redeem effect
                // sumBorrowPlusEffects += tokensToDenom * redeemTokens
                (mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.tokensToDenom, redeemTokens, vars.sumBorrowPlusEffects);
                if (mErr != MathError.NO_ERROR) {
                    return (Error.MATH_ERROR, 0, 0);
                }

                // borrow effect
                // sumBorrowPlusEffects += oraclePrice * borrowAmount
                (mErr, vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(vars.oraclePrice, borrowAmount, vars.sumBorrowPlusEffects);
                if (mErr != MathError.NO_ERROR) {
                    return (Error.MATH_ERROR, 0, 0);
                }
            }
        }

        /// @dev XAI Integration^
        (mErr, vars.sumBorrowPlusEffects) = addUInt(vars.sumBorrowPlusEffects, mintedXAIs[account]);
        if (mErr != MathError.NO_ERROR) {
            return (Error.MATH_ERROR, 0, 0);
        }
        /// @dev XAI Integration$

        // These are safe, as the underflow condition is checked first
        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (Error.NO_ERROR, vars.sumCollateral - vars.sumBorrowPlusEffects, 0);
        } else {
            return (Error.NO_ERROR, 0, vars.sumBorrowPlusEffects - vars.sumCollateral);
        }
    }

    /**
     * @notice Calculate number of tokens of collateral asset to seize given an underlying amount
     * @dev Used in liquidation (called in aToken.liquidateBorrowFresh)
     * @param aTokenBorrowed The address of the borrowed aToken
     * @param aTokenCollateral The address of the collateral aToken
     * @param actualRepayAmount The amount of aTokenBorrowed underlying to convert into aTokenCollateral tokens
     * @return (errorCode, number of aTokenCollateral tokens to be seized in a liquidation)
     */
    function liquidateCalculateSeizeTokens(address aTokenBorrowed, address aTokenCollateral, uint actualRepayAmount) external view returns (uint, uint) {
        /* Read oracle prices for borrowed and collateral markets */
        uint priceBorrowedMantissa = oracle.getUnderlyingPrice(AToken(aTokenBorrowed));
        uint priceCollateralMantissa = oracle.getUnderlyingPrice(AToken(aTokenCollateral));
        if (priceBorrowedMantissa == 0 || priceCollateralMantissa == 0) {
            return (uint(Error.PRICE_ERROR), 0);
        }

        /*
         * Get the exchange rate and calculate the number of collateral tokens to seize:
         *  seizeAmount = actualRepayAmount * liquidationIncentive * priceBorrowed / priceCollateral
         *  seizeTokens = seizeAmount / exchangeRate
         *   = actualRepayAmount * (liquidationIncentive * priceBorrowed) / (priceCollateral * exchangeRate)
         */
        uint exchangeRateMantissa = AToken(aTokenCollateral).exchangeRateStored(); // Note: reverts on error
        uint seizeTokens;
        Exp memory numerator;
        Exp memory denominator;
        Exp memory ratio;
        MathError mathErr;

        (mathErr, numerator) = mulExp(liquidationIncentiveMantissa, priceBorrowedMantissa);
        if (mathErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (mathErr, denominator) = mulExp(priceCollateralMantissa, exchangeRateMantissa);
        if (mathErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (mathErr, ratio) = divExp(numerator, denominator);
        if (mathErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        (mathErr, seizeTokens) = mulScalarTruncate(ratio, actualRepayAmount);
        if (mathErr != MathError.NO_ERROR) {
            return (uint(Error.MATH_ERROR), 0);
        }

        return (uint(Error.NO_ERROR), seizeTokens);
    }

    /*** Admin Functions ***/

    /**
      * @notice Sets a new price oracle for the comptroller
      * @dev Admin function to set a new price oracle
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setPriceOracle(PriceOracle newOracle) public returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_PRICE_ORACLE_OWNER_CHECK);
        }

        // Track the old oracle for the comptroller
        PriceOracle oldOracle = oracle;

        // Set comptroller's oracle to newOracle
        oracle = newOracle;

        // Emit NewPriceOracle(oldOracle, newOracle)
        emit NewPriceOracle(oldOracle, newOracle);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets the closeFactor used when liquidating borrows
      * @dev Admin function to set closeFactor
      * @param newCloseFactorMantissa New close factor, scaled by 1e18
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setCloseFactor(uint newCloseFactorMantissa) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_CLOSE_FACTOR_OWNER_CHECK);
        }

        Exp memory newCloseFactorExp = Exp({mantissa: newCloseFactorMantissa});
        Exp memory lowLimit = Exp({mantissa: closeFactorMinMantissa});
        if (lessThanOrEqualExp(newCloseFactorExp, lowLimit)) {
            return fail(Error.INVALID_CLOSE_FACTOR, FailureInfo.SET_CLOSE_FACTOR_VALIDATION);
        }

        Exp memory highLimit = Exp({mantissa: closeFactorMaxMantissa});
        if (lessThanExp(highLimit, newCloseFactorExp)) {
            return fail(Error.INVALID_CLOSE_FACTOR, FailureInfo.SET_CLOSE_FACTOR_VALIDATION);
        }

        uint oldCloseFactorMantissa = closeFactorMantissa;
        closeFactorMantissa = newCloseFactorMantissa;
        emit NewCloseFactor(oldCloseFactorMantissa, newCloseFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets the collateralFactor for a market
      * @dev Admin function to set per-market collateralFactor
      * @param aToken The market to set the factor on
      * @param newCollateralFactorMantissa The new collateral factor, scaled by 1e18
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setCollateralFactor(AToken aToken, uint newCollateralFactorMantissa) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_COLLATERAL_FACTOR_OWNER_CHECK);
        }

        // Verify market is listed
        Market storage market = markets[address(aToken)];
        if (!market.isListed) {
            return fail(Error.MARKET_NOT_LISTED, FailureInfo.SET_COLLATERAL_FACTOR_NO_EXISTS);
        }

        Exp memory newCollateralFactorExp = Exp({mantissa: newCollateralFactorMantissa});

        // Check collateral factor <= 0.9
        Exp memory highLimit = Exp({mantissa: collateralFactorMaxMantissa});
        if (lessThanExp(highLimit, newCollateralFactorExp)) {
            return fail(Error.INVALID_COLLATERAL_FACTOR, FailureInfo.SET_COLLATERAL_FACTOR_VALIDATION);
        }

        // If collateral factor != 0, fail if price == 0
        if (newCollateralFactorMantissa != 0 && oracle.getUnderlyingPrice(aToken) == 0) {
            return fail(Error.PRICE_ERROR, FailureInfo.SET_COLLATERAL_FACTOR_WITHOUT_PRICE);
        }

        // Set market's collateral factor to new collateral factor, remember old value
        uint oldCollateralFactorMantissa = market.collateralFactorMantissa;
        market.collateralFactorMantissa = newCollateralFactorMantissa;

        // Emit event with asset, old collateral factor, and new collateral factor
        emit NewCollateralFactor(aToken, oldCollateralFactorMantissa, newCollateralFactorMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets maxAssets which controls how many markets can be entered
      * @dev Admin function to set maxAssets
      * @param newMaxAssets New max assets
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setMaxAssets(uint newMaxAssets) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_MAX_ASSETS_OWNER_CHECK);
        }

        uint oldMaxAssets = maxAssets;
        maxAssets = newMaxAssets;
        emit NewMaxAssets(oldMaxAssets, newMaxAssets);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Sets liquidationIncentive
      * @dev Admin function to set liquidationIncentive
      * @param newLiquidationIncentiveMantissa New liquidationIncentive scaled by 1e18
      * @return uint 0=success, otherwise a failure. (See ErrorReporter for details)
      */
    function _setLiquidationIncentive(uint newLiquidationIncentiveMantissa) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_LIQUIDATION_INCENTIVE_OWNER_CHECK);
        }

        // Check de-scaled min <= newLiquidationIncentive <= max
        Exp memory newLiquidationIncentive = Exp({mantissa: newLiquidationIncentiveMantissa});
        Exp memory minLiquidationIncentive = Exp({mantissa: liquidationIncentiveMinMantissa});
        if (lessThanExp(newLiquidationIncentive, minLiquidationIncentive)) {
            return fail(Error.INVALID_LIQUIDATION_INCENTIVE, FailureInfo.SET_LIQUIDATION_INCENTIVE_VALIDATION);
        }

        Exp memory maxLiquidationIncentive = Exp({mantissa: liquidationIncentiveMaxMantissa});
        if (lessThanExp(maxLiquidationIncentive, newLiquidationIncentive)) {
            return fail(Error.INVALID_LIQUIDATION_INCENTIVE, FailureInfo.SET_LIQUIDATION_INCENTIVE_VALIDATION);
        }

        // Save current value for use in log
        uint oldLiquidationIncentiveMantissa = liquidationIncentiveMantissa;

        // Set liquidation incentive to new incentive
        liquidationIncentiveMantissa = newLiquidationIncentiveMantissa;

        // Emit event with old incentive, new incentive
        emit NewLiquidationIncentive(oldLiquidationIncentiveMantissa, newLiquidationIncentiveMantissa);

        return uint(Error.NO_ERROR);
    }

    /**
      * @notice Add the market to the markets mapping and set it as listed
      * @dev Admin function to set isListed and add support for the market
      * @param aToken The address of the market (token) to list
      * @return uint 0=success, otherwise a failure. (See enum Error for details)
      */
    function _supportMarket(AToken aToken) external returns (uint) {
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SUPPORT_MARKET_OWNER_CHECK);
        }

        if (markets[address(aToken)].isListed) {
            return fail(Error.MARKET_ALREADY_LISTED, FailureInfo.SUPPORT_MARKET_EXISTS);
        }

        aToken.isAToken(); // Sanity check to make sure its really a AToken

        markets[address(aToken)] = Market({isListed: true, isAnnex: false, collateralFactorMantissa: 0});

        _addMarketInternal(aToken);

        emit MarketListed(aToken);

        return uint(Error.NO_ERROR);
    }

    function _addMarketInternal(AToken aToken) internal {
        for (uint i = 0; i < allMarkets.length; i ++) {
            require(allMarkets[i] != aToken, "market already added");
        }
        allMarkets.push(aToken);
    }

    /**
     * @notice Admin function to change the Pause Guardian
     * @param newPauseGuardian The address of the new Pause Guardian
     * @return uint 0=success, otherwise a failure. (See enum Error for details)
     */
    function _setPauseGuardian(address newPauseGuardian) public returns (uint) {
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_PAUSE_GUARDIAN_OWNER_CHECK);
        }

        // Save current value for inclusion in log
        address oldPauseGuardian = pauseGuardian;

        // Store pauseGuardian with value newPauseGuardian
        pauseGuardian = newPauseGuardian;

        // Emit NewPauseGuardian(OldPauseGuardian, NewPauseGuardian)
        emit NewPauseGuardian(oldPauseGuardian, newPauseGuardian);

        return uint(Error.NO_ERROR);
    }

    function _setMintPaused(AToken aToken, bool state) public onlyListedMarket(aToken) validPauseState(state) returns (bool) {
        mintGuardianPaused[address(aToken)] = state;
        emit ActionPaused(aToken, "Mint", state);
        return state;
    }

    function _setBorrowPaused(AToken aToken, bool state) public onlyListedMarket(aToken) validPauseState(state) returns (bool) {
        borrowGuardianPaused[address(aToken)] = state;
        emit ActionPaused(aToken, "Borrow", state);
        return state;
    }

    function _setTransferPaused(bool state) public validPauseState(state) returns (bool) {
        transferGuardianPaused = state;
        emit ActionPaused("Transfer", state);
        return state;
    }

    function _setSeizePaused(bool state) public validPauseState(state) returns (bool) {
        seizeGuardianPaused = state;
        emit ActionPaused("Seize", state);
        return state;
    }

    function _setMintXAIPaused(bool state) public validPauseState(state) returns (bool) {
        mintXAIGuardianPaused = state;
        emit ActionPaused("MintXAI", state);
        return state;
    }

    function _setRepayXAIPaused(bool state) public validPauseState(state) returns (bool) {
        repayXAIGuardianPaused = state;
        emit ActionPaused("RepayXAI", state);
        return state;
    }
    /**
     * @notice Set whole protocol pause/unpause state
     */
    function _setProtocolPaused(bool state) public onlyAdmin returns(bool) {
        protocolPaused = state;
        emit ActionProtocolPaused(state);
        return state;
    }

    /**
      * @notice Sets a new XAI controller
      * @dev Admin function to set a new XAI controller
      * @return uint 0=success, otherwise a failure (see ErrorReporter.sol for details)
      */
    function _setXAIController(XAIControllerInterface xaiController_) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_XAICONTROLLER_OWNER_CHECK);
        }

        XAIControllerInterface oldRate = xaiController;
        xaiController = xaiController_;
        emit NewXAIController(oldRate, xaiController_);
    }

    function _setXAIMintRate(uint newXAIMintRate) external returns (uint) {
        // Check caller is admin
        if (msg.sender != admin) {
            return fail(Error.UNAUTHORIZED, FailureInfo.SET_XAI_MINT_RATE_CHECK);
        }

        uint oldXAIMintRate = xaiMintRate;
        xaiMintRate = newXAIMintRate;
        emit NewXAIMintRate(oldXAIMintRate, newXAIMintRate);

        return uint(Error.NO_ERROR);
    }

    function _become(Unitroller unitroller) public {
        require(msg.sender == unitroller.admin(), "only unitroller admin can");
        require(unitroller._acceptImplementation() == 0, "not authorized");
    }

    /*** Annex Distribution ***/

    /**
     * @notice Recalculate and update Annex speeds for all Annex markets
     */
    function refreshAnnexSpeeds() public {
        require(msg.sender == tx.origin, "only externally owned accounts can");
        refreshAnnexSpeedsInternal();
    }

    function refreshAnnexSpeedsInternal() internal {
        uint i;
        AToken aToken;

        for (i = 0; i < allMarkets.length; i++) {
            aToken = allMarkets[i];
            Exp memory borrowIndex = Exp({mantissa: aToken.borrowIndex()});
            updateAnnexSupplyIndex(address(aToken));
            updateAnnexBorrowIndex(address(aToken), borrowIndex);
        }

        Exp memory totalUtility = Exp({mantissa: 0});
        Exp[] memory utilities = new Exp[](allMarkets.length);
        for (i = 0; i < allMarkets.length; i++) {
            aToken = allMarkets[i];
            if (markets[address(aToken)].isAnnex) {
                Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(aToken)});
                Exp memory utility = mul_(assetPrice, aToken.totalBorrows());
                utilities[i] = utility;
                totalUtility = add_(totalUtility, utility);
            }
        }

        for (i = 0; i < allMarkets.length; i++) {
            aToken = allMarkets[i];
            uint newSpeed = totalUtility.mantissa > 0 ? mul_(annexRate, div_(utilities[i], totalUtility)) : 0;
            annexSpeeds[address(aToken)] = newSpeed;
            emit AnnexSpeedUpdated(aToken, newSpeed);
        }
    }

    /**
     * @notice Accrue ANN to the market by updating the supply index
     * @param aToken The market whose supply index to update
     */
    function updateAnnexSupplyIndex(address aToken) internal {
        AnnexMarketState storage supplyState = annexSupplyState[aToken];
        uint supplySpeed = annexSpeeds[aToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = sub_(blockNumber, uint(supplyState.block));
        if (deltaBlocks > 0 && supplySpeed > 0) {
            uint supplyTokens = AToken(aToken).totalSupply();
            uint annexAccrued = mul_(deltaBlocks, supplySpeed);
            Double memory ratio = supplyTokens > 0 ? fraction(annexAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
            annexSupplyState[aToken] = AnnexMarketState({
                index: safe224(index.mantissa, "new index overflows"),
                block: safe32(blockNumber, "block number overflows")
            });
        } else if (deltaBlocks > 0) {
            supplyState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @notice Accrue ANN to the market by updating the borrow index
     * @param aToken The market whose borrow index to update
     */
    function updateAnnexBorrowIndex(address aToken, Exp memory marketBorrowIndex) internal {
        AnnexMarketState storage borrowState = annexBorrowState[aToken];
        uint borrowSpeed = annexSpeeds[aToken];
        uint blockNumber = getBlockNumber();
        uint deltaBlocks = sub_(blockNumber, uint(borrowState.block));
        if (deltaBlocks > 0 && borrowSpeed > 0) {
            uint borrowAmount = div_(AToken(aToken).totalBorrows(), marketBorrowIndex);
            uint annexAccrued = mul_(deltaBlocks, borrowSpeed);
            Double memory ratio = borrowAmount > 0 ? fraction(annexAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
            annexBorrowState[aToken] = AnnexMarketState({
                index: safe224(index.mantissa, "new index overflows"),
                block: safe32(blockNumber, "block number overflows")
            });
        } else if (deltaBlocks > 0) {
            borrowState.block = safe32(blockNumber, "block number overflows");
        }
    }

    /**
     * @notice Accrue ANN to by updating the XAI minter index
     */
    function updateAnnexXAIMintIndex() internal {
        if (address(xaiController) != address(0)) {
            xaiController.updateAnnexXAIMintIndex();
        }
    }

    /**
     * @notice Calculate ANN accrued by a supplier and possibly transfer it to them
     * @param aToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute ANN to
     */
    function distributeSupplierAnnex(address aToken, address supplier, bool distributeAll) internal {
        AnnexMarketState storage supplyState = annexSupplyState[aToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: annexSupplierIndex[aToken][supplier]});
        annexSupplierIndex[aToken][supplier] = supplyIndex.mantissa;

        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = annexInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = AToken(aToken).balanceOf(supplier);
        uint supplierDelta = mul_(supplierTokens, deltaIndex);
        uint supplierAccrued = add_(annexAccrued[supplier], supplierDelta);
        annexAccrued[supplier] = transferANN(supplier, supplierAccrued, distributeAll ? 0 : annexClaimThreshold);
        emit DistributedSupplierAnnex(AToken(aToken), supplier, supplierDelta, supplyIndex.mantissa);
    }

    /**
     * @notice Calculate ANN accrued by a borrower and possibly transfer it to them
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param aToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute ANN to
     */
    function distributeBorrowerAnnex(address aToken, address borrower, Exp memory marketBorrowIndex, bool distributeAll) internal {
        AnnexMarketState storage borrowState = annexBorrowState[aToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: annexBorrowerIndex[aToken][borrower]});
        annexBorrowerIndex[aToken][borrower] = borrowIndex.mantissa;

        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(AToken(aToken).borrowBalanceStored(borrower), marketBorrowIndex);
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(annexAccrued[borrower], borrowerDelta);
            annexAccrued[borrower] = transferANN(borrower, borrowerAccrued, distributeAll ? 0 : annexClaimThreshold);
            emit DistributedBorrowerAnnex(AToken(aToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Calculate ANN accrued by a XAI minter and possibly transfer it to them
     * @dev XAI minters will not begin to accrue until after the first interaction with the protocol.
     * @param xaiMinter The address of the XAI minter to distribute ANN to
     */
    function distributeXAIMinterAnnex(address xaiMinter, bool distributeAll) internal {
        if (address(xaiController) != address(0)) {
            uint xaiMinterAccrued;
            uint xaiMinterDelta;
            uint xaiMintIndexMantissa;
            uint err;
            (err, xaiMinterAccrued, xaiMinterDelta, xaiMintIndexMantissa) = xaiController.calcDistributeXAIMinterAnnex(xaiMinter);
            if (err == uint(Error.NO_ERROR)) {
                annexAccrued[xaiMinter] = transferANN(xaiMinter, xaiMinterAccrued, distributeAll ? 0 : annexClaimThreshold);
                emit DistributedXAIMinterAnnex(xaiMinter, xaiMinterDelta, xaiMintIndexMantissa);
            }
        }
    }

    /**
     * @notice Transfer ANN to the user, if they are above the threshold
     * @dev Note: If there is not enough ANN, we do not perform the transfer all.
     * @param user The address of the user to transfer ANN to
     * @param userAccrued The amount of ANN to (possibly) transfer
     * @return The amount of ANN which was NOT transferred to the user
     */
    function transferANN(address user, uint userAccrued, uint threshold) internal returns (uint) {
        if (userAccrued >= threshold && userAccrued > 0) {
            ANN ann = ANN(getANNAddress());
            uint annRemaining = ann.balanceOf(address(this));
            if (userAccrued <= annRemaining) {
                ann.transfer(user, userAccrued);
                return 0;
            }
        }
        return userAccrued;
    }

    /**
     * @notice Claim all the ann accrued by holder in all markets and XAI
     * @param holder The address to claim ANN for
     */
    function claimAnnex(address holder) public {
        return claimAnnex(holder, allMarkets);
    }

    /**
     * @notice Claim all the ann accrued by holder in the specified markets
     * @param holder The address to claim ANN for
     * @param aTokens The list of markets to claim ANN in
     */
    function claimAnnex(address holder, AToken[] memory aTokens) public {
        address[] memory holders = new address[](1);
        holders[0] = holder;
        claimAnnex(holders, aTokens, true, true);
    }

    /**
     * @notice Claim all ann accrued by the holders
     * @param holders The addresses to claim ANN for
     * @param aTokens The list of markets to claim ANN in
     * @param borrowers Whether or not to claim ANN earned by borrowing
     * @param suppliers Whether or not to claim ANN earned by supplying
     */
    function claimAnnex(address[] memory holders, AToken[] memory aTokens, bool borrowers, bool suppliers) public {
        uint j;
        updateAnnexXAIMintIndex();
        for (j = 0; j < holders.length; j++) {
            distributeXAIMinterAnnex(holders[j], true);
        }
        for (uint i = 0; i < aTokens.length; i++) {
            AToken aToken = aTokens[i];
            require(markets[address(aToken)].isListed, "not listed market");
            if (borrowers) {
                Exp memory borrowIndex = Exp({mantissa: aToken.borrowIndex()});
                updateAnnexBorrowIndex(address(aToken), borrowIndex);
                for (j = 0; j < holders.length; j++) {
                    distributeBorrowerAnnex(address(aToken), holders[j], borrowIndex, true);
                }
            }
            if (suppliers) {
                updateAnnexSupplyIndex(address(aToken));
                for (j = 0; j < holders.length; j++) {
                    distributeSupplierAnnex(address(aToken), holders[j], true);
                }
            }
        }
    }

    /*** Annex Distribution Admin ***/

    /**
     * @notice Set the amount of ANN distributed per block
     * @param annexRate_ The amount of ANN wei per block to distribute
     */
    function _setAnnexRate(uint annexRate_) public onlyAdmin {
        uint oldRate = annexRate;
        annexRate = annexRate_;
        emit NewAnnexRate(oldRate, annexRate_);

        refreshAnnexSpeedsInternal();
    }

    /**
     * @notice Set the amount of ANN distributed per block to XAI Mint
     * @param annexXAIRate_ The amount of ANN wei per block to distribute to XAI Mint
     */
    function _setAnnexXAIRate(uint annexXAIRate_) public {
        require(msg.sender == admin, "only admin can");

        uint oldXAIRate = annexXAIRate;
        annexXAIRate = annexXAIRate_;
        emit NewAnnexXAIRate(oldXAIRate, annexXAIRate_);
    }

    /**
     * @notice Add markets to annexMarkets, allowing them to earn ANN in the flywheel
     * @param aTokens The addresses of the markets to add
     */
    function _addAnnexMarkets(address[] calldata aTokens) external onlyAdmin {
        for (uint i = 0; i < aTokens.length; i++) {
            _addAnnexMarketInternal(aTokens[i]);
        }

        refreshAnnexSpeedsInternal();
    }

    function _addAnnexMarketInternal(address aToken) internal {
        Market storage market = markets[aToken];
        require(market.isListed, "annex market is not listed");
        require(!market.isAnnex, "annex market already added");

        market.isAnnex = true;
        emit MarketAnnex(AToken(aToken), true);

        if (annexSupplyState[aToken].index == 0 && annexSupplyState[aToken].block == 0) {
            annexSupplyState[aToken] = AnnexMarketState({
                index: annexInitialIndex,
                block: safe32(getBlockNumber(), "block number overflows")
            });
        }

        if (annexBorrowState[aToken].index == 0 && annexBorrowState[aToken].block == 0) {
            annexBorrowState[aToken] = AnnexMarketState({
                index: annexInitialIndex,
                block: safe32(getBlockNumber(), "block number overflows")
            });
        }
    }

    function _initializeAnnexXAIState(uint blockNumber) public {
        require(msg.sender == admin, "only admin can");
        if (address(xaiController) != address(0)) {
            xaiController._initializeAnnexXAIState(blockNumber);
        }
    }

    /**
     * @notice Remove a market from annexMarkets, preventing it from earning ANN in the flywheel
     * @param aToken The address of the market to drop
     */
    function _dropAnnexMarket(address aToken) public onlyAdmin {
        Market storage market = markets[aToken];
        require(market.isAnnex == true, "not annex market");

        market.isAnnex = false;
        emit MarketAnnex(AToken(aToken), false);

        refreshAnnexSpeedsInternal();
    }

    /**
     * @notice Return all of the markets
     * @dev The automatic getter may be used to access an individual market.
     * @return The list of market addresses
     */
    function getAllMarkets() public view returns (AToken[] memory) {
        return allMarkets;
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }

    /**
     * @notice Return the address of the ANN token
     * @return The address of ANN
     */
    function getANNAddress() public view returns (address) {
        return 0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63;
    }

    /*** XAI functions ***/

    /**
     * @notice Set the minted XAI amount of the `owner`
     * @param owner The address of the account to set
     * @param amount The amount of XAI to set to the account
     * @return The number of minted XAI by `owner`
     */
    function setMintedXAIOf(address owner, uint amount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintXAIGuardianPaused && !repayXAIGuardianPaused, "XAI is paused");
        // Check caller is xaiController
        if (msg.sender != address(xaiController)) {
            return fail(Error.REJECTION, FailureInfo.SET_MINTED_XAI_REJECTION);
        }
        mintedXAIs[owner] = amount;

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Mint XAI
     */
    function mintXAI(uint mintXAIAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!mintXAIGuardianPaused, "mintXAI is paused");

        // Keep the flywheel moving
        updateAnnexXAIMintIndex();
        distributeXAIMinterAnnex(msg.sender, false);
        return xaiController.mintXAI(msg.sender, mintXAIAmount);
    }

    /**
     * @notice Repay XAI
     */
    function repayXAI(uint repayXAIAmount) external onlyProtocolAllowed returns (uint) {
        // Pausing is a very serious situation - we revert to sound the alarms
        require(!repayXAIGuardianPaused, "repayXAI is paused");

        // Keep the flywheel moving
        updateAnnexXAIMintIndex();
        distributeXAIMinterAnnex(msg.sender, false);
        return xaiController.repayXAI(msg.sender, repayXAIAmount);
    }

    /**
     * @notice Get the minted XAI amount of the `owner`
     * @param owner The address of the account to query
     * @return The number of minted XAI by `owner`
     */
    function mintedXAIOf(address owner) external view returns (uint) {
        return mintedXAIs[owner];
    }

    /**
     * @notice Get Mintable XAI amount
     */
    function getMintableXAI(address minter) external view returns (uint, uint) {
        return xaiController.getMintableXAI(minter);
    }
}
