pragma solidity ^0.5.16;

import "./ABNB.sol";

/**
 * @title Annex's Maximillion Contract
 * @author Annex
 */
contract Maximillion {
    /**
     * @notice The default aBnb market to repay in
     */
    ABNB public aBnb;

    /**
     * @notice Construct a Maximillion to repay max in a ABNB market
     */
    constructor(ABNB aBnb_) public {
        aBnb = aBnb_;
    }

    /**
     * @notice msg.sender sends BNB to repay an account's borrow in the aBnb market
     * @dev The provided BNB is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     */
    function repayBehalf(address borrower) public payable {
        repayBehalfExplicit(borrower, aBnb);
    }

    /**
     * @notice msg.sender sends BNB to repay an account's borrow in a aBnb market
     * @dev The provided BNB is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     * @param aBnb_ The address of the aBnb contract to repay in
     */
    function repayBehalfExplicit(address borrower, ABNB aBnb_) public payable {
        uint received = msg.value;
        uint borrows = aBnb_.borrowBalanceCurrent(borrower);
        if (received > borrows) {
            aBnb_.repayBorrowBehalf.value(borrows)(borrower);
            msg.sender.transfer(received - borrows);
        } else {
            aBnb_.repayBorrowBehalf.value(received)(borrower);
        }
    }
}
