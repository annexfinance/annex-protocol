pragma solidity ^0.5.16;
pragma experimental ABIEncoderV2;

import "../ABep20.sol";
import "../AToken.sol";
import "../PriceOracle.sol";
import "../EIP20Interface.sol";
import "../Governance/GovernorAlpha.sol";
import "../Governance/ANN.sol";

interface ComptrollerLensInterface {
    function markets(address) external view returns (bool, uint);
    function oracle() external view returns (PriceOracle);
    function getAccountLiquidity(address) external view returns (uint, uint, uint);
    function getAssetsIn(address) external view returns (AToken[] memory);
    function claimAnnex(address) external;
    function annexAccrued(address) external view returns (uint);
}

contract AnnexLens {
    struct ATokenMetadata {
        address aToken;
        uint exchangeRateCurrent;
        uint supplyRatePerBlock;
        uint borrowRatePerBlock;
        uint reserveFactorMantissa;
        uint totalBorrows;
        uint totalReserves;
        uint totalSupply;
        uint totalCash;
        bool isListed;
        uint collateralFactorMantissa;
        address underlyingAssetAddress;
        uint aTokenDecimals;
        uint underlyingDecimals;
    }

    function aTokenMetadata(AToken aToken) public returns (ATokenMetadata memory) {
        uint exchangeRateCurrent = aToken.exchangeRateCurrent();
        ComptrollerLensInterface comptroller = ComptrollerLensInterface(address(aToken.comptroller()));
        (bool isListed, uint collateralFactorMantissa) = comptroller.markets(address(aToken));
        address underlyingAssetAddress;
        uint underlyingDecimals;

        if (compareStrings(aToken.symbol(), "aBNB")) {
            underlyingAssetAddress = address(0);
            underlyingDecimals = 18;
        } else {
            ABep20 aBep20 = ABep20(address(aToken));
            underlyingAssetAddress = aBep20.underlying();
            underlyingDecimals = EIP20Interface(aBep20.underlying()).decimals();
        }

        return ATokenMetadata({
            aToken: address(aToken),
            exchangeRateCurrent: exchangeRateCurrent,
            supplyRatePerBlock: aToken.supplyRatePerBlock(),
            borrowRatePerBlock: aToken.borrowRatePerBlock(),
            reserveFactorMantissa: aToken.reserveFactorMantissa(),
            totalBorrows: aToken.totalBorrows(),
            totalReserves: aToken.totalReserves(),
            totalSupply: aToken.totalSupply(),
            totalCash: aToken.getCash(),
            isListed: isListed,
            collateralFactorMantissa: collateralFactorMantissa,
            underlyingAssetAddress: underlyingAssetAddress,
            aTokenDecimals: aToken.decimals(),
            underlyingDecimals: underlyingDecimals
        });
    }

    function aTokenMetadataAll(AToken[] calldata aTokens) external returns (ATokenMetadata[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenMetadata[] memory res = new ATokenMetadata[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenMetadata(aTokens[i]);
        }
        return res;
    }

    struct ATokenBalances {
        address aToken;
        uint balanceOf;
        uint borrowBalanceCurrent;
        uint balanceOfUnderlying;
        uint tokenBalance;
        uint tokenAllowance;
    }

    function aTokenBalances(AToken aToken, address payable account) public returns (ATokenBalances memory) {
        uint balanceOf = aToken.balanceOf(account);
        uint borrowBalanceCurrent = aToken.borrowBalanceCurrent(account);
        uint balanceOfUnderlying = aToken.balanceOfUnderlying(account);
        uint tokenBalance;
        uint tokenAllowance;

        if (compareStrings(aToken.symbol(), "aBNB")) {
            tokenBalance = account.balance;
            tokenAllowance = account.balance;
        } else {
            ABep20 aBep20 = ABep20(address(aToken));
            EIP20Interface underlying = EIP20Interface(aBep20.underlying());
            tokenBalance = underlying.balanceOf(account);
            tokenAllowance = underlying.allowance(account, address(aToken));
        }

        return ATokenBalances({
            aToken: address(aToken),
            balanceOf: balanceOf,
            borrowBalanceCurrent: borrowBalanceCurrent,
            balanceOfUnderlying: balanceOfUnderlying,
            tokenBalance: tokenBalance,
            tokenAllowance: tokenAllowance
        });
    }

    function aTokenBalancesAll(AToken[] calldata aTokens, address payable account) external returns (ATokenBalances[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenBalances[] memory res = new ATokenBalances[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenBalances(aTokens[i], account);
        }
        return res;
    }

    struct ATokenUnderlyingPrice {
        address aToken;
        uint underlyingPrice;
    }

    function aTokenUnderlyingPrice(AToken aToken) public view returns (ATokenUnderlyingPrice memory) {
        ComptrollerLensInterface comptroller = ComptrollerLensInterface(address(aToken.comptroller()));
        PriceOracle priceOracle = comptroller.oracle();

        return ATokenUnderlyingPrice({
            aToken: address(aToken),
            underlyingPrice: priceOracle.getUnderlyingPrice(aToken)
        });
    }

    function aTokenUnderlyingPriceAll(AToken[] calldata aTokens) external view returns (ATokenUnderlyingPrice[] memory) {
        uint aTokenCount = aTokens.length;
        ATokenUnderlyingPrice[] memory res = new ATokenUnderlyingPrice[](aTokenCount);
        for (uint i = 0; i < aTokenCount; i++) {
            res[i] = aTokenUnderlyingPrice(aTokens[i]);
        }
        return res;
    }

    struct AccountLimits {
        AToken[] markets;
        uint liquidity;
        uint shortfall;
    }

    function getAccountLimits(ComptrollerLensInterface comptroller, address account) public view returns (AccountLimits memory) {
        (uint errorCode, uint liquidity, uint shortfall) = comptroller.getAccountLiquidity(account);
        require(errorCode == 0, "account liquidity error");

        return AccountLimits({
            markets: comptroller.getAssetsIn(account),
            liquidity: liquidity,
            shortfall: shortfall
        });
    }

    struct GovReceipt {
        uint proposalId;
        bool hasVoted;
        bool support;
        uint96 votes;
    }

    function getGovReceipts(GovernorAlpha governor, address voter, uint[] memory proposalIds) public view returns (GovReceipt[] memory) {
        uint proposalCount = proposalIds.length;
        GovReceipt[] memory res = new GovReceipt[](proposalCount);
        for (uint i = 0; i < proposalCount; i++) {
            GovernorAlpha.Receipt memory receipt = governor.getReceipt(proposalIds[i], voter);
            res[i] = GovReceipt({
                proposalId: proposalIds[i],
                hasVoted: receipt.hasVoted,
                support: receipt.support,
                votes: receipt.votes
            });
        }
        return res;
    }

    struct GovProposal {
        uint proposalId;
        address proposer;
        uint eta;
        address[] targets;
        uint[] values;
        string[] signatures;
        bytes[] calldatas;
        uint startBlock;
        uint endBlock;
        uint forVotes;
        uint againstVotes;
        bool canceled;
        bool executed;
    }

    function setProposal(GovProposal memory res, GovernorAlpha governor, uint proposalId) internal view {
        (
            ,
            address proposer,
            uint eta,
            uint startBlock,
            uint endBlock,
            uint forVotes,
            uint againstVotes,
            bool canceled,
            bool executed
        ) = governor.proposals(proposalId);
        res.proposalId = proposalId;
        res.proposer = proposer;
        res.eta = eta;
        res.startBlock = startBlock;
        res.endBlock = endBlock;
        res.forVotes = forVotes;
        res.againstVotes = againstVotes;
        res.canceled = canceled;
        res.executed = executed;
    }

    function getGovProposals(GovernorAlpha governor, uint[] calldata proposalIds) external view returns (GovProposal[] memory) {
        GovProposal[] memory res = new GovProposal[](proposalIds.length);
        for (uint i = 0; i < proposalIds.length; i++) {
            (
                address[] memory targets,
                uint[] memory values,
                string[] memory signatures,
                bytes[] memory calldatas
            ) = governor.getActions(proposalIds[i]);
            res[i] = GovProposal({
                proposalId: 0,
                proposer: address(0),
                eta: 0,
                targets: targets,
                values: values,
                signatures: signatures,
                calldatas: calldatas,
                startBlock: 0,
                endBlock: 0,
                forVotes: 0,
                againstVotes: 0,
                canceled: false,
                executed: false
            });
            setProposal(res[i], governor, proposalIds[i]);
        }
        return res;
    }

    struct ANNBalanceMetadata {
        uint balance;
        uint votes;
        address delegate;
    }

    function getANNBalanceMetadata(ANN ann, address account) external view returns (ANNBalanceMetadata memory) {
        return ANNBalanceMetadata({
            balance: ann.balanceOf(account),
            votes: uint256(ann.getCurrentVotes(account)),
            delegate: ann.delegates(account)
        });
    }

    struct ANNBalanceMetadataExt {
        uint balance;
        uint votes;
        address delegate;
        uint allocated;
    }

    function getANNBalanceMetadataExt(ANN ann, ComptrollerLensInterface comptroller, address account) external returns (ANNBalanceMetadataExt memory) {
        uint balance = ann.balanceOf(account);
        comptroller.claimAnnex(account);
        uint newBalance = ann.balanceOf(account);
        uint accrued = comptroller.annexAccrued(account);
        uint total = add(accrued, newBalance, "sum ann total");
        uint allocated = sub(total, balance, "sub allocated");

        return ANNBalanceMetadataExt({
            balance: balance,
            votes: uint256(ann.getCurrentVotes(account)),
            delegate: ann.delegates(account),
            allocated: allocated
        });
    }

    struct AnnexVotes {
        uint blockNumber;
        uint votes;
    }

    function getAnnexVotes(ANN ann, address account, uint32[] calldata blockNumbers) external view returns (AnnexVotes[] memory) {
        AnnexVotes[] memory res = new AnnexVotes[](blockNumbers.length);
        for (uint i = 0; i < blockNumbers.length; i++) {
            res[i] = AnnexVotes({
                blockNumber: uint256(blockNumbers[i]),
                votes: uint256(ann.getPriorVotes(account, blockNumbers[i]))
            });
        }
        return res;
    }

    function compareStrings(string memory a, string memory b) internal pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    function add(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, errorMessage);
        return c;
    }

    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;
        return c;
    }
}
