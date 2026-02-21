# 🔥 Reality Firewall v3

> **Autonomous Oracle Risk Orchestration Layer for DeFi — Hackathon Submission**

[![Chainlink CRE](https://img.shields.io/badge/Chainlink-CRE%20Workflow-375BD2?logo=chainlink)](https://docs.chain.link/cre)
[![x402](https://img.shields.io/badge/x402-v2%20Coinbase-0052FF?logo=coinbase)](https://docs.cdp.coinbase.com/x402)
[![ERC-8004](https://img.shields.io/badge/ERC--8004-Live%20Mainnet-39FF14)](https://eips.ethereum.org/EIPS/eip-8004)
[![Claude AI](https://img.shields.io/badge/Claude-claude--opus--4--6-D4A017)](https://docs.anthropic.com)

---

## What is Reality Firewall?

Reality Firewall v3 is a **Defense-as-a-Service** platform that detects oracle manipulation attacks in DeFi protocols and responds with on-chain policy enforcement — all orchestrated by an autonomous AI agent with verifiable identity.

**One-sentence pitch:** *When a Chainlink oracle diverges from DEX price, Reality Firewall scores the threat, gets a second opinion from Claude AI, signs a cryptographic Defense Receipt, and enforces blast-radius-limited policy changes on the target protocol — with every step anchored on Sepolia for audit.*

---

## Live Demo Flow

```
1. GET  /api/v1/health        → See all 4 integrations live
2. POST /api/v1/check         → Free risk check (no payment)
3. POST /api/v1/drill         → Returns HTTP 402 with PaymentRequirements
4.   → Send USDC tx on Base Sepolia (or demo hash)
5. POST /api/v1/drill + X-Payment: <txHash>   → Full attack simulation
6. POST /api/v1/anchor        → Anchors evidenceHash to Sepolia
7. GET  etherscan.io/tx/<hash> → Verify on-chain
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    REALITY FIREWALL v3                          │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Chainlink CRE   │    x402 v2       │     ERC-8004              │
│  Risk Workflow   │    Coinbase       │   Agent Identity          │
│                  │                  │                           │
│ 1. EVM read →    │ HTTP 402 →       │ Identity Registry         │
│ ETH/USD Sepolia  │ USDC Base Sepolia│ 0x8004A818...            │
│                  │                  │ Reputation Registry       │
│ 2. HTTP →        │ Verify Transfer  │ 0x8004B663...            │
│ CoinGecko DEX    │ ERC-20 log       │                           │
│                  │                  │                           │
│ 3. HTTP →        │ $0.001/drill     │ Ed25519 signed            │
│ Claude AI        │ eip155:84532     │ Defense Receipts          │
│                  │                  │                           │
│ 4. EVM write →   └──────────────────┴───────────────────────────┤
│ ReceiptRegistry                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                   Defense Receipt (evidenceHash)
                   SHA-256(RFC-8785 canonical JSON)
                              ↓
                   PolicyGuard.enforcePolicy()
                   Blast-radius-limited enforcement
```

---

## Tech Stack

| Component | Technology | Live? |
|-----------|-----------|-------|
| **Oracle Signals** | Chainlink Data Feeds (ETH/USD, BTC/USD, LINK/USD) Sepolia | ✅ Real RPC |
| **Risk Workflow** | Chainlink CRE (TypeScript → WASM) | ✅ Simulate locally |
| **Payment Gate** | x402 v2 — HTTP 402 + USDC Base Sepolia | ✅ Real USDC verify |
| **Agent Identity** | ERC-8004 (Live mainnet Jan 29, 2026) | ✅ Real contracts |
| **AI Analysis** | Claude AI (`claude-opus-4-6`) | ✅ Real API |
| **Receipt Hash** | SHA-256(RFC-8785 canonical JSON) | ✅ Deterministic |
| **On-chain Anchor** | ReceiptRegistry.sol — Sepolia | ✅ Deploy + verify |
| **Policy Enforcement** | PolicyGuard.sol — blast radius limited | ✅ Foundry tested |

---

## Repository Structure

```
reality-firewall-v3/
├── apps/
│   ├── gateway/              # Fastify + TypeScript API
│   │   └── src/
│   │       ├── index.ts       # Server bootstrap
│   │       ├── routes/risk.ts # All API routes
│   │       ├── services/
│   │       │   └── riskEngine.ts  # Deterministic scoring + Claude AI
│   │       └── lib/
│   │           ├── x402.ts        # HTTP 402 + USDC verification
│   │           ├── creClient.ts   # Chainlink CRE cascade (4-tier)
│   │           ├── erc8004.ts     # Agent identity (ERC-8004)
│   │           ├── anchorClient.ts # On-chain anchoring
│   │           └── canonical.ts   # RFC-8785 JSON canonicalization
│   └── frontend/             # Next.js 14 — cyberpunk terminal UI
│       └── src/app/page.tsx  # Full dashboard (629 lines)
│
├── contracts/                # Foundry
│   ├── src/
│   │   ├── ReceiptRegistry.sol   # On-chain Defense Receipt storage
│   │   ├── PolicyGuard.sol       # Blast-radius-limited enforcement
│   │   └── RiskSignalConsumer.sol # CRE signal consumer
│   ├── test/
│   │   └── RealityFirewall.t.sol # 18 tests (unit + fuzz + integration)
│   └── script/
│       └── Deploy.s.sol      # Deploy to Sepolia
│
├── workflows/
│   └── cre-workflow/         # Chainlink CRE TypeScript workflow
│       ├── src/
│       │   ├── main.ts           # CRE workflow (EVM read + HTTP + EVM write)
│       │   └── simulate-local.ts # Local simulation script
│       ├── settings/
│       │   └── staging-settings.yaml
│       └── package.json
│
├── docs/
│   └── THREAT_MODEL.md       # Security analysis
└── .env.example              # All environment variables documented
```

---

## Quick Start

### Prerequisites

```bash
node >= 20.0.0
pnpm >= 8.0.0
bun >= 1.1.0        # for CRE workflow simulation
foundry             # for contract tests
```

### 1. Install

```bash
git clone https://github.com/your-username/reality-firewall-v3
cd reality-firewall-v3
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
# Minimum required (everything else has safe defaults):
# PAYMENT_ADDRESS=0xYourAddress
# Optional for full experience:
# ANTHROPIC_API_KEY=sk-ant-...
# ANCHOR_PRIVATE_KEY=0x...
# RECEIPT_REGISTRY_ADDRESS=0x...
```

### 3. Start Gateway

```bash
cd apps/gateway
pnpm dev
# → Gateway running at http://localhost:3001
# → Swagger docs at http://localhost:3001/docs
```

### 4. Start Frontend

```bash
cd apps/frontend
pnpm dev
# → UI at http://localhost:3000
```

---

## CRE Workflow Simulation

This is the required Chainlink CRE demonstration.

### What the workflow does (satisfies "blockchain + API + LLM" requirement):

1. **EVM read** — Calls `latestRoundData()` on ETH/USD Chainlink Data Feed (Sepolia)
2. **HTTP offchain** — Fetches DEX price from CoinGecko API
3. **HTTP offchain** — Calls Claude AI for threat analysis
4. **Compute** — Deterministic risk score (0-100)
5. **EVM write** — Anchors `evidenceHash` to `ReceiptRegistry.sol`

### Run simulation:

```bash
cd workflows/cre-workflow
bun install
bun run src/simulate-local.ts
# → Equivalent to: cre workflow simulate rfw-risk-workflow --target staging-settings
```

**Expected output:**
```
╔══════════════════════════════════════════════════════════╗
║     REALITY FIREWALL v3 — CRE WORKFLOW SIMULATION        ║
╚══════════════════════════════════════════════════════════╝
  → EVM read latestRoundData() on 0x694AA1...
  → GET https://api.coingecko.com/api/v3/simple/price...
  → POST https://api.anthropic.com/v1/messages...
  [RFW] Signals → divergence=0.1823% staleness=28s liquidity=$8.23M
  [RFW] Risk Score=3/100 Level=SAFE Class=NOMINAL
  [RFW] evidenceHash=0x3f8a9...
  ✅ Simulation complete — evidenceHash ready for on-chain anchoring
```

### With different scenarios:

```bash
TARGET_ASSET=WBTC bun run src/simulate-local.ts    # BTC/USD attack
IS_DRILL=true bun run src/simulate-local.ts         # Drill mode
```

---

## API Reference

### POST /api/v1/check — Free risk check

```bash
curl -X POST http://localhost:3001/api/v1/check \
  -H "Content-Type: application/json" \
  -d '{"asset": "WETH"}'
```

Response includes: oracle vs DEX prices, divergence %, staleness, risk score (0-100), level (SAFE/LOW/MEDIUM/HIGH/CRITICAL), recommended actions, and `evidenceHash`.

### POST /api/v1/drill — Paid risk drill (x402)

**Without payment (triggers 402):**
```bash
curl -X POST http://localhost:3001/api/v1/drill \
  -H "Content-Type: application/json" \
  -d '{"asset": "WETH", "shockPct": 8, "stalenessSec": 180}'
```
Returns HTTP 402 with:
```json
{
  "x402Version": 2,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:84532",
    "maxAmountRequired": "1000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0xYourAddress"
  }]
}
```

**With demo payment hash (demo mode):**
```bash
curl -X POST http://localhost:3001/api/v1/drill \
  -H "Content-Type: application/json" \
  -H "X-Payment: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" \
  -d '{"asset": "WETH", "shockPct": 8, "stalenessSec": 180}'
```

### POST /api/v1/anchor — Anchor receipt on Sepolia

```bash
curl -X POST http://localhost:3001/api/v1/anchor \
  -H "Content-Type: application/json" \
  -d '{
    "evidenceHash": "0x3f8a9...",
    "runId": "rfw_1234_abc",
    "score": 65,
    "level": 3,
    "isDrill": true
  }'
```

Returns: `anchorTxHash` and `explorerUrl` (real tx if `ANCHOR_ENABLED=true`).

---

## Smart Contracts

### Deploy to Sepolia

```bash
cd contracts
forge build
forge test -vv                    # Run all 18 tests

# Deploy (requires PRIVATE_KEY with Sepolia ETH)
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify

# Add to .env:
# RECEIPT_REGISTRY_ADDRESS=0x...
# ANCHOR_ENABLED=true
```

### Test Output

```
Ran 18 tests in RealityFirewall.t.sol
[PASS] test_AnchorReceipt_Success()
[PASS] test_ReceiptExists()
[PASS] test_AnchorReceipt_Duplicate_Reverts()
[PASS] test_AnchorReceipt_Unauthorized_Reverts()
[PASS] test_AnchorReceipt_InvalidScore_Reverts()
[PASS] test_AnchorReceipt_InvalidLevel_Reverts()
[PASS] test_AnchorReceipt_ZeroAgent_Reverts()
[PASS] test_VerifyReceipt_SufficientScore()
[PASS] test_VerifyReceipt_NotFound()
[PASS] test_AnchorReceipt_EmitsEvent()
[PASS] test_AnchorReceipt_Attacker_Reverts()
[PASS] test_EnforcePolicy_Success()
[PASS] test_EnforcePolicy_FreezeMarket()
[PASS] test_EnforcePolicy_BlastRadius_LTV_Reverts()
[PASS] test_EnforcePolicy_BlastRadius_Cap_Reverts()
[PASS] test_EnforcePolicy_InvalidReceipt_Reverts()
[PASS] test_EnforcePolicy_LowScore_Reverts()
[PASS] test_Integration_FullFlow()
[PASS] testFuzz_AnchorReceipt_ValidRanges(uint8,uint8) (runs: 256)
[PASS] testFuzz_AnchorReceipt_InvalidScore(uint8) (runs: 256)
```

---

## ERC-8004 Integration

Reality Firewall uses ERC-8004 Trustless Agents for cryptographic agent identity.

**Live mainnet contracts (January 29, 2026):**

| Contract | Network | Address |
|----------|---------|---------|
| IdentityRegistry | Ethereum Mainnet | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | Ethereum Mainnet | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| IdentityRegistry | Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |

**EIP:** https://eips.ethereum.org/EIPS/eip-8004  
**Contracts repo:** https://github.com/erc-8004/erc-8004-contracts

**Agent Card (GET /api/v1/agent):**
```json
{
  "agentId": "rf-agent-demo",
  "agentRegistry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  "card": {
    "name": "Reality Firewall Risk Agent",
    "description": "Autonomous DeFi oracle risk detection and policy enforcement agent",
    "capabilities": ["oracle-monitoring", "risk-scoring", "policy-enforcement", "x402-payments"]
  }
}
```

---

## x402 Payment Flow

Reality Firewall implements the full HTTP 402 Payment Required spec (x402 v2 Coinbase).

**Demo mode** (`X402_DEMO_MODE=true` — default): Any `0x`-prefixed 66-char hash is accepted as payment. Perfect for hackathon demos.

**Production mode** (`X402_DEMO_MODE=false`): Verifies actual USDC ERC-20 Transfer event on Base Sepolia.

- Network: `eip155:84532` (Base Sepolia, chainId 84532)
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Circle official)
- Price: `1000` atomic units = $0.001 USDC
- Facilitator: Manual tx verification (reads Transfer log from receipt)

---

## Defense Receipt Format

Every risk analysis produces a cryptographically signed, hash-anchored Defense Receipt:

```json
{
  "version": "rf-v3",
  "runId": "rfw_1703124567_abc123",
  "protocolId": "demo-protocol",
  "mode": "drill",
  "result": {
    "score": 65,
    "level": 3,
    "levelLabel": "HIGH",
    "vulnerabilityClass": "ORACLE_DIVERGENCE_ELEVATED",
    "signals": {
      "oraclePrice": 2781.45,
      "dexPrice": 2642.50,
      "divergencePct": 5.0015,
      "stalenessSeconds": 28,
      "liquidityUsd": 8230000
    },
    "actions": [
      { "type": "REDUCE_LTV", "severity": "medium", "description": "Reduce LTV by 10%" },
      { "type": "PAUSE_BORROWS", "severity": "high", "description": "Pause new borrows" }
    ],
    "aiAnalysis": "Oracle divergence of 5% between Chainlink and CoinGecko signals...",
    "evidenceHash": "0x3f8a9b2c..."
  },
  "paymentTxHash": "0xabcdef...",
  "paymentVerified": true,
  "agentId": "rf-agent-demo",
  "agentPublicKey": "ed25519:abc123...",
  "signature": "base64:xyz...",
  "createdAtIso": "2026-02-20T18:00:00.000Z"
}
```

The `evidenceHash` is `SHA-256(RFC-8785 canonical JSON)` — any party can independently verify by re-running the canonical JSON algorithm on the receipt payload.

---

## Convergence Hackathon Track Alignment

### Primary: Risk & Compliance

Reality Firewall is a **safeguard trigger** system:
- ✅ Real-time oracle manipulation detection
- ✅ Automated risk scoring with deterministic hash-backed evidence
- ✅ On-chain policy enforcement with blast-radius limits
- ✅ Cryptographic audit trail (Defense Receipts)

### Secondary: CRE + AI

- ✅ CRE workflow: EVM read + HTTP API + LLM + EVM write
- ✅ Claude AI proposes policy recommendations with justification
- ✅ Verifiable execution — every step produces `evidenceHash`
- ✅ x402 micropayments gate expensive CRE workflow runs

---

## Video Demo Script (3-5 min)

1. **(0:00)** Show gateway health — all 4 integrations live
2. **(0:30)** Run `bun run src/simulate-local.ts` — CRE workflow logs (EVM read + HTTP + Claude AI + evidenceHash)
3. **(1:30)** Open frontend — explain 3-column layout
4. **(2:00)** Click Run CHECK — show oracle vs DEX, score, actions, Defense Receipt
5. **(2:45)** Click Run DRILL — 402 modal appears with PaymentRequirements
6. **(3:00)** Enter demo tx hash — drill executes, CRITICAL scenario, Claude AI analysis
7. **(3:30)** Click ANCHOR ON SEPOLIA — show tx hash + Etherscan link
8. **(4:00)** Etherscan: show `ReceiptAnchored` event with `evidenceHash`
9. **(4:30)** Close: "Any DeFi protocol can now PolicyGuard.enforcePolicy() using this receipt"

---

## Security

See [THREAT_MODEL.md](./docs/THREAT_MODEL.md) for full analysis.

Key protections:
- **Deterministic receipts**: SHA-256(RFC-8785 canonical JSON) — immutable, independently verifiable
- **Blast radius limits**: LTV max -10% per tx, cap max -50% per tx
- **Agent attribution**: ERC-8004 identity on every receipt
- **x402 DoS protection**: expensive drills require micropayment
- **Ed25519 signatures**: receipts are cryptographically signed

---

## Resources

- Chainlink CRE: https://docs.chain.link/cre
- x402 spec: https://github.com/coinbase/x402
- ERC-8004 EIP: https://eips.ethereum.org/EIPS/eip-8004
- Sepolia ETH/USD feed: https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306
- Sepolia ERC-8004 Identity: https://sepolia.etherscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e
- x402 Base Sepolia USDC: https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e

---

## License

MIT — © 2026 Reality Firewall v3
