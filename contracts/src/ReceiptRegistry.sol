// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReceiptRegistry.sol";

/**
 * @title ReceiptRegistry
 * @author Reality Firewall v3
 * @notice Deterministic anchoring of risk defense receipts.
 * @dev Implements ERC-8004 style agent identity anchoring.
 */
contract ReceiptRegistry is IReceiptRegistry {
    mapping(bytes32 => Receipt) public receipts;
    mapping(address => bool) public authorizedAgents;
    address public owner;

    error UnauthorizedAgent(address agent);
    error ReceiptAlreadyExists(bytes32 evidenceHash);
    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedAgents[msg.sender]) revert UnauthorizedAgent(msg.sender);
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedAgents[msg.sender] = true;
    }

    function setAuthorizedAgent(address agent, bool status) external onlyOwner {
        authorizedAgents[agent] = status;
    }

    /**
     * @notice Anchors a defense receipt on-chain.
     * @param evidenceHash SHA256 of the canonicalized receipt JSON.
     * @param runIdHash Unique identifier for the risk run.
     * @param agentId The ERC-8004 agent identity.
     * @param score Risk score (0-100).
     * @param level Risk level (0-4).
     * @param isDrill Whether this was a paid drill (x402).
     */
    function anchorReceipt(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill
    ) external onlyAuthorized returns (bool) {
        if (receipts[evidenceHash].timestamp != 0) revert ReceiptAlreadyExists(evidenceHash);

        receipts[evidenceHash] = Receipt({
            evidenceHash: evidenceHash,
            runIdHash: runIdHash,
            agentId: agentId,
            score: score,
            level: level,
            isDrill: isDrill,
            timestamp: block.timestamp
        });

        emit ReceiptAnchored(evidenceHash, runIdHash, agentId, score, level);
        return true;
    }

    function getReceipt(bytes32 evidenceHash) external view returns (Receipt memory) {
        return receipts[evidenceHash];
    }

    function verifyReceipt(bytes32 evidenceHash, uint8 minScore) external view returns (bool) {
        Receipt memory r = receipts[evidenceHash];
        return r.timestamp != 0 && r.score >= minScore;
    }
}
