pragma solidity ^0.5.16;

import "./ABep20Delegate.sol";

interface AnnLike {
  function delegate(address delegatee) external;
}

/**
 * @title Annex's AAnnLikeDelegate Contract
 * @notice ATokens which can 'delegate votes' of their underlying BEP-20
 * @author Annex
 */
contract AAnnLikeDelegate is ABep20Delegate {
  /**
   * @notice Construct an empty delegate
   */
  constructor() public ABep20Delegate() {}

  /**
   * @notice Admin call to delegate the votes of the ANN-like underlying
   * @param annLikeDelegatee The address to delegate votes to
   */
  function _delegateAnnLikeTo(address annLikeDelegatee) external {
    require(msg.sender == admin, "only the admin may set the ann-like delegate");
    AnnLike(underlying).delegate(annLikeDelegatee);
  }
}