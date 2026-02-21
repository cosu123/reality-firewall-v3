// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ReceiptRegistry.sol";
import "../src/PolicyGuard.sol";
import "../src/RiskSignalConsumer.sol";

/**
 * @notice Deploy all Reality Firewall v3 contracts to Sepolia
 * @dev Run: forge script contracts/script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --private-key $PRIVATE_KEY --broadcast
 */
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy ReceiptRegistry
        ReceiptRegistry registry = new ReceiptRegistry();
        console.log("ReceiptRegistry:", address(registry));

        // 2. Deploy PolicyGuard (depends on registry)
        PolicyGuard guard = new PolicyGuard(address(registry));
        console.log("PolicyGuard:", address(guard));

        // 3. Deploy RiskSignalConsumer
        RiskSignalConsumer consumer = new RiskSignalConsumer();
        console.log("RiskSignalConsumer:", address(consumer));

        // 4. Authorize PolicyGuard to read receipts (already can via interface)
        // 5. Example: initialize a demo market
        guard.initMarket(
            address(0xDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEf), // demo market
            8000,     // 80% max LTV (8000 bps)
            50_000_000e18  // $50M max supply cap
        );

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("Add these to your .env:");
        console.log("RECEIPT_REGISTRY_ADDRESS=", address(registry));
        console.log("POLICY_GUARD_ADDRESS=", address(guard));
        console.log("RISK_SIGNAL_CONSUMER_ADDRESS=", address(consumer));
    }
}
