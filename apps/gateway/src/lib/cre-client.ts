// lib/cre-client.ts
// Chainlink Runtime Environment — cliente de señales
//
// Cascada de fuentes (fallback automático):
//   1. CRE DON via HTTP trigger    (CRE_WORKFLOW_URL en .env)
//   2. Chainlink Data Feeds Sepolia via JSON-RPC público (sin key)
//   3. CoinGecko API pública        (sin key)
//   4. Demo deterministico          (siempre funciona)
//
// Data Feed addresses (Sepolia testnet):
//   ETH/USD  0x694AA1769357215DE4FAC081bf1f309aDC325306  8 dec
//   BTC/USD  0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43  8 dec
//   LINK/USD 0xc59E3633BAAC79493d908e63626716e204a45EdF  8 dec
//   USDC/USD 0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E  8 dec

import type { OracleSignals } from "./types.js";

const FEEDS: Record<string, string> = {
  WETH: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  WBTC: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43",
  LINK: "0xc59E3633BAAC79493d908e63626716e204a45EdF",
  USDC: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
};

const COINGECKO_IDS: Record<string, string> = {
  WETH: "ethereum",
  WBTC: "bitcoin",
  LINK: "chainlink",
  USDC: "usd-coin",
  ARB:  "arbitrum",
};

const DEMO_BASES: Record<string, number> = {
  WETH: 2820, WBTC: 62500, LINK: 14.2, USDC: 1.0, ARB: 1.18,
};

// Selector keccak256("latestRoundData()") = 0xfeaf968c
const LATEST_ROUND_DATA_SELECTOR = "0xfeaf968c";

// ── Nivel 1: CRE DON (si configurado) ────────────────────────
async function fromCREWorkflow(asset: string): Promise<Partial<OracleSignals> | null> {
  const url = process.env.CRE_WORKFLOW_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, requestId: `rf-${Date.now()}` }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json() as Record<string, unknown>;
    return {
      oraclePrice:       Number(d.oraclePrice),
      dexPrice:          Number(d.dexPrice),
      divergencePct:     Number(d.divergencePct),
      stalenessSeconds:  Number(d.staleness ?? d.stalenessSeconds ?? 15),
      liquidityDepthUsd: Number(d.liquidityUsd ?? d.liquidityDepthUsd ?? 4_000_000),
      feedAddress:       String(d.feedAddress ?? FEEDS[asset] ?? ""),
      creWorkflowId:     String(d.workflowId ?? ""),
      creEvidenceHash:   String(d.evidenceHash ?? ""),
      sourceLabel:       "Chainlink CRE DON (BFT consensus)",
    };
  } catch { return null; }
}

// ── Nivel 2: Chainlink Data Feeds Sepolia via JSON-RPC ────────
async function fromDataFeeds(asset: string): Promise<Partial<OracleSignals> | null> {
  const feedAddr = FEEDS[asset];
  if (!feedAddr) return null;
  const rpc = process.env.EVM_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

  try {
    const body = {
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: feedAddr, data: LATEST_ROUND_DATA_SELECTOR }, "latest"],
    };
    const res  = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    const { result } = await res.json() as { result?: string };
    if (!result || result === "0x" || result.length < 130) return null;

    // Decode ABI tuple (uint80,int256,uint256,uint256,uint80)
    const hex       = result.slice(2);
    const answer    = BigInt("0x" + hex.slice(64, 128));  // int256
    const updatedAt = BigInt("0x" + hex.slice(128, 192)); // uint256
    const price     = Number(answer) / 1e8;               // 8 decimales
    const nowSec    = Math.floor(Date.now() / 1000);
    const staleness = nowSec - Number(updatedAt);

    // Obtener bloque actual
    const blockRes = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);
    const blockHex = blockRes ? ((await blockRes.json()) as { result: string }).result : "0x0";
    const blockNum = parseInt(blockHex, 16);

    return {
      oraclePrice:   Math.round(price * 100) / 100,
      stalenessSeconds: Math.max(0, staleness),
      feedAddress:   feedAddr,
      blockNumber:   blockNum,
      sourceLabel:   "Chainlink Data Feeds (Sepolia onchain)",
    };
  } catch { return null; }
}

// ── Nivel 3: CoinGecko precio DEX ────────────────────────────
async function fromCoinGecko(asset: string): Promise<{ price: number; liquidityUsd: number } | null> {
  const coinId = COINGECKO_IDS[asset];
  if (!coinId) return null;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, { usd?: number; usd_24h_vol?: number }>;
    const entry = data[coinId];
    if (!entry?.usd) return null;
    return {
      price:        entry.usd,
      liquidityUsd: (entry.usd_24h_vol ?? 30_000_000) * 0.12, // liquidity ≈ 12% daily volume
    };
  } catch { return null; }
}

// ── Nivel 4: Demo deterministico (siempre funciona) ──────────
function demoSignals(asset: string): OracleSignals {
  const base  = DEMO_BASES[asset] ?? 2800;
  const seed  = (Date.now() / 1000) | 0;
  const micro = ((seed % 997) - 498) / 1000;   // ±0.498 variación
  const divVariance = Math.abs(micro) * 0.8;

  const oraclePrice    = Math.round((base + base * micro * 0.01) * 100) / 100;
  const dexPrice       = Math.round(oraclePrice * (1 + divVariance) * 100) / 100;
  const divergencePct  = Math.abs(dexPrice - oraclePrice) / oraclePrice * 100;

  return {
    asset,
    oraclePrice,
    dexPrice,
    divergencePct:     Math.round(divergencePct * 10_000) / 10_000,
    stalenessSeconds:  (seed % 180) + 10,
    liquidityDepthUsd: 2_000_000 + (seed % 4_000_000),
    fundingRatePct:    ((seed % 60) - 30) / 10_000,
    blockNumber:       7_000_000 + (seed % 100_000),
    feedAddress:       FEEDS[asset] ?? "0x694AA1769357215DE4FAC081bf1f309aDC325306",
    sourceLabel:       "Demo (configure EVM_RPC_URL para datos reales)",
    timestamp:         Math.floor(Date.now() / 1000),
  };
}

// ── Export principal ──────────────────────────────────────────
export async function getOracleSignals(asset: string): Promise<OracleSignals> {
  const creData    = await fromCREWorkflow(asset);
  const feedData   = await fromDataFeeds(asset);
  const geckoData  = await fromCoinGecko(asset);
  const demo       = demoSignals(asset);

  // Combinar fuentes disponibles
  const oraclePrice    = creData?.oraclePrice ?? feedData?.oraclePrice ?? demo.oraclePrice;
  const dexPrice       = creData?.dexPrice    ?? geckoData?.price      ?? demo.dexPrice;
  const divergencePct  = Math.abs(oraclePrice - dexPrice) / oraclePrice * 100;

  return {
    asset,
    oraclePrice,
    dexPrice:          Math.round(dexPrice * 100) / 100,
    divergencePct:     Math.round(divergencePct * 10_000) / 10_000,
    stalenessSeconds:  creData?.stalenessSeconds  ?? feedData?.stalenessSeconds  ?? demo.stalenessSeconds,
    liquidityDepthUsd: creData?.liquidityDepthUsd ?? geckoData?.liquidityUsd     ?? demo.liquidityDepthUsd,
    fundingRatePct:    demo.fundingRatePct,
    blockNumber:       feedData?.blockNumber ?? demo.blockNumber,
    feedAddress:       feedData?.feedAddress ?? FEEDS[asset] ?? demo.feedAddress,
    sourceLabel: creData?.sourceLabel ?? (feedData ? "Chainlink Data Feeds (Sepolia)" : demo.sourceLabel),
    creWorkflowId:     creData?.creWorkflowId,
    creEvidenceHash:   creData?.creEvidenceHash,
    timestamp:         Math.floor(Date.now() / 1000),
  };
}
