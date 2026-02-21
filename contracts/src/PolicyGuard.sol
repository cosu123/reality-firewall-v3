// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IReceiptRegistry.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PolicyGuard
 * @author Reality Firewall v3
 * @notice Deterministic risk-based policy enforcement with granular access control.
 */
contract PolicyGuard is AccessControl, ReentrancyGuard {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    IReceiptRegistry public immutable registry;

    struct MarketPolicy {
        uint256 maxLtv;
        uint256 minLtv;
        uint256 maxCap;
        bool isFrozen;
        uint256 lastUpdate;
        uint256 cooldown;
    }

    mapping(address => MarketPolicy) public policies;

    event PolicyUpdated(address indexed market, uint256 newLtv, uint256 newCap, bool frozen);
    event MarketInitialized(address indexed market, uint256 maxLtv, uint256 maxCap);

    error UnauthorizedExecutor(address executor);
    error InvalidReceipt(bytes32 evidenceHash);
    error BlastRadiusExceeded(string param);
    error CooldownActive(address market);

    constructor(address _registry) {
        registry = IReceiptRegistry(_registry);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    function initMarket(
        address market,
        uint256 maxLtv,
        uint256 maxCap,
        uint256 cooldown
    ) external onlyRole(ADMIN_ROLE) {
        policies[market] = MarketPolicy({
            maxLtv: maxLtv,
            minLtv: 0,
            maxCap: maxCap,
            isFrozen: false,
            lastUpdate: block.timestamp,
            cooldown: cooldown
        });
        emit MarketInitialized(market, maxLtv, maxCap);
    }

    /**
     * @notice Adjusts market parameters based on a verified defense receipt.
     */
    function enforcePolicy(
        address market,
        bytes32 evidenceHash,
        uint256 newLtv,
        uint256 newCap,
        bool freeze
    ) external onlyRole(EXECUTOR_ROLE) nonReentrant {
        MarketPolicy storage policy = policies[market];
        
        if (block.timestamp < policy.lastUpdate + policy.cooldown) {
            revert CooldownActive(market);
        }

        // Verify receipt exists and has sufficient score (>= 50 for policy enforcement)
        if (!registry.verifyReceipt(evidenceHash, 50)) revert InvalidReceipt(evidenceHash);

        // Blast Radius Checks
        if (newLtv > policy.maxLtv) revert BlastRadiusExceeded("LTV");
        if (newCap > policy.maxCap) revert BlastRadiusExceeded("CAP");

        policy.isFrozen = freeze;
        policy.lastUpdate = block.timestamp;

        emit PolicyUpdated(market, newLtv, newCap, freeze);
    }
}
