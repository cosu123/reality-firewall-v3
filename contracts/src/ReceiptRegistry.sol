// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReceiptRegistry.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title ReceiptRegistry
 * @author Reality Firewall v3
 * @notice Deterministic on-chain anchoring of DeFi risk Defense Receipts with EIP-712 signatures.
 */
contract ReceiptRegistry is IReceiptRegistry, EIP712 {
    using ECDSA for bytes32;

    mapping(bytes32 => Receipt) private _receipts;
    mapping(address => bool) public authorizedAgents;
    address public owner;

    bytes32 private constant RECEIPT_TYPEHASH = keccak256(
        "Receipt(bytes32 evidenceHash,bytes32 runIdHash,address agentId,uint8 score,uint8 level,bool isDrill)"
    );

    error OnlyOwner();
    error UnauthorizedAgent(address agent);
    error ReceiptAlreadyExists(bytes32 evidenceHash);
    error InvalidSignature();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedAgents[msg.sender]) revert UnauthorizedAgent(msg.sender);
        _;
    }

    constructor() EIP712("RealityFirewall", "3.0.0") {
        owner = msg.sender;
        authorizedAgents[msg.sender] = true;
    }

    function setAuthorizedAgent(address agent, bool status) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        authorizedAgents[agent] = status;
    }

    function anchorReceipt(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill
    ) external onlyAuthorized returns (bool) {
        return _anchor(evidenceHash, runIdHash, agentId, score, level, isDrill);
    }

    function anchorReceiptWithSignature(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill,
        bytes calldata signature
    ) external returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIPT_TYPEHASH,
                evidenceHash,
                runIdHash,
                agentId,
                score,
                level,
                isDrill
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);

        if (!authorizedAgents[signer] || signer != agentId) revert InvalidSignature();

        return _anchor(evidenceHash, runIdHash, agentId, score, level, isDrill);
    }

    function _anchor(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill
    ) internal returns (bool) {
        if (_receipts[evidenceHash].timestamp != 0) revert ReceiptAlreadyExists(evidenceHash);
        
        _receipts[evidenceHash] = Receipt({
            evidenceHash: evidenceHash,
            runIdHash: runIdHash,
            agentId: agentId,
            score: score,
            level: level,
            isDrill: isDrill,
            timestamp: block.timestamp
        });

        emit ReceiptAnchored(evidenceHash, runIdHash, agentId, score, level, isDrill);
        return true;
    }

    function getReceipt(bytes32 evidenceHash) external view returns (Receipt memory) {
        return _receipts[evidenceHash];
    }

    function verifyReceipt(bytes32 evidenceHash, uint8 minScore) external view returns (bool) {
        Receipt memory r = _receipts[evidenceHash];
        return r.timestamp != 0 && r.score >= minScore;
    }
}
