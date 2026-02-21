// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RiskSignalConsumer
 * @author Reality Firewall v3
 * @notice Receives risk signals from the Chainlink CRE workflow.
 * @dev
 *   The CRE workflow calls updateRiskSignal() after every risk computation.
 *   This creates an auditable on-chain trail of risk signals independent
 *   of the off-chain gateway.
 *
 * Deploy on Sepolia, then set address in workflow.config.json:
 *   forge create contracts/src/RiskSignalConsumer.sol:RiskSignalConsumer \
 *     --rpc-url $SEPOLIA_RPC --private-key $PRIVATE_KEY
 */
contract RiskSignalConsumer {

    struct RiskSignal {
        string  asset;
        int256  oraclePrice;      // scaled ×1e8 (Chainlink format)
        int256  dexPrice;         // scaled ×1e8
        uint256 divergenceBps;    // basis points (1 bps = 0.01%)
        uint256 stalenessSeconds;
        uint8   riskScore;        // 0-100
        bytes32 workflowId;       // CRE workflow execution ID
        uint256 updatedAt;        // block.timestamp
    }

    mapping(string => RiskSignal) public latestSignals;
    mapping(address => bool)      public authorizedWorkflows;
    address public owner;

    event RiskSignalUpdated(
        string  indexed asset,
        int256  oraclePrice,
        int256  dexPrice,
        uint256 divergenceBps,
        uint8   riskScore,
        bytes32 workflowId
    );

    error OnlyOwner();
    error UnauthorizedWorkflow(address caller);

    modifier onlyOwner()    { if (msg.sender != owner) revert OnlyOwner(); _; }
    modifier onlyWorkflow() { if (!authorizedWorkflows[msg.sender]) revert UnauthorizedWorkflow(msg.sender); _; }

    constructor() {
        owner = msg.sender;
        authorizedWorkflows[msg.sender] = true;
    }

    function setAuthorizedWorkflow(address workflow, bool status) external onlyOwner {
        authorizedWorkflows[workflow] = status;
    }

    /**
     * @notice Called by the CRE workflow to update the risk signal for an asset.
     * @param asset            Asset symbol (WETH, WBTC, etc.)
     * @param oraclePrice      Chainlink Data Feed price ×1e8
     * @param dexPrice         DEX/CoinGecko price ×1e8
     * @param divergenceBps    Divergence in basis points
     * @param stalenessSeconds Seconds since oracle last updated
     * @param riskScore        0-100 risk score
     * @param workflowId       CRE workflow execution ID (bytes32)
     */
    function updateRiskSignal(
        string  calldata asset,
        int256  oraclePrice,
        int256  dexPrice,
        uint256 divergenceBps,
        uint256 stalenessSeconds,
        uint8   riskScore,
        bytes32 workflowId
    ) external onlyWorkflow {
        latestSignals[asset] = RiskSignal({
            asset:            asset,
            oraclePrice:      oraclePrice,
            dexPrice:         dexPrice,
            divergenceBps:    divergenceBps,
            stalenessSeconds: stalenessSeconds,
            riskScore:        riskScore,
            workflowId:       workflowId,
            updatedAt:        block.timestamp
        });

        emit RiskSignalUpdated(asset, oraclePrice, dexPrice, divergenceBps, riskScore, workflowId);
    }

    function getSignal(string calldata asset) external view returns (RiskSignal memory) {
        return latestSignals[asset];
    }
}
