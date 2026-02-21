/**
 * lib/creClient.ts — Chainlink CRE Oracle Signals Client
 * ========================================================
 * Cascada automática de 4 fuentes (fallback sin configuración extra):
 *
 *  1. CRE DON Workflow    — si CRE_WORKFLOW_URL está configurado
 *  2. Chainlink Data Streams — si CHAINLINK_STREAMS_API_KEY configurado
 *  3. Chainlink Data Feeds Sepolia (JSON-RPC público) ← DEFAULT sin config
 *  4. Demo determinista   — siempre funciona, variación realista por tiempo
 *
 * Data Feed addresses (Sepolia testnet, AggregatorV3Interface, 8 decimales):
 *   ETH/USD  0x694AA1769357215DE4FAC081bf1f309aDC325306
 *   BTC/USD  0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43
 *   LINK/USD 0xc59E3633BAAC79493d908e63626716e204a45EdF
 *   USDC/USD 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E
 *
 * Docs: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet
 */
import { createHmac, createHash } from "node:crypto";
import type { OracleSignals } from "./types.js";

const FEEDS: Record<string, { address: string; coingeckoId: string; basePrice: number }> = {
  WETH: { address: "0x694AA1769357215DE4FAC081bf1f309aDC325306", coingeckoId: "ethereum",  basePrice: 2820  },
  WBTC: { address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43", coingeckoId: "bitcoin",   basePrice: 62000 },
  LINK: { address: "0xc59E3633BAAC79493d908e63626716e204a45EdF", coingeckoId: "chainlink", basePrice: 14.2  },
  USDC: { address: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", coingeckoId: "usd-coin",  basePrice: 1.0   },
  ARB:  { address: "0x0153002d20B96532C639313c2d54c3dA09109309", coingeckoId: "arbitrum",  basePrice: 1.20  },
};

// ── Level 1: CRE DON Workflow via HTTP trigger ─────────────────────────────────
async function fromCREWorkflow(asset: string): Promise<Partial<OracleSignals> | null> {
  const url = process.env.CRE_WORKFLOW_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ asset, requestId: `rf-${Date.now()}` }),
      signal:  AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`CRE HTTP ${res.status}`);
    const d = await res.json() as Record<string, unknown>;
    return {
      oraclePrice:       Number(d.oraclePrice),
      dexPrice:          Number(d.dexPrice),
      divergencePct:     Number(d.divergencePct),
      stalenessSeconds:  Number(d.staleness ?? d.stalenessSeconds ?? 15),
      liquidityDepthUsd: Number(d.liquidityUsd ?? d.liquidityDepthUsd ?? 4_000_000),
      feedAddress:       String(d.feedAddress ?? FEEDS[asset]?.address ?? ""),
      creWorkflowId:     String(d.workflowId ?? ""),
      creEvidenceHash:   String(d.evidenceHash ?? ""),
      sourceLabel:       "Chainlink CRE DON (BFT consensus)",
    };
  } catch (e) {
    console.warn("[CRE DON] Failed:", String(e));
    return null;
  }
}

// ── Level 2: Chainlink Data Streams API ───────────────────────────────────────
async function fromDataStreams(asset: string): Promise<Partial<OracleSignals> | null> {
  const apiKey    = process.env.CHAINLINK_STREAMS_API_KEY;
  const apiSecret = process.env.CHAINLINK_STREAMS_API_SECRET;
  const base      = process.env.CHAINLINK_STREAMS_URL ?? "https://api.testnet-dataengine.chain.link";
  if (!apiKey || !apiSecret) return null;

  const streamIds: Record<string, string> = {
    WETH: "0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782",
    WBTC: "0x00030ab7d02fbba9c6304f98824524407b1f494741174320cfd17a2c22eec1de",
  };
  const feedId = streamIds[asset];
  if (!feedId) return null;

  try {
    const path = `/api/v1/reports/latest?feedID=${feedId}`;
    const ts   = Math.floor(Date.now() / 1000).toString();
    const sig  = createHmac("sha256", apiSecret).update(`GET\n${path}\n${ts}\n`).digest("hex");
    const res  = await fetch(`${base}${path}`, {
      headers: { Authorization: `HMAC ${apiKey}:${sig}`, "X-Authorization-Timestamp": ts },
      signal:  AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Streams ${res.status}`);
    const { report } = await res.json() as { report: Record<string, unknown> };
    const price     = report.benchmarkPrice ? Number(BigInt(report.benchmarkPrice as string)) / 1e18 : FEEDS[asset]?.basePrice ?? 2820;
    const bid       = report.bid ? Number(BigInt(report.bid as string)) / 1e18 : price * 0.999;
    const staleness = Math.floor(Date.now() / 1000) - Number(report.observationsTimestamp ?? 0);
    const rHash     = createHash("sha256").update(String(report.fullReport ?? "")).digest("hex");
    return {
      oraclePrice:       Math.round(price * 100) / 100,
      dexPrice:          Math.round(bid * 100) / 100,
      divergencePct:     Math.abs(price - bid) / price * 100,
      stalenessSeconds:  staleness,
      liquidityDepthUsd: 5_000_000,
      fundingRatePct:    0,
      sourceLabel:       "Chainlink Data Streams API",
      creEvidenceHash:   "0x" + rHash,
    };
  } catch (e) {
    console.warn("[Data Streams] Failed:", String(e));
    return null;
  }
}

// ── Level 3: Chainlink Data Feeds Sepolia via public JSON-RPC ─────────────────
async function fromDataFeeds(asset: string): Promise<Partial<OracleSignals> | null> {
  const feed = FEEDS[asset];
  if (!feed) return null;
  const rpc = process.env.EVM_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

  try {
    // latestRoundData() selector = keccak256("latestRoundData()").slice(0,4) = 0xfeaf968c
    const res = await fetch(rpc, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params:  [{ to: feed.address, data: "0xfeaf968c" }, "latest"],
      }),
      signal: AbortSignal.timeout(6000),
    });
    const { result } = await res.json() as { result?: string; error?: unknown };
    if (!result || result === "0x" || result.length < 130) throw new Error("empty result");

    // ABI decode: (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    const hex       = result.slice(2);
    const answer    = BigInt("0x" + hex.slice(64, 128));
    const updatedAt = Number(BigInt("0x" + hex.slice(128, 192)));
    const price     = Number(answer) / 1e8;
    const staleness = Math.floor(Date.now() / 1000) - updatedAt;

    // Fetch DEX price from CoinGecko public API (no key needed)
    let dexPrice = price;
    let liquidityDepthUsd = 4_000_000;
    try {
      const gr = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${feed.coingeckoId}&vs_currencies=usd&include_24hr_vol=true`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (gr.ok) {
        const gd = await gr.json() as Record<string, { usd?: number; usd_24h_vol?: number }>;
        dexPrice          = gd[feed.coingeckoId]?.usd ?? price;
        liquidityDepthUsd = (gd[feed.coingeckoId]?.usd_24h_vol ?? 30_000_000) * 0.12;
      }
    } catch { /* use oracle price as DEX fallback */ }

    // Get current block number
    let blockNumber = 0;
    try {
      const br = await fetch(rpc, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(3000),
      });
      const { result: blockHex } = await br.json() as { result: string };
      blockNumber = parseInt(blockHex, 16);
    } catch { /* ignore */ }

    return {
      oraclePrice:       Math.round(price * 100) / 100,
      dexPrice:          Math.round(dexPrice * 100) / 100,
      divergencePct:     Math.abs(price - dexPrice) / price * 100,
      stalenessSeconds:  Math.max(0, staleness),
      liquidityDepthUsd: Math.round(liquidityDepthUsd),
      fundingRatePct:    ((updatedAt % 1000) - 500) / 1_000_000,
      blockNumber,
      feedAddress:       feed.address,
      sourceLabel:       `Chainlink Data Feeds Sepolia (${feed.address.slice(0, 10)}…)`,
    };
  } catch (e) {
    console.warn("[Data Feeds] Failed:", String(e));
    return null;
  }
}

// ── Level 4: Demo deterministic fallback ──────────────────────────────────────
function demoSignals(asset: string, drillMode = false): OracleSignals {
  const feed  = FEEDS[asset] ?? FEEDS.WETH;
  const seed  = Date.now() % 9973;
  const base  = feed.basePrice;

  const oracle    = drillMode ? base + (seed % 80) - 40 : base + (seed % 30) - 15;
  const divPct    = drillMode ? (seed % 600 + 200) / 10_000 : (seed % 50) / 10_000;
  const dex       = oracle * (1 + divPct * (seed % 2 === 0 ? 1 : -1));
  const staleness = drillMode ? 180 + (seed % 120) : 15 + (seed % 45);
  const liquidity = drillMode ? 600_000 + (seed % 400_000) : 4_000_000 + (seed % 3_000_000);

  return {
    asset,
    oraclePrice:       Math.round(oracle * 100) / 100,
    dexPrice:          Math.round(dex * 100) / 100,
    divergencePct:     Math.abs(divPct * 100),
    stalenessSeconds:  staleness,
    liquidityDepthUsd: liquidity,
    fundingRatePct:    ((seed % 30) - 15) / 10_000,
    blockNumber:       7_100_000 + (seed % 100_000),
    feedAddress:       feed.address,
    sourceLabel:       "Demo Mode (set EVM_RPC_URL for real Chainlink data)",
    timestamp:         Math.floor(Date.now() / 1000),
  };
}

/** Main export: returns signals from best available source */
export async function getSignals(asset: string, drillMode = false): Promise<OracleSignals> {
  const partial = await fromCREWorkflow(asset)
    ?? await fromDataStreams(asset)
    ?? await fromDataFeeds(asset);

  const demo = demoSignals(asset, drillMode);

  if (!partial) return demo;

  // Merge partial data with demo fallbacks for missing fields
  const merged: OracleSignals = {
    asset,
    oraclePrice:       partial.oraclePrice       ?? demo.oraclePrice,
    dexPrice:          partial.dexPrice           ?? demo.dexPrice,
    divergencePct:     partial.divergencePct      ?? Math.abs((partial.oraclePrice ?? demo.oraclePrice) - (partial.dexPrice ?? demo.dexPrice)) / (partial.oraclePrice ?? demo.oraclePrice) * 100,
    stalenessSeconds:  partial.stalenessSeconds   ?? demo.stalenessSeconds,
    liquidityDepthUsd: partial.liquidityDepthUsd  ?? demo.liquidityDepthUsd,
    fundingRatePct:    partial.fundingRatePct     ?? demo.fundingRatePct,
    blockNumber:       partial.blockNumber        ?? demo.blockNumber,
    feedAddress:       partial.feedAddress        ?? demo.feedAddress,
    sourceLabel:       partial.sourceLabel        ?? demo.sourceLabel,
    creWorkflowId:     partial.creWorkflowId,
    creEvidenceHash:   partial.creEvidenceHash,
    timestamp:         Math.floor(Date.now() / 1000),
  };

  merged.divergencePct = Math.round(Math.abs(merged.oraclePrice - merged.dexPrice) / merged.oraclePrice * 10_000) / 10_000;

  return merged;
}
