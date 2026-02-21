# 🔥 Reality Firewall v3

**Autonomous Risk Orchestration Layer for DeFi Protocols**

Reality Firewall v3 is a production-grade, security-hardened, and deterministic risk management system. It transforms protocol monitoring into **Defense-as-a-Service** with cryptographic accountability, integrating Chainlink CRE, x402 micropayments, and ERC-8004 agent identity.

---

## 🚀 Core Features

- **Chainlink CRE Workflows**: Verifiable risk signals (Oracle vs. DEX divergence, staleness, liquidity).
- **x402 Micropayment Gate**: Paid risk drills via USDC on Base Sepolia to prevent DoS and monetize infrastructure.
- **Deterministic Risk Engine**: Autonomous scoring (0-100) and recommended actions (LTV adjustment, caps, freeze).
- **On-chain Defense Receipts**: Verifiable `evidenceHash` anchored in `ReceiptRegistry.sol`.
- **PolicyGuard Enforcement**: Blast-radius-limited protocol parameter adjustments based on verified receipts.
- **ERC-8004 Agent Identity**: Cryptographic attribution for all risk orchestration actions.

---

## 🏗️ Repository Structure

```text
reality-firewall-v3/
├── apps/
│   ├── frontend/       # Next.js 14+ App Router (Institutional UI)
│   └── gateway/        # Fastify + TypeScript (Risk Orchestration API)
├── contracts/          # Foundry (ReceiptRegistry, PolicyGuard, Agent)
├── workflows/          # Chainlink CRE (Risk Check Workflows)
├── docs/               # Threat Model & Security Hardening
├── tenderly/           # Virtual TestNet simulations
└── package.json        # pnpm workspace root
```

---

## 🛠️ Technical Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Next.js 14, TailwindCSS, Framer Motion, Lucide |
| **Gateway** | Fastify, TypeScript, Ethers.js, Zod |
| **Contracts** | Solidity 0.8.20, Foundry |
| **Orchestration** | Chainlink CRE (Runtime Environment) |
| **Payments** | x402 (HTTP 402 Payment Required) |
| **Identity** | ERC-8004 (Agent Identity Model) |

---

## 🔒 Security & Hardening

Reality Firewall v3 is built with a **security-first** mindset:

1.  **Deterministic Hashing**: All receipts use SHA256 of canonicalized JSON for on-chain verification.
2.  **Blast Radius Limits**: `PolicyGuard.sol` enforces hard limits on parameter changes to prevent catastrophic failure.
3.  **Agent Attribution**: Every action is linked to a verified ERC-8004 agent identity.
4.  **Micropayment Gating**: x402 ensures that expensive risk drills are paid for, preventing resource exhaustion.

For a detailed analysis, see the [Threat Model](./docs/THREAT_MODEL.md).

---

## 🚦 Getting Started

### Prerequisites
- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Foundry (for contracts)

### Installation
```bash
pnpm install
```

### Development
```bash
# Start Gateway
cd apps/gateway && pnpm dev

# Start Frontend
cd apps/frontend && pnpm dev
```

---

## 📄 License
This project is licensed under the MIT License.
