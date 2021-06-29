pragma solidity ^0.5.16;

import "./ComptrollerInterface.sol";

contract XAIUnitrollerAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of Unitroller
    */
    address public xaiControllerImplementation;

    /**
    * @notice Pending brains of Unitroller
    */
    address public pendingXAIControllerImplementation;
}

contract XAIControllerStorageG1 is XAIUnitrollerAdminStorage {
    ComptrollerInterface public comptroller;

    struct AnnexXAIState {
        /// @notice The last updated annexXAIMintIndex
        uint224 index;

        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice The Annex XAI state
    AnnexXAIState public annexXAIState;

    /// @notice The Annex XAI state initialized
    bool public isAnnexXAIInitialized;

    /// @notice The Annex XAI minter index as of the last time they accrued ANN
    mapping(address => uint) public annexXAIMinterIndex;
}

contract XAIControllerStorageG2 is XAIControllerStorageG1 {
    /// @notice Treasury Guardian address
    address public treasuryGuardian;

    /// @notice Treasury address
    address public treasuryAddress;

    /// @notice Fee percent of accrued interest with decimal 18
    uint256 public treasuryPercent;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;
}
