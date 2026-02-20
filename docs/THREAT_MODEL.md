# Reality Firewall v3: Threat Model & Security Hardening

## 1. System Overview
Reality Firewall v3 is an autonomous risk orchestration system designed to protect DeFi protocols from oracle manipulation, stale data, and liquidity attacks. It integrates Chainlink CRE for verifiable signals, x402 for micropayment-gated drills, and ERC-8004 for agent identity.

## 2. Threat Analysis

### 2.1 Oracle Manipulation
- **Threat**: Attacker manipulates a DEX price to create a false divergence or hide a real one.
- **Mitigation**: Reality Firewall compares Chainlink Data Feeds (primary) with multiple DEX sources (secondary) via CRE. The `RiskEngine` uses deterministic scoring to flag significant deviations.

### 2.2 Stale Data Feeds
- **Threat**: Data feeds stop updating during high volatility, leading to incorrect protocol actions.
- **Mitigation**: CRE workflows check the `updatedAt` timestamp of feeds. The `RiskEngine` adds a staleness penalty to the risk score, triggering defensive actions like `FREEZE_MARKET` if data is too old.

### 2.3 Unauthorized Policy Execution
- **Threat**: Malicious actor attempts to call `PolicyGuard.enforcePolicy` to freeze a market or change LTV.
- **Mitigation**: 
  - `PolicyGuard` requires a valid `evidenceHash` anchored in `ReceiptRegistry`.
  - `ReceiptRegistry` only allows authorized `agentId` (ERC-8004) to anchor receipts.
  - `PolicyGuard` implements **Blast Radius Limits**: LTV and Caps cannot be adjusted beyond pre-defined safety bounds, even with a valid receipt.

### 2.4 Gateway Compromise
- **Threat**: The Fastify Gateway is compromised, and the attacker tries to generate fake receipts.
- **Mitigation**:
  - Gateway uses `helmet`, `cors`, and `rate-limit` for basic hardening.
  - Production deployment should use AWS KMS or a similar HSM for the `AGENT_PRIVATE_KEY`.
  - All receipts are deterministic; any tampering with the JSON will result in a different `evidenceHash`, failing the on-chain verification.

## 3. Security Hardening Checklist

- [x] **Deterministic Hashing**: SHA256 of canonicalized JSON for verifiable receipts.
- [x] **Blast Radius Control**: Hard limits in `PolicyGuard.sol`.
- [x] **Agent Identity**: ERC-8004 compliant agent anchoring.
- [x] **Micropayment Gating**: x402 prevents DoS on expensive risk drills.
- [x] **Strict Types**: TypeScript strict mode across all modules.
- [x] **No Build Hacks**: Clean CI/CD paths, no `ignoreBuildErrors`.

## 4. Auditability
Every risk action is backed by a `Defense Receipt`. These receipts are:
1. **Verifiable**: Anyone can re-run the `RiskEngine` logic with the same signals to get the same hash.
2. **Immutable**: Anchored on-chain in `ReceiptRegistry`.
3. **Attributable**: Signed/Anchored by a specific ERC-8004 Agent.
