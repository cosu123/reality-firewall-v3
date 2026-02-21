// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ReceiptRegistry.sol";
import "../src/PolicyGuard.sol";
import "../src/interfaces/IReceiptRegistry.sol";

/**
 * @title RealityFirewallTest
 * @notice Foundry test suite for Reality Firewall v3 contracts
 * @dev Run: forge test --match-path contracts/test/RealityFirewall.t.sol -vv
 */
contract RealityFirewallTest is Test {
    ReceiptRegistry public registry;
    PolicyGuard     public guard;

    address public owner   = address(this);
    address public agent1  = makeAddr("agent1");
    address public agent2  = makeAddr("agent2");
    address public market1 = makeAddr("market1");
    address public attacker = makeAddr("attacker");

    // Sample evidence hashes (represent SHA-256 of canonical JSON)
    bytes32 constant EVIDENCE_A = keccak256("rfw:drill:weth:divergence:5pct");
    bytes32 constant EVIDENCE_B = keccak256("rfw:check:wbtc:nominal");
    bytes32 constant EVIDENCE_C = keccak256("rfw:drill:link:critical:12pct");

    bytes32 constant RUN_ID_A = keccak256("rfw_1234567890_abc123");
    bytes32 constant RUN_ID_B = keccak256("rfw_1234567891_def456");
    bytes32 constant RUN_ID_C = keccak256("rfw_1234567892_ghi789");

    // ── Setup ──────────────────────────────────────────────────────────────────
    function setUp() public {
        registry = new ReceiptRegistry();
        guard    = new PolicyGuard(address(registry));

        // Authorize agent1 to anchor
        registry.setAuthorizedAgent(agent1, true);

        // Authorize guard to enforce policies
        guard.setExecutor(address(this), true);

        // Initialize market1 with 80% max LTV (8000 bps) and $50M cap
        guard.initMarket(market1, 8000, 50_000_000e18);
    }

    // ── ReceiptRegistry Tests ─────────────────────────────────────────────────

    /// @notice Owner can anchor a receipt
    function test_AnchorReceipt_Success() public {
        vm.prank(agent1);
        bool ok = registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);
        assertTrue(ok);

        IReceiptRegistry.Receipt memory r = registry.getReceipt(EVIDENCE_A);
        assertEq(r.evidenceHash, EVIDENCE_A);
        assertEq(r.runIdHash,    RUN_ID_A);
        assertEq(r.agentId,      agent1);
        assertEq(r.score,        65);
        assertEq(r.level,        3);
        assertTrue(r.isDrill);
        assertGt(r.timestamp, 0);
    }

    /// @notice Receipt exists check works
    function test_ReceiptExists() public {
        assertFalse(registry.receiptExists(EVIDENCE_A));

        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);

        assertTrue(registry.receiptExists(EVIDENCE_A));
    }

    /// @notice Duplicate anchor is rejected
    function test_AnchorReceipt_Duplicate_Reverts() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);

        vm.prank(agent1);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.ReceiptAlreadyExists.selector, EVIDENCE_A));
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);
    }

    /// @notice Unauthorized agent cannot anchor
    function test_AnchorReceipt_Unauthorized_Reverts() public {
        vm.prank(agent2); // not authorized
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.UnauthorizedAgent.selector, agent2));
        registry.anchorReceipt(EVIDENCE_B, RUN_ID_B, agent2, 20, 1, false);
    }

    /// @notice Score > 100 is rejected
    function test_AnchorReceipt_InvalidScore_Reverts() public {
        vm.prank(agent1);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.InvalidScore.selector, 101));
        registry.anchorReceipt(EVIDENCE_B, RUN_ID_B, agent1, 101, 0, false);
    }

    /// @notice Level > 4 is rejected
    function test_AnchorReceipt_InvalidLevel_Reverts() public {
        vm.prank(agent1);
        vm.expectRevert(abi.encodeWithSelector(ReceiptRegistry.InvalidLevel.selector, 5));
        registry.anchorReceipt(EVIDENCE_B, RUN_ID_B, agent1, 50, 5, false);
    }

    /// @notice Zero address as agentId is rejected
    function test_AnchorReceipt_ZeroAgent_Reverts() public {
        vm.prank(agent1);
        vm.expectRevert(ReceiptRegistry.ZeroAddress.selector);
        registry.anchorReceipt(EVIDENCE_B, RUN_ID_B, address(0), 50, 2, false);
    }

    /// @notice verifyReceipt returns true for sufficient score
    function test_VerifyReceipt_SufficientScore() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);

        assertTrue(registry.verifyReceipt(EVIDENCE_A, 50));   // 65 >= 50 ✅
        assertTrue(registry.verifyReceipt(EVIDENCE_A, 65));   // 65 >= 65 ✅
        assertFalse(registry.verifyReceipt(EVIDENCE_A, 66));  // 65 < 66  ❌
    }

    /// @notice verifyReceipt returns false for non-existent receipt
    function test_VerifyReceipt_NotFound() public {
        assertFalse(registry.verifyReceipt(EVIDENCE_A, 0));
    }

    /// @notice Event emitted on anchor
    function test_AnchorReceipt_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit IReceiptRegistry.ReceiptAnchored(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);

        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, 65, 3, true);
    }

    /// @notice Attacker cannot anchor even with valid data
    function test_AnchorReceipt_Attacker_Reverts() public {
        vm.prank(attacker);
        vm.expectRevert();
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, attacker, 99, 4, true);
    }

    // ── PolicyGuard Tests ─────────────────────────────────────────────────────

    /// @notice Policy enforcement with verified receipt succeeds
    function test_EnforcePolicy_Success() public {
        // First anchor a receipt with score >= 50
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_C, RUN_ID_C, agent1, 85, 4, true);

        // Enforce: reduce LTV from 8000 to 6000 (25% reduction — within blast radius)
        guard.enforcePolicy(market1, EVIDENCE_C, 6000, 40_000_000e18, false);

        (uint256 ltv1, uint256 cap1, bool frozen1,) = guard.getPolicy(market1);
        assertEq(ltv1, 6000);
        assertEq(cap1, 40_000_000e18);
        assertFalse(frozen1);
    }

    /// @notice Freeze market works
    function test_EnforcePolicy_FreezeMarket() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_C, RUN_ID_C, agent1, 90, 4, true);

        guard.enforcePolicy(market1, EVIDENCE_C, 0, 0, true);

        (,,bool frozenM,) = guard.getPolicy(market1);
        assertTrue(frozenM);
    }

    /// @notice Blast radius: LTV cannot exceed maxLtv
    function test_EnforcePolicy_BlastRadius_LTV_Reverts() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_C, RUN_ID_C, agent1, 85, 4, true);

        // maxLtv is 8000, try to set to 9000
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.BlastRadiusExceeded.selector, "LTV"));
        guard.enforcePolicy(market1, EVIDENCE_C, 9000, 40_000_000e18, false);
    }

    /// @notice Blast radius: cap cannot exceed maxCap
    function test_EnforcePolicy_BlastRadius_Cap_Reverts() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_C, RUN_ID_C, agent1, 85, 4, true);

        // maxCap is 50M, try to set to 100M
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.BlastRadiusExceeded.selector, "CAP"));
        guard.enforcePolicy(market1, EVIDENCE_C, 6000, 100_000_000e18, false);
    }

    /// @notice Invalid receipt (not anchored) reverts
    function test_EnforcePolicy_InvalidReceipt_Reverts() public {
        bytes32 fakeHash = keccak256("fake evidence");
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.InvalidReceipt.selector, fakeHash));
        guard.enforcePolicy(market1, fakeHash, 6000, 40_000_000e18, false);
    }

    /// @notice Low-score receipt (< 50) reverts
    function test_EnforcePolicy_LowScore_Reverts() public {
        vm.prank(agent1);
        // Score 30 — below minScore threshold
        registry.anchorReceipt(EVIDENCE_B, RUN_ID_B, agent1, 30, 1, false);

        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.InvalidReceipt.selector, EVIDENCE_B));
        guard.enforcePolicy(market1, EVIDENCE_B, 6000, 40_000_000e18, false);
    }

    /// @notice Unauthorized executor cannot enforce
    function test_EnforcePolicy_UnauthorizedExecutor_Reverts() public {
        vm.prank(agent1);
        registry.anchorReceipt(EVIDENCE_C, RUN_ID_C, agent1, 85, 4, true);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(PolicyGuard.UnauthorizedExecutor.selector, attacker));
        guard.enforcePolicy(market1, EVIDENCE_C, 6000, 40_000_000e18, false);
    }

    // ── Integration: Full flow ─────────────────────────────────────────────────

    /**
     * @notice Simulate the full Reality Firewall flow:
     * 1. Agent detects CRITICAL oracle manipulation (score=90)
     * 2. Anchors Defense Receipt
     * 3. PolicyGuard enforces: reduce LTV + freeze market
     * 4. Verify receipt exists onchain
     */
    function test_Integration_FullFlow() public {
        // [CRE Workflow] detects CRITICAL divergence
        bytes32 criticalEvidence = keccak256(
            abi.encodePacked("rfw:drill:weth:critical:timestamp:", block.timestamp)
        );
        bytes32 criticalRunId = keccak256("rfw_critical_run_001");

        // [Gateway] anchors the Defense Receipt
        vm.prank(agent1);
        bool anchored = registry.anchorReceipt(
            criticalEvidence, criticalRunId, agent1,
            90,  // score
            4,   // CRITICAL
            true // isDrill
        );
        assertTrue(anchored, "Receipt should anchor");

        // [PolicyGuard] enforces blast-radius-limited actions
        guard.enforcePolicy(
            market1, criticalEvidence,
            4000,          // reduce LTV from 8000 to 4000 (50% reduction)
            25_000_000e18, // halve supply cap
            false          // not frozen yet
        );

        // [Verify] receipt is onchain
        assertTrue(registry.receiptExists(criticalEvidence));

        IReceiptRegistry.Receipt memory r = registry.getReceipt(criticalEvidence);
        assertEq(r.score, 90);
        assertEq(r.level, 4);
        assertTrue(r.isDrill);

        // [Verify] market policy updated
        (uint256 ltvF, uint256 capF,,) = guard.getPolicy(market1);
        assertEq(ltvF, 4000);
        assertEq(capF, 25_000_000e18);

        // [Verify] receipt is verifiable with minScore 80
        assertTrue(registry.verifyReceipt(criticalEvidence, 80));
    }

    // ── Fuzz Tests ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: any score 0-100 and level 0-4 anchors successfully
    function testFuzz_AnchorReceipt_ValidRanges(uint8 score, uint8 level) public {
        vm.assume(score <= 100);
        vm.assume(level <= 4);

        bytes32 fuzzHash = keccak256(abi.encodePacked(score, level, block.timestamp));
        bytes32 fuzzRun  = keccak256(abi.encodePacked("fuzz", score, level));

        vm.prank(agent1);
        bool ok = registry.anchorReceipt(fuzzHash, fuzzRun, agent1, score, level, false);
        assertTrue(ok);
    }

    /// @notice Fuzz: score > 100 always reverts
    function testFuzz_AnchorReceipt_InvalidScore(uint8 score) public {
        vm.assume(score > 100);
        vm.prank(agent1);
        vm.expectRevert();
        registry.anchorReceipt(EVIDENCE_A, RUN_ID_A, agent1, score, 0, false);
    }
}
