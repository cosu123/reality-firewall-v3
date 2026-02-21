/**
 * Reality Firewall v3 — CRE Local Simulation
 * ─────────────────────────────────────────────
 * Run: bun run src/simulate-local.ts
 *
 * This replicates the CRE runtime context locally so you can demo
 * the workflow end-to-end WITHOUT needing Chainlink CRE access.
 *
 * Output matches exactly what `cre workflow simulate` would produce.
 */

import { main } from "./main";

// ─── Colors for terminal output ──────────────────────────────────────────────
const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ─── Build mock CRE context ───────────────────────────────────────────────────

const secrets: Record<string, string> = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  ANCHOR_PRIVATE_KEY: process.env.ANCHOR_PRIVATE_KEY || "",
};

const envVars: Record<string, string> = {
  TARGET_ASSET: process.env.TARGET_ASSET || "WETH",
  IS_DRILL: process.env.IS_DRILL || "false",
  RECEIPT_REGISTRY_ADDRESS: process.env.RECEIPT_REGISTRY_ADDRESS || "",
  AGENT_ADDRESS: process.env.AGENT_ADDRESS || "0x0000000000000000000000000000000000000001",
};

// Mock HTTP client — calls real URLs in simulation
const httpClient = {
  async get(url: string, headers?: Record<string, string>) {
    console.log(c.dim(`  → GET ${url.substring(0, 80)}...`));
    try {
      const resp = await fetch(url, { headers });
      const body = await resp.text();
      return { body, status: resp.status };
    } catch {
      return { body: "{}", status: 503 };
    }
  },
  async post(url: string, body: string, headers?: Record<string, string>) {
    console.log(c.dim(`  → POST ${url.substring(0, 80)}...`));
    try {
      const resp = await fetch(url, { method: "POST", body, headers });
      const text = await resp.text();
      return { body: text, status: resp.status };
    } catch {
      return { body: "{}", status: 503 };
    }
  },
};

// Mock EVM client — tries real Sepolia RPC
const evmClient = {
  async read(params: { chainId: string; address: string; abi: string[]; method: string; args?: unknown[] }) {
    console.log(c.dim(`  → EVM read ${params.method}() on ${params.address.substring(0, 10)}...`));
    try {
      // Encode call data for latestRoundData / decimals
      const callData = params.method === "decimals" ? "0x313ce567" : "0xfeaf968c";
      const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

      const resp = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{ to: params.address, data: callData }, "latest"],
          id: 1,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message);

      if (params.method === "decimals") {
        return [BigInt("0x" + data.result.slice(-2))];
      }
      // latestRoundData returns (roundId, answer, startedAt, updatedAt, answeredInRound)
      const hex = data.result.slice(2);
      const words = [];
      for (let i = 0; i < 5; i++) {
        words.push(BigInt("0x" + hex.slice(i * 64, (i + 1) * 64)));
      }
      return words;
    } catch (err) {
      console.log(c.yellow(`  ⚠ EVM read failed, using simulation values`));
      return params.method === "decimals" ? [BigInt(8)] : [BigInt(1), BigInt(278012000000), BigInt(0), BigInt(Math.floor(Date.now() / 1000) - 30), BigInt(1)];
    }
  },
  async write(params: { chainId: string; address: string; abi: string[]; method: string; args: unknown[]; privateKey: string }) {
    console.log(c.dim(`  → EVM write ${params.method}() on ${params.address.substring(0, 10)}...`));
    // For simulation, return deterministic mock tx
    const mockHash = "0x" + params.args
      .map((a) => String(a).replace("0x", "").padStart(8, "0").substring(0, 8))
      .join("")
      .padEnd(64, "a")
      .substring(0, 64);
    return { txHash: mockHash };
  },
};

// ─── Run simulation ───────────────────────────────────────────────────────────

async function runSimulation() {
  console.log("\n" + c.bold(c.cyan("╔══════════════════════════════════════════════════════════╗")));
  console.log(c.bold(c.cyan("║     REALITY FIREWALL v3 — CRE WORKFLOW SIMULATION        ║")));
  console.log(c.bold(c.cyan("╚══════════════════════════════════════════════════════════╝")));
  console.log(c.dim("Simulating: cre workflow simulate rfw-risk-workflow --target staging-settings\n"));

  const ctx = {
    http: httpClient,
    evm: evmClient,
    log: (msg: string) => console.log(c.cyan("  " + msg)),
    getSecret: (key: string) => secrets[key] || "",
    getEnv: (key: string) => envVars[key] || "",
  };

  const startTime = Date.now();

  const result = await main(ctx);

  const elapsed = Date.now() - startTime;

  console.log("\n" + c.bold(c.green("╔══════════════════════════════════════════════════════════╗")));
  console.log(c.bold(c.green("║                  SIMULATION RESULTS                      ║")));
  console.log(c.bold(c.green("╚══════════════════════════════════════════════════════════╝")));

  const levelColors: Record<number, (s: string) => string> = {
    0: c.green,
    1: (s) => `\x1b[32m${s}\x1b[0m`,
    2: c.yellow,
    3: (s) => `\x1b[33m${s}\x1b[0m`,
    4: c.red,
  };
  const lvlColor = levelColors[result.level] ?? c.cyan;

  console.log(`\n  ${c.bold("Asset")}         : ${result.signals.asset}`);
  console.log(`  ${c.bold("Oracle Price")} : $${result.signals.oraclePrice.toFixed(2)} (Chainlink Sepolia)`);
  console.log(`  ${c.bold("DEX Price")}    : $${result.signals.dexPrice.toFixed(2)} (CoinGecko)`);
  console.log(`  ${c.bold("Divergence")}   : ${result.signals.divergencePct.toFixed(4)}%`);
  console.log(`  ${c.bold("Staleness")}    : ${result.signals.stalenessSeconds}s`);
  console.log(`  ${c.bold("Liquidity")}    : $${(result.signals.liquidityUsd / 1e6).toFixed(2)}M`);
  console.log();
  console.log(`  ${c.bold("Risk Score")}   : ${lvlColor(String(result.score) + "/100")}`);
  console.log(`  ${c.bold("Level")}        : ${lvlColor(result.levelLabel)}`);
  console.log(`  ${c.bold("Vuln Class")}   : ${result.vulnerabilityClass}`);
  console.log();
  console.log(`  ${c.bold("Actions")}:`);
  for (const action of result.actions) {
    const sev = action.severity === "critical" ? c.red : action.severity === "high" ? (s: string) => `\x1b[33m${s}\x1b[0m` : c.yellow;
    console.log(`    ${sev("▶")} [${action.severity.toUpperCase()}] ${action.type}`);
    console.log(`      ${c.dim(action.description)}`);
  }
  console.log();
  if (result.aiAnalysis) {
    console.log(`  ${c.bold("AI Analysis")} (Claude):`);
    console.log(`    ${c.cyan('"' + result.aiAnalysis + '"')}`);
  }
  console.log();
  console.log(`  ${c.bold("evidenceHash")} : ${c.cyan(result.evidenceHash)}`);
  console.log(`  ${c.bold("runId")}        : ${result.runId}`);
  console.log(`  ${c.bold("timestamp")}    : ${new Date(result.timestamp * 1000).toISOString()}`);
  console.log(`  ${c.bold("elapsed")}      : ${elapsed}ms`);
  console.log();
  console.log(c.bold(c.green("✅ Simulation complete — evidenceHash ready for on-chain anchoring")));
  console.log(c.dim(`   POST /api/v1/anchor { evidenceHash: "${result.evidenceHash}" }`));
  console.log();

  // Write result to JSON for CI/CD
  await Bun.write(
    "./simulation-result.json",
    JSON.stringify({ ...result, simulatedAt: new Date().toISOString(), elapsedMs: elapsed }, null, 2)
  );
  console.log(c.dim("  Result saved to simulation-result.json"));
}

runSimulation().catch((err) => {
  console.error("\n❌ Simulation failed:", err);
  process.exit(1);
});
