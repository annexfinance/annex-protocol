pragma solidity ^0.5.16;

contract ComptrollerInterfaceG1 {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    bool public constant isComptroller = true;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata aTokens) external returns (uint[] memory);
    function exitMarket(address aToken) external returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address aToken, address minter, uint mintAmount) external returns (uint);
    function mintVerify(address aToken, address minter, uint mintAmount, uint mintTokens) external;

    function redeemAllowed(address aToken, address redeemer, uint redeemTokens) external returns (uint);
    function redeemVerify(address aToken, address redeemer, uint redeemAmount, uint redeemTokens) external;

    function borrowAllowed(address aToken, address borrower, uint borrowAmount) external returns (uint);
    function borrowVerify(address aToken, address borrower, uint borrowAmount) external;

    function repayBorrowAllowed(
        address aToken,
        address payer,
        address borrower,
        uint repayAmount) external returns (uint);
    function repayBorrowVerify(
        address aToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex) external;

    function liquidateBorrowAllowed(
        address aTokenBorrowed,
        address aTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount) external returns (uint);
    function liquidateBorrowVerify(
        address aTokenBorrowed,
        address aTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens) external;

    function seizeAllowed(
        address aTokenCollateral,
        address aTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external returns (uint);
    function seizeVerify(
        address aTokenCollateral,
        address aTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) external;

    function transferAllowed(address aToken, address src, address dst, uint transferTokens) external returns (uint);
    function transferVerify(address aToken, address src, address dst, uint transferTokens) external;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address aTokenBorrowed,
        address aTokenCollateral,
        uint repayAmount) external view returns (uint, uint);
    function setMintedXAIOf(address owner, uint amount) external returns (uint);
}

contract ComptrollerInterfaceG2 is ComptrollerInterfaceG1 {
    function liquidateXAICalculateSeizeTokens(
        address aTokenCollateral,
        uint repayAmount) external view returns (uint, uint);
}

contract ComptrollerInterface is ComptrollerInterfaceG2 {
}

interface IXAIVault {
    function updatePendingRewards() external;
}

interface IComptroller {
    /*** Treasury Data ***/
    function treasuryAddress() external view returns (address);
    function treasuryPercent() external view returns (uint);
}
