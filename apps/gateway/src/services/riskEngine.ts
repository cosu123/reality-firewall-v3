import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";

export interface RiskSignals {
  asset: string;
  oraclePrice: number;
  dexPrice: number;
  divergencePct: number;
  stalenessSeconds: number;
  liquidityUsd: number;
  fundingRate: number;
  oracleSource: string;
  dexSource: string;
}

export interface RiskAction {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  ltvAdjustmentPct?: number;
  capAdjustmentPct?: number;
}

export interface RiskResult {
  runId: string;
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
  levelLabel: string;
  vulnerabilityClass: string;
  actions: RiskAction[];
  evidenceHash: string;
  canonicalJson: string;
  timestamp: number;
  signals: RiskSignals;
  aiAnalysis?: string;
  signature?: string;
}

/** RFC-8785 canonical JSON — recursive key sort */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return "{" + sorted.join(",") + "}";
}

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

const DATA_FEEDS: Record<string, { address: string; decimals: number }> = {
  WETH: { address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", decimals: 8 },
  WBTC: { address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", decimals: 8 },
  LINK: { address: "0xc59E3633BAAC79493d908e63626716e204a45EdF", decimals: 8 },
  USDC: { address: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", decimals: 8 },
};

const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() external view returns (uint8)",
];

const BASE_PRICES: Record<string, number> = {
  WETH: 2780, WBTC: 62000, LINK: 14.5, USDC: 1.0,
};

const COIN_IDS: Record<string, string> = {
  WETH: "ethereum", WBTC: "bitcoin", LINK: "chainlink", USDC: "usd-coin",
};

export async function fetchOraclePrice(asset: string): Promise<{ price: number; updatedAt: number; source: string }> {
  const feed = DATA_FEEDS[asset.toUpperCase()];
  if (!feed) {
    const p = BASE_PRICES[asset.toUpperCase()] ?? 100;
    return { price: p + (Math.random() - 0.5) * p * 0.005, updatedAt: Math.floor(Date.now() / 1000) - 25, source: "simulation" };
  }
  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const contract = new ethers.Contract(feed.address, AGGREGATOR_ABI, provider);
    const [, answer, , updatedAt] = await Promise.race([
      contract.latestRoundData(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]) as [bigint, bigint, bigint, bigint, bigint];
    return { price: Number(answer) / Math.pow(10, feed.decimals), updatedAt: Number(updatedAt), source: "chainlink-sepolia" };
  } catch {
    const base = BASE_PRICES[asset.toUpperCase()] ?? 100;
    return { price: base + (Math.random() - 0.5) * base * 0.006, updatedAt: Math.floor(Date.now() / 1000) - 30, source: "simulation" };
  }
}

export async function fetchDexPrice(asset: string): Promise<{ price: number; liquidityUsd: number; source: string }> {
  const coinId = COIN_IDS[asset.toUpperCase()];
  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    const data = await resp.json() as Record<string, { usd: number; usd_24h_vol?: number }>;
    const price = data[coinId]?.usd;
    if (!price) throw new Error("no price");
    return { price, liquidityUsd: (data[coinId]?.usd_24h_vol ?? 500_000_000) * 0.08, source: "coingecko" };
  } catch {
    const base = BASE_PRICES[asset.toUpperCase()] ?? 100;
    return { price: base * (1 + (Math.random() * 0.06 - 0.015)), liquidityUsd: 3_000_000 + Math.random() * 10_000_000, source: "simulation" };
  }
}

const LEVEL_LABELS = ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function getVulnerabilityClass(d: number, s: number, l: number): string {
  if (d > 10) return "ORACLE_DIVERGENCE_CRITICAL";
  if (d > 3) return "ORACLE_DIVERGENCE_ELEVATED";
  if (s > 3600) return "STALE_FEED_CRITICAL";
  if (s > 600) return "STALE_FEED";
  if (l < 500_000) return "THIN_LIQUIDITY_CRITICAL";
  if (l < 2_000_000) return "THIN_LIQUIDITY";
  return "NOMINAL";
}

export function computeRiskScore(signals: RiskSignals) {
  const { divergencePct: d, stalenessSeconds: s, liquidityUsd: l, fundingRate: f } = signals;
  let score = 0;
  score += d > 15 ? 40 : d > 10 ? 35 : d > 5 ? 25 : d > 2 ? 15 : d > 1 ? 8 : 0;
  score += s > 3600 ? 30 : s > 1800 ? 22 : s > 600 ? 15 : s > 90 ? 7 : 0;
  score += l < 100_000 ? 20 : l < 500_000 ? 14 : l < 1_000_000 ? 8 : l < 5_000_000 ? 3 : 0;
  score += Math.abs(f) > 0.5 ? 10 : Math.abs(f) > 0.2 ? 6 : Math.abs(f) > 0.1 ? 3 : 0;
  score = Math.min(100, score);
  const level: 0 | 1 | 2 | 3 | 4 = score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : score >= 15 ? 1 : 0;
  const actions: RiskAction[] = [];
  if (level >= 1) actions.push({ type: "MONITOR_CLOSELY", severity: "low", description: "Increase monitoring frequency to every 30s" });
  if (d > 2) actions.push({ type: "REDUCE_LTV", severity: "medium", description: `Reduce LTV by ${Math.min(10, Math.floor(d * 2))}% for affected markets`, ltvAdjustmentPct: -Math.min(10, Math.floor(d * 2)) });
  if (l < 5_000_000) actions.push({ type: "CAP_SUPPLY", severity: "medium", description: "Cap new supply to prevent liquidity drain", capAdjustmentPct: -15 });
  if (level >= 3) actions.push({ type: "PAUSE_BORROWS", severity: "high", description: "Pause new borrow positions until oracle stabilizes" });
  if (level >= 4) actions.push({ type: "FREEZE_MARKET", severity: "critical", description: "Emergency freeze — divergence exceeds safe threshold" });
  return { score, level, levelLabel: LEVEL_LABELS[level], vulnerabilityClass: getVulnerabilityClass(d, s, l), actions };
}

export async function callClaudeAI(signals: RiskSignals, risk: ReturnType<typeof computeRiskScore>): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (risk.level === 0) return "Oracle and DEX prices are aligned within safe tolerance bands. No immediate intervention required.";
    if (risk.level <= 2) return `Mild divergence of ${signals.divergencePct.toFixed(2)}% detected between Chainlink feed and DEX spot. Recommend monitoring and conservative LTV adjustments.`;
    return `Critical oracle manipulation signal: ${signals.divergencePct.toFixed(2)}% price divergence with ${signals.stalenessSeconds}s staleness. Immediate market freeze recommended to prevent protocol insolvency.`;
  }
  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `DeFi security expert. 2-sentence threat assessment only, no preamble.\n\nAsset: ${signals.asset} | Oracle: $${signals.oraclePrice.toFixed(2)} (${signals.oracleSource}) | DEX: $${signals.dexPrice.toFixed(2)} (${signals.dexSource}) | Divergence: ${signals.divergencePct.toFixed(3)}% | Staleness: ${signals.stalenessSeconds}s | Liquidity: $${(signals.liquidityUsd / 1e6).toFixed(2)}M | Score: ${risk.score}/100 (${risk.levelLabel}) | Class: ${risk.vulnerabilityClass}`,
      }],
    });
    return (msg.content[0] as { text: string }).text;
  } catch {
    return `Score ${risk.score}/100 [${risk.levelLabel}]: ${risk.vulnerabilityClass} detected. Review recommended actions immediately.`;
  }
}

export async function buildRiskResult(asset: string, isDrill: boolean, drillOverrides?: Partial<RiskSignals>): Promise<RiskResult> {
  const runId = `rfw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const [oracle, dex] = await Promise.all([fetchOraclePrice(asset), fetchDexPrice(asset)]);

  const now = Math.floor(Date.now() / 1000);
  const stalenessSeconds = oracle.updatedAt > 0 ? Math.max(0, now - oracle.updatedAt) : 30;
  const divergencePct = Math.abs((oracle.price - dex.price) / oracle.price) * 100;

  const signals: RiskSignals = {
    asset,
    oraclePrice: oracle.price,
    dexPrice: dex.price,
    divergencePct,
    stalenessSeconds,
    liquidityUsd: dex.liquidityUsd,
    fundingRate: (Math.random() - 0.48) * 0.35,
    oracleSource: oracle.source,
    dexSource: dex.source,
    ...drillOverrides,
  };

  const risk = computeRiskScore(signals);
  const aiAnalysis = await callClaudeAI(signals, risk);

  const receiptPayload = {
    actions: risk.actions.map((a) => ({ description: a.description, severity: a.severity, type: a.type })),
    aiAnalysis,
    asset,
    divergencePct: Math.round(signals.divergencePct * 10000) / 10000,
    dexPrice: Math.round(signals.dexPrice * 100) / 100,
    dexSource: signals.dexSource,
    fundingRate: Math.round(signals.fundingRate * 10000) / 10000,
    isDrill,
    level: risk.level,
    levelLabel: risk.levelLabel,
    liquidityUsd: Math.round(signals.liquidityUsd),
    oraclePrice: Math.round(signals.oraclePrice * 100) / 100,
    oracleSource: signals.oracleSource,
    runId,
    score: risk.score,
    stalenessSeconds: signals.stalenessSeconds,
    timestamp,
    vulnerabilityClass: risk.vulnerabilityClass,
    workflowVersion: "3.0.0",
  };

  const canonical = canonicalJson(receiptPayload);
  const evidenceHash = "0x" + ethers.sha256(ethers.toUtf8Bytes(canonical)).slice(2);

  // EIP-712 Signing
  let signature: string | undefined;
  const agentPrivateKey = process.env.AGENT_PRIVATE_KEY;
  if (agentPrivateKey) {
    const wallet = new ethers.Wallet(agentPrivateKey);
    const domain = {
      name: "RealityFirewall",
      version: "3.0.0",
      chainId: 11155111, // Sepolia
      verifyingContract: process.env.RECEIPT_REGISTRY_ADDRESS || ethers.ZeroAddress,
    };

    const types = {
      Receipt: [
        { name: "evidenceHash", type: "bytes32" },
        { name: "runIdHash", type: "bytes32" },
        { name: "agentId", type: "address" },
        { name: "score", type: "uint8" },
        { name: "level", type: "uint8" },
        { name: "isDrill", type: "bool" },
      ],
    };

    const value = {
      evidenceHash,
      runIdHash: ethers.keccak256(ethers.toUtf8Bytes(runId)),
      agentId: wallet.address,
      score: risk.score,
      level: risk.level,
      isDrill,
    };

    signature = await wallet.signTypedData(domain, types, value);
  }

  return { runId, score: risk.score, level: risk.level, levelLabel: risk.levelLabel, vulnerabilityClass: risk.vulnerabilityClass, actions: risk.actions, evidenceHash, canonicalJson: canonical, timestamp, signals, aiAnalysis, signature };
}
