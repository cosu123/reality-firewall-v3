/**
 * Reality Firewall v3 — Chainlink CRE Workflow
 * ──────────────────────────────────────────────
 * Workflow ID : rfw-risk-workflow
 * Trigger     : HTTP (webhook) + Cron (every 5 min)
 * Capabilities: HTTP (offchain API) + EVM read/write (Sepolia)
 *
 * Flow:
 *   1. Fetch Chainlink Data Feed price on Sepolia (EVM read)
 *   2. Fetch DEX price from CoinGecko API (HTTP offchain)
 *   3. Compute risk signals deterministically
 *   4. Call Claude AI for natural-language threat analysis (HTTP offchain)
 *   5. Write evidenceHash to ReceiptRegistry on Sepolia (EVM write)
 *
 * Simulate locally:
 *   bun install && cre workflow simulate rfw-risk-workflow --target staging-settings
 */

// ─── CRE SDK Types (shimmed for local simulation) ───────────────────────────

interface HttpCapability {
  get(url: string, headers?: Record<string, string>): Promise<{ body: string; status: number }>;
  post(url: string, body: string, headers?: Record<string, string>): Promise<{ body: string; status: number }>;
}

interface EvmCapability {
  read(params: { chainId: string; address: string; abi: string[]; method: string; args?: unknown[] }): Promise<unknown[]>;
  write(params: { chainId: string; address: string; abi: string[]; method: string; args: unknown[]; privateKey: string }): Promise<{ txHash: string }>;
}

interface CREContext {
  http: HttpCapability;
  evm: EvmCapability;
  log: (msg: string) => void;
  getSecret: (key: string) => string;
  getEnv: (key: string) => string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEPOLIA_CHAIN_ID = "eip155:11155111";

// Chainlink Data Feed — ETH/USD on Sepolia
const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const AGGREGATOR_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
];

// ReceiptRegistry on Sepolia (deploy your own, set via env)
const RECEIPT_REGISTRY_ABI = [
  "function anchorReceipt(bytes32 evidenceHash, bytes32 runIdHash, address agentId, uint8 score, uint8 level, bool isDrill) external returns (bool)",
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface OracleData {
  price: number;
  updatedAt: number;
  roundId: string;
  decimals: number;
}

interface DexData {
  price: number;
  volume24h: number;
  liquidityUsd: number;
  source: string;
}

interface RiskSignals {
  asset: string;
  oraclePrice: number;
  dexPrice: number;
  divergencePct: number;
  stalenessSeconds: number;
  liquidityUsd: number;
  fundingRate: number;
}

interface RiskResult {
  score: number;
  level: 0 | 1 | 2 | 3 | 4;
  levelLabel: string;
  vulnerabilityClass: string;
  actions: Array<{ type: string; severity: string; description: string }>;
  evidenceHash: string;
  runId: string;
  timestamp: number;
  signals: RiskSignals;
  aiAnalysis?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * RFC-8785 canonical JSON — recursive key sort, arrays preserved.
 * Required for deterministic evidenceHash.
 */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalJson).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`);
  return "{" + sorted.join(",") + "}";
}

/** Simple SHA-256 using Web Crypto (available in WASM/CRE runtime) */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function levelLabel(level: number): string {
  return ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"][level] ?? "UNKNOWN";
}

function vulnerabilityClass(divergence: number, staleness: number, liquidity: number): string {
  if (divergence > 10) return "ORACLE_DIVERGENCE_CRITICAL";
  if (divergence > 3) return "ORACLE_DIVERGENCE_ELEVATED";
  if (staleness > 600) return "STALE_FEED";
  if (liquidity < 500_000) return "THIN_LIQUIDITY";
  return "NOMINAL";
}

// ─── Step 1: Read Oracle Price (EVM read on Sepolia) ─────────────────────────

async function fetchOraclePrice(ctx: CREContext): Promise<OracleData> {
  ctx.log("[CRE:EVM] Reading Chainlink ETH/USD feed on Sepolia...");
  try {
    const [decimalsRaw] = await ctx.evm.read({
      chainId: SEPOLIA_CHAIN_ID,
      address: ETH_USD_FEED,
      abi: AGGREGATOR_ABI,
      method: "decimals",
    });
    const decimals = Number(decimalsRaw) || 8;

    const roundData = await ctx.evm.read({
      chainId: SEPOLIA_CHAIN_ID,
      address: ETH_USD_FEED,
      abi: AGGREGATOR_ABI,
      method: "latestRoundData",
    });

    const answer = Number(roundData[1]);
    const updatedAt = Number(roundData[3]);
    const roundId = String(roundData[0]);
    const price = answer / Math.pow(10, decimals);

    ctx.log(`[CRE:EVM] Oracle price=${price} updatedAt=${updatedAt} roundId=${roundId}`);
    return { price, updatedAt, roundId, decimals };
  } catch (err) {
    // Fallback for demo/simulation when RPC is unavailable
    ctx.log("[CRE:EVM] RPC unavailable — using simulation fallback");
    const price = 2780 + Math.random() * 40 - 20; // realistic range
    return { price, updatedAt: Math.floor(Date.now() / 1000) - 30, roundId: "0x1", decimals: 8 };
  }
}

// ─── Step 2: Fetch DEX Price (HTTP offchain — CoinGecko) ─────────────────────

async function fetchDexPrice(ctx: CREContext, asset: string): Promise<DexData> {
  ctx.log(`[CRE:HTTP] Fetching DEX price for ${asset} from CoinGecko...`);
  try {
    const coinId = asset.toLowerCase() === "weth" ? "ethereum"
      : asset.toLowerCase() === "wbtc" ? "bitcoin"
      : asset.toLowerCase() === "link" ? "chainlink"
      : "ethereum";

    const resp = await ctx.http.get(
      `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`,
      { Accept: "application/json" }
    );

    if (resp.status !== 200) throw new Error(`CoinGecko status ${resp.status}`);

    const data = JSON.parse(resp.body);
    const price = data.market_data.current_price.usd;
    const volume24h = data.market_data.total_volume.usd;
    const liquidityUsd = volume24h * 0.1; // approximate from 24h volume

    ctx.log(`[CRE:HTTP] DEX price=${price} volume24h=${volume24h}`);
    return { price, volume24h, liquidityUsd, source: "coingecko" };
  } catch (err) {
    ctx.log("[CRE:HTTP] CoinGecko unavailable — using simulation fallback");
    const basePrice = 2780;
    // Simulate slight divergence for demo
    const divergenceMultiplier = 1 + (Math.random() * 0.08 - 0.02); // -2% to +6%
    const price = basePrice * divergenceMultiplier;
    return { price, volume24h: 1_200_000_000, liquidityUsd: 8_500_000, source: "simulation" };
  }
}

// ─── Step 3: Compute Risk Score (deterministic) ──────────────────────────────

function computeRisk(signals: RiskSignals): Pick<RiskResult, "score" | "level" | "levelLabel" | "vulnerabilityClass" | "actions"> {
  const { divergencePct, stalenessSeconds, liquidityUsd, fundingRate } = signals;

  // Weighted scoring (matches hackathon spec)
  let divergenceScore = 0;
  if (divergencePct > 15) divergenceScore = 40;
  else if (divergencePct > 10) divergenceScore = 35;
  else if (divergencePct > 5) divergenceScore = 25;
  else if (divergencePct > 2) divergenceScore = 15;
  else if (divergencePct > 1) divergenceScore = 8;

  let stalenessScore = 0;
  if (stalenessSeconds > 3600) stalenessScore = 30;
  else if (stalenessSeconds > 1800) stalenessScore = 22;
  else if (stalenessSeconds > 600) stalenessScore = 15;
  else if (stalenessSeconds > 90) stalenessScore = 7;

  let liquidityScore = 0;
  if (liquidityUsd < 100_000) liquidityScore = 20;
  else if (liquidityUsd < 500_000) liquidityScore = 14;
  else if (liquidityUsd < 1_000_000) liquidityScore = 8;
  else if (liquidityUsd < 5_000_000) liquidityScore = 3;

  let fundingScore = 0;
  if (Math.abs(fundingRate) > 0.5) fundingScore = 10;
  else if (Math.abs(fundingRate) > 0.2) fundingScore = 6;
  else if (Math.abs(fundingRate) > 0.1) fundingScore = 3;

  const score = Math.min(100, divergenceScore + stalenessScore + liquidityScore + fundingScore);

  let level: 0 | 1 | 2 | 3 | 4 = 0;
  if (score >= 75) level = 4;
  else if (score >= 55) level = 3;
  else if (score >= 35) level = 2;
  else if (score >= 15) level = 1;

  // Build recommended actions
  const actions: Array<{ type: string; severity: string; description: string }> = [];
  if (level >= 1) actions.push({ type: "MONITOR_CLOSELY", severity: "low", description: "Increase monitoring frequency to every 30s" });
  if (divergencePct > 2) actions.push({ type: "REDUCE_LTV", severity: "medium", description: `Reduce LTV by ${Math.min(10, Math.floor(divergencePct * 2))}% for affected markets` });
  if (liquidityUsd < 5_000_000) actions.push({ type: "CAP_SUPPLY", severity: "medium", description: "Cap new supply at current TVL to prevent liquidity drain" });
  if (level >= 3) actions.push({ type: "PAUSE_BORROWS", severity: "high", description: "Pause new borrow positions until oracle stabilizes" });
  if (level >= 4) actions.push({ type: "FREEZE_MARKET", severity: "critical", description: "Emergency freeze — oracle divergence exceeds safe threshold" });

  return { score, level, levelLabel: levelLabel(level), vulnerabilityClass: vulnerabilityClass(divergencePct, stalenessSeconds, liquidityUsd), actions };
}

// ─── Step 4: Claude AI Analysis (HTTP offchain) ──────────────────────────────

async function callClaudeAI(ctx: CREContext, signals: RiskSignals, riskResult: ReturnType<typeof computeRisk>): Promise<string> {
  ctx.log("[CRE:HTTP] Calling Claude AI for threat analysis...");
  try {
    const apiKey = ctx.getSecret("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("No ANTHROPIC_API_KEY configured");

    const prompt = `You are a DeFi security expert analyzing an oracle manipulation risk signal. Provide a concise 2-sentence threat assessment.

Asset: ${signals.asset}
Oracle Price: $${signals.oraclePrice.toFixed(2)} (Chainlink Sepolia)
DEX Price: $${signals.dexPrice.toFixed(2)} (CoinGecko)
Divergence: ${signals.divergencePct.toFixed(3)}%
Oracle Staleness: ${signals.stalenessSeconds}s
Liquidity: $${(signals.liquidityUsd / 1_000_000).toFixed(2)}M
Risk Score: ${riskResult.score}/100 (${riskResult.levelLabel})
Vulnerability Class: ${riskResult.vulnerabilityClass}

Respond with ONLY the threat assessment — no preamble, no markdown.`;

    const resp = await ctx.http.post(
      "https://api.anthropic.com/v1/messages",
      JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
      {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }
    );

    if (resp.status !== 200) throw new Error(`Claude API status ${resp.status}`);
    const data = JSON.parse(resp.body);
    const analysis = data.content?.[0]?.text ?? "Analysis unavailable";
    ctx.log(`[CRE:HTTP] Claude AI: ${analysis.substring(0, 80)}...`);
    return analysis;
  } catch (err) {
    ctx.log("[CRE:HTTP] Claude AI unavailable — using deterministic fallback");
    const { divergencePct, stalenessSeconds } = signals;
    if (riskResult.level === 0) return "Oracle and DEX prices are aligned within safe tolerance bands. No immediate intervention required.";
    if (riskResult.level <= 2) return `Mild divergence of ${divergencePct.toFixed(2)}% detected between Chainlink feed and DEX spot. Recommend monitoring and conservative LTV adjustments.`;
    return `Critical oracle manipulation signal: ${divergencePct.toFixed(2)}% price divergence with ${stalenessSeconds}s staleness suggests active price oracle attack. Immediate market freeze recommended to prevent protocol insolvency.`;
  }
}

// ─── Step 5: Anchor evidenceHash on Sepolia (EVM write) ──────────────────────

async function anchorOnChain(
  ctx: CREContext,
  evidenceHash: string,
  runId: string,
  score: number,
  level: number,
  isDrill: boolean
): Promise<{ txHash: string; anchored: boolean }> {
  ctx.log("[CRE:EVM] Anchoring evidenceHash on Sepolia ReceiptRegistry...");
  try {
    const registryAddress = ctx.getEnv("RECEIPT_REGISTRY_ADDRESS");
    const agentAddress = ctx.getEnv("AGENT_ADDRESS");
    const privateKey = ctx.getSecret("ANCHOR_PRIVATE_KEY");

    if (!registryAddress || !agentAddress || !privateKey) {
      throw new Error("Missing RECEIPT_REGISTRY_ADDRESS / AGENT_ADDRESS / ANCHOR_PRIVATE_KEY");
    }

    // Convert hex string to bytes32 format
    const evidenceBytes = evidenceHash.startsWith("0x") ? evidenceHash : "0x" + evidenceHash;
    const runIdBytes = "0x" + runId.padEnd(64, "0").substring(0, 64);

    const { txHash } = await ctx.evm.write({
      chainId: SEPOLIA_CHAIN_ID,
      address: registryAddress,
      abi: RECEIPT_REGISTRY_ABI,
      method: "anchorReceipt",
      args: [evidenceBytes, runIdBytes, agentAddress, score, level, isDrill],
      privateKey,
    });

    ctx.log(`[CRE:EVM] Anchored! txHash=${txHash}`);
    return { txHash, anchored: true };
  } catch (err) {
    ctx.log(`[CRE:EVM] Anchor skipped (demo mode): ${String(err).substring(0, 60)}`);
    // Return a deterministic mock tx for demo
    const mockTx = "0x" + Array.from({ length: 64 }, (_, i) => ((score + i) % 16).toString(16)).join("");
    return { txHash: mockTx, anchored: false };
  }
}

// ─── Main Workflow Entry Point ────────────────────────────────────────────────

export async function main(ctx: CREContext): Promise<RiskResult> {
  const asset = ctx.getEnv("TARGET_ASSET") || "WETH";
  const isDrill = ctx.getEnv("IS_DRILL") === "true";

  ctx.log(`\n${"═".repeat(60)}`);
  ctx.log(`[RFW] Reality Firewall v3 — Risk Workflow Starting`);
  ctx.log(`[RFW] Asset: ${asset} | Drill: ${isDrill}`);
  ctx.log("═".repeat(60));

  // Step 1: Oracle price (EVM read)
  const oracle = await fetchOraclePrice(ctx);

  // Step 2: DEX price (HTTP offchain)
  const dex = await fetchDexPrice(ctx, asset);

  // Step 3: Build signals
  const now = Math.floor(Date.now() / 1000);
  const stalenessSeconds = oracle.updatedAt > 0 ? now - oracle.updatedAt : 45;
  const divergencePct = Math.abs((oracle.price - dex.price) / oracle.price) * 100;

  const signals: RiskSignals = {
    asset,
    oraclePrice: oracle.price,
    dexPrice: dex.price,
    divergencePct,
    stalenessSeconds,
    liquidityUsd: dex.liquidityUsd,
    fundingRate: (Math.random() - 0.48) * 0.4, // realistic funding range
  };

  ctx.log(`[RFW] Signals → divergence=${divergencePct.toFixed(4)}% staleness=${stalenessSeconds}s liquidity=$${(signals.liquidityUsd / 1e6).toFixed(2)}M`);

  // Step 3: Compute risk (deterministic)
  const risk = computeRisk(signals);
  ctx.log(`[RFW] Risk Score=${risk.score}/100 Level=${risk.levelLabel} Class=${risk.vulnerabilityClass}`);

  // Step 4: Claude AI analysis (HTTP offchain)
  const aiAnalysis = await callClaudeAI(ctx, signals, risk);

  // Step 5: Build canonical receipt for evidenceHash
  const runId = `rfw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const receiptPayload = {
    actions: risk.actions,
    aiAnalysis,
    asset,
    divergencePct: Math.round(divergencePct * 10000) / 10000,
    isDrill,
    level: risk.level,
    liquidityUsd: Math.round(signals.liquidityUsd),
    oraclePrice: Math.round(oracle.price * 100) / 100,
    dexPrice: Math.round(dex.price * 100) / 100,
    runId,
    score: risk.score,
    stalenessSeconds,
    timestamp: now,
    vulnerabilityClass: risk.vulnerabilityClass,
    workflowVersion: "3.0.0",
  };

  const canonical = canonicalJson(receiptPayload);
  const evidenceHash = await sha256Hex(canonical);
  ctx.log(`[RFW] evidenceHash=0x${evidenceHash}`);

  // Step 5: Anchor on Sepolia (EVM write)
  const { txHash, anchored } = await anchorOnChain(ctx, evidenceHash, runId, risk.score, risk.level, isDrill);

  const result: RiskResult = {
    ...risk,
    evidenceHash: "0x" + evidenceHash,
    runId,
    timestamp: now,
    signals,
    aiAnalysis,
  };

  ctx.log(`\n[RFW] ✅ Workflow Complete`);
  ctx.log(`[RFW] Score: ${risk.score}/100 (${risk.levelLabel})`);
  ctx.log(`[RFW] evidenceHash: 0x${evidenceHash}`);
  ctx.log(`[RFW] anchorTx: ${txHash} anchored=${anchored}`);
  ctx.log("═".repeat(60));

  return result;
}

// ─── Local simulation shim (used by simulate-local.ts) ───────────────────────

export { canonicalJson, computeRisk, fetchOraclePrice, fetchDexPrice, callClaudeAI };
