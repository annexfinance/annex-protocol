pragma solidity ^0.5.16;
import "./SafeMath.sol";
import "./IBEP20.sol";

contract XAIVaultAdminStorage {
    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of XAI Vault
    */
    address public xaiVaultImplementation;

    /**
    * @notice Pending brains of XAI Vault
    */
    address public pendingXAIVaultImplementation;
}

contract XAIVaultStorage is XAIVaultAdminStorage {
    /// @notice The ANN TOKEN!
    IBEP20 public ann;

    /// @notice The XAI TOKEN!
    IBEP20 public xai;

    /// @notice Guard variable for re-entrancy checks
    bool internal _notEntered;

    /// @notice ANN balance of vault
    uint256 public annBalance;

    /// @notice Accumulated ANN per share
    uint256 public accANNPerShare;

    //// pending rewards awaiting anyone to update
    uint256 public pendingRewards;

    /// @notice Info of each user.
    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    // Info of each user that stakes tokens.
    mapping(address => UserInfo) public userInfo;
}
