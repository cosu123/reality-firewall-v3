/**
 * lib/erc8004.ts — ERC-8004 Trustless Agents Client
 * ===================================================
 * EIP live on Ethereum Mainnet since January 29, 2026
 * Co-authors: MetaMask, Ethereum Foundation, Google, Coinbase
 *
 * Registry Contracts (REAL deployed addresses):
 *   Mainnet IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   Mainnet ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *   Sepolia IdentityRegistry:   0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   Sepolia ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713
 *
 * EIP:      https://eips.ethereum.org/EIPS/eip-8004
 * Contracts: https://github.com/erc-8004/erc-8004-contracts
 */
import type { AgentCard, AgentIdentity } from "./types.js";

const REGISTRIES = {
  mainnet: {
    identity:   "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    rpc:        "https://ethereum-rpc.publicnode.com",
    caip2:      "eip155:1",
    explorer:   "https://etherscan.io",
  },
  sepolia: {
    identity:   "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    rpc:        process.env.EVM_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
    caip2:      "eip155:11155111",
    explorer:   "https://sepolia.etherscan.io",
  },
};

/** Reality Firewall Agent Card (EIP-8004 #registration-v1 schema) */
export function buildAgentCard(gatewayUrl = "https://reality-firewall.io"): AgentCard {
  return {
    type:        "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name:        "Reality Firewall Risk Agent v3",
    description: "Autonomous DeFi oracle risk monitoring agent. Detects oracle divergence attacks, stale feeds, and thin liquidity exploits. Issues cryptographically signed Defense Receipts verified via Chainlink CRE. Accepts x402 micropayments (USDC/Base Sepolia). ERC-8004 compliant identity and reputation.",
    services:    [
      { name: "A2A",    endpoint: `${gatewayUrl}/.well-known/agent.json`,  version: "0.3.0"      },
      { name: "MCP",    endpoint: `${gatewayUrl}/mcp`,                     version: "2025-06-18"  },
      { name: "OpenAPI",endpoint: `${gatewayUrl}/docs`,                    version: "3.0"         },
    ],
    capabilities:   ["oracle-risk-analysis", "cre-workflow-execution", "x402-payments", "defi-circuit-breaker", "defense-receipts", "onchain-anchoring"],
    supportedTrust: ["reputation", "crypto-economic", "erc-8004"],
  };
}

export function buildAgentCardDataURI(gatewayUrl?: string): string {
  const card = buildAgentCard(gatewayUrl);
  return `data:application/json;base64,${Buffer.from(JSON.stringify(card)).toString("base64")}`;
}

/**
 * Reads tokenURI(uint256) from ERC-8004 IdentityRegistry via JSON-RPC
 * Selector: keccak256("tokenURI(uint256)") = 0xc87b56dd
 */
export async function readAgentURI(agentId: string, network: "mainnet" | "sepolia" = "sepolia"): Promise<string | null> {
  const net = REGISTRIES[network];
  try {
    const idHex = BigInt(agentId).toString(16).padStart(64, "0");
    const res   = await fetch(net.rpc, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params:  [{ to: net.identity, data: "0xc87b56dd" + idHex }, "latest"],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const { result } = await res.json() as { result?: string };
    if (!result || result === "0x" || result.length < 130) return null;
    // ABI decode string: offset(32) + length(32) + data
    const hex    = result.slice(2);
    const offset = parseInt(hex.slice(0, 64), 16) * 2;
    const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
    const strHex = hex.slice(offset + 64, offset + 64 + length);
    return Buffer.from(strHex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

/** Returns the full agent identity object */
export async function getAgentInfo(publicKey: string): Promise<AgentIdentity> {
  const network  = (process.env.USE_MAINNET === "true" ? "mainnet" : "sepolia") as "mainnet" | "sepolia";
  const net      = REGISTRIES[network];
  const agentId  = process.env.AGENT_ID ?? "rf-agent-demo";
  const agentAddr= process.env.AGENT_ADDRESS ?? "0x0000000000000000000000000000000000000000";

  // Try to read real Agent Card from registry if AGENT_ID is set
  let card: AgentCard = buildAgentCard();
  if (process.env.AGENT_ID) {
    const uri = await readAgentURI(process.env.AGENT_ID, network);
    if (uri?.startsWith("data:")) {
      try {
        card = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString()) as AgentCard;
      } catch { /* use default */ }
    }
  }

  return {
    agentId,
    agentAddress:  agentAddr,
    agentURI:      buildAgentCardDataURI(),
    agentRegistry: `${net.caip2}:${net.identity}`,
    card,
    publicKey,
    network,
    registries: {
      mainnetIdentity:   REGISTRIES.mainnet.identity,
      mainnetReputation: REGISTRIES.mainnet.reputation,
      sepoliaIdentity:   REGISTRIES.sepolia.identity,
      sepoliaReputation: REGISTRIES.sepolia.reputation,
      eip:               "https://eips.ethereum.org/EIPS/eip-8004",
    },
  };
}

/** Generates the cast command to register this agent on ERC-8004 */
export function buildMintCommand(network: "mainnet" | "sepolia" = "sepolia"): string {
  const net = REGISTRIES[network];
  const uri = buildAgentCardDataURI();
  return [
    `# Register Reality Firewall Risk Agent on ERC-8004 IdentityRegistry (${network})`,
    `cast send ${net.identity} \\`,
    `  "mint(address,string)" \\`,
    `  $AGENT_ADDRESS \\`,
    `  '${uri}' \\`,
    `  --rpc-url ${net.rpc} \\`,
    `  --private-key $AGENT_PRIVATE_KEY`,
    ``,
    `# View on Explorer: ${net.explorer}/address/${net.identity}`,
  ].join("\n");
}

/** Generates the cast command to submit reputation feedback */
export function buildFeedbackCommand(agentId: string, score: number, network: "mainnet" | "sepolia" = "sepolia"): string {
  const net       = REGISTRIES[network];
  const scoreInt  = Math.round(score * 100);
  return [
    `# Submit reputation feedback for agent ${agentId}`,
    `cast send ${net.reputation} \\`,
    `  "giveFeedback(uint256,int128,uint8,bytes1,bytes1,string,string,bytes32,bytes)" \\`,
    `  ${agentId} ${scoreInt} 2 0x00 0x00 "feedback" "" 0x0000000000000000000000000000000000000000000000000000000000000000 0x00 \\`,
    `  --rpc-url ${net.rpc} \\`,
    `  --private-key $CLIENT_PRIVATE_KEY`,
  ].join("\n");
}
