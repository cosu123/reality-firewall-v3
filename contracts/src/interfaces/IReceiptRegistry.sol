// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReceiptRegistry {
    struct Receipt {
        bytes32 evidenceHash;
        bytes32 runIdHash;
        address agentId;
        uint8 score;
        uint8 level;
        bool isDrill;
        uint256 timestamp;
    }

    event ReceiptAnchored(
        bytes32 indexed evidenceHash,
        bytes32 indexed runIdHash,
        address indexed agentId,
        uint8 score,
        uint8 level,
        bool isDrill
    );

    function anchorReceipt(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill
    ) external returns (bool);

    function anchorReceiptWithSignature(
        bytes32 evidenceHash,
        bytes32 runIdHash,
        address agentId,
        uint8 score,
        uint8 level,
        bool isDrill,
        bytes calldata signature
    ) external returns (bool);

    function getReceipt(bytes32 evidenceHash) external view returns (Receipt memory);
    function verifyReceipt(bytes32 evidenceHash, uint8 minScore) external view returns (bool);
}
