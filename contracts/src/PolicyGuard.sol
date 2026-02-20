// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReceiptRegistry.sol";

/**
 * @title PolicyGuard
 * @author Reality Firewall v3
 * @notice Deterministic risk-based policy enforcement.
 * @dev Enforces blast-radius limits on protocol parameter adjustments.
 */
contract PolicyGuard {
    IReceiptRegistry public immutable registry;
    address public owner;

    struct MarketPolicy {
        uint256 maxLtv;
        uint256 minLtv;
        uint256 maxCap;
        bool isFrozen;
        uint256 lastUpdate;
    }

    mapping(address => MarketPolicy) public policies;
    mapping(address => bool) public authorizedExecutors;

    event PolicyUpdated(address indexed market, uint256 newLtv, uint256 newCap, bool frozen);
    event MarketInitialized(address indexed market, uint256 maxLtv, uint256 maxCap);

    error UnauthorizedExecutor(address executor);
    error InvalidReceipt(bytes32 evidenceHash);
    error BlastRadiusExceeded(string param);
    error OnlyOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyExecutor() {
        if (!authorizedExecutors[msg.sender]) revert UnauthorizedExecutor(msg.sender);
        _;
    }

    constructor(address _registry) {
        registry = IReceiptRegistry(_registry);
        owner = msg.sender;
        authorizedExecutors[msg.sender] = true;
    }

    function setExecutor(address executor, bool status) external onlyOwner {
        authorizedExecutors[executor] = status;
    }

    function initMarket(address market, uint256 maxLtv, uint256 maxCap) external onlyOwner {
        policies[market] = MarketPolicy({
            maxLtv: maxLtv,
            minLtv: 0,
            maxCap: maxCap,
            isFrozen: false,
            lastUpdate: block.timestamp
        });
        emit MarketInitialized(market, maxLtv, maxCap);
    }

    /**
     * @notice Adjusts market parameters based on a verified defense receipt.
     * @param market The target DeFi market address.
     * @param evidenceHash The receipt hash to verify.
     * @param newLtv Proposed new LTV.
     * @param newCap Proposed new supply/borrow cap.
     * @param freeze Whether to freeze the market.
     */
    function enforcePolicy(
        address market,
        bytes32 evidenceHash,
        uint256 newLtv,
        uint256 newCap,
        bool freeze
    ) external onlyExecutor {
        // 1. Verify receipt exists and has sufficient score (e.g., >= 50)
        if (!registry.verifyReceipt(evidenceHash, 50)) revert InvalidReceipt(evidenceHash);

        MarketPolicy storage policy = policies[market];
        
        // 2. Blast Radius Check: LTV cannot exceed max defined
        if (newLtv > policy.maxLtv) revert BlastRadiusExceeded("LTV");
        
        // 3. Blast Radius Check: Cap cannot exceed max defined
        if (newCap > policy.maxCap) revert BlastRadiusExceeded("CAP");

        // 4. Apply changes
        policy.isFrozen = freeze;
        policy.lastUpdate = block.timestamp;

        emit PolicyUpdated(market, newLtv, newCap, freeze);
    }
}
