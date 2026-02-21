/**
 * lib/x402.ts — x402 Protocol v2 (Coinbase Open Standard)
 * =========================================================
 * HTTP 402 Payment Required con USDC en Base Sepolia
 *
 * Network:  eip155:84532 (Base Sepolia, chainId 84532)
 * USDC:     0x036CbD53842c5426634e7929541eC2318f3dCF7e (Circle official)
 * Price:    $0.001 USDC = 1000 atomic units (6 decimals)
 * Docs:     https://docs.cdp.coinbase.com/x402
 * Spec:     https://github.com/coinbase/x402
 *
 * DEMO MODE (X402_DEMO_MODE=true — default):
 *   Acepta cualquier hash hex bien formado como "pago válido".
 *   Perfecto para el jurado: muestra el flujo completo sin wallet.
 *
 * PRODUCTION MODE (X402_DEMO_MODE=false):
 *   Verifica la transferencia ERC-20 real en Base Sepolia via JSON-RPC.
 *   Lee logs del receipt: Transfer(from, PAYMENT_ADDRESS, amount >= 1000).
 */
import type { X402PaymentRequirement, X402ErrorResponse } from "./types.js";

export const X402_CONFIG = {
  network:       "eip155:84532",
  chainId:       84532,
  rpc:           process.env.X402_RPC_URL        ?? "https://sepolia.base.org",
  usdcAddress:   process.env.X402_TOKEN_ADDRESS   ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo:         process.env.PAYMENT_ADDRESS      ?? "0xDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEfDeAdBeEf",
  priceAtomic:   process.env.X402_PRICE_ATOMIC    ?? "1000",
  maxTimeout:    60,
  demoMode:      process.env.X402_DEMO_MODE !== "false", // true by default
} as const;

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Builds the standard x402 Payment Requirement object (HTTP 402 body) */
export function buildX402Requirement(resource: string): X402PaymentRequirement {
  return {
    scheme:            "exact",
    network:           X402_CONFIG.network,
    maxAmountRequired: X402_CONFIG.priceAtomic,
    resource,
    description:       "Reality Firewall v3 — Oracle Attack Drill ($0.001 USDC on Base Sepolia)",
    mimeType:          "application/json",
    payTo:             X402_CONFIG.payTo,
    maxTimeoutSeconds: X402_CONFIG.maxTimeout,
    asset:             X402_CONFIG.usdcAddress,
    extra: {
      name:    "Reality Firewall",
      version: "3.0.0",
      docs:    "https://docs.cdp.coinbase.com/x402",
    },
  };
}

/** Builds the full 402 error response body */
export function buildX402Error(resource: string): X402ErrorResponse {
  return {
    error:           "Payment Required",
    code:            "x402_payment_required",
    paymentRequired: buildX402Requirement(resource),
    hint: `Send ${X402_CONFIG.priceAtomic} units of USDC (${X402_CONFIG.usdcAddress}) ` +
          `to ${X402_CONFIG.payTo} on Base Sepolia (${X402_CONFIG.network}), ` +
          `then retry with header X-Payment-Tx: <txHash> or body paymentTxHash: <txHash>`,
    x402Docs: "https://docs.cdp.coinbase.com/x402",
  };
}

/** Verifies a USDC payment on Base Sepolia */
export async function verifyPayment(txHash: string): Promise<{
  valid: boolean;
  reason: string;
  mode: "demo" | "onchain";
  amount?: string;
  from?: string;
}> {
  // ── Demo mode (default for hackathon) ──────────────────────────────────
  if (X402_CONFIG.demoMode) {
    const isValidFormat = /^0x[0-9a-fA-F]{10,64}$/.test(txHash);
    if (!isValidFormat) return { valid: false, reason: "demo_invalid_format", mode: "demo" };
    return {
      valid:  true,
      reason: "demo_accepted — format valid (X402_DEMO_MODE=true)",
      mode:   "demo",
      amount: X402_CONFIG.priceAtomic,
      from:   "0xdemo_sender",
    };
  }

  // ── Real onchain verification ──────────────────────────────────────────
  try {
    const res = await fetch(X402_CONFIG.rpc, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method:  "eth_getTransactionReceipt",
        params:  [txHash],
      }),
      signal: AbortSignal.timeout(8000),
    });
    type Log = { address: string; topics: string[]; data: string };
    type Receipt = { status: string; logs: Log[] };
    const { result } = await res.json() as { result: Receipt | null };

    if (!result)              return { valid: false, reason: "tx_not_found", mode: "onchain" };
    if (result.status !== "0x1") return { valid: false, reason: "tx_reverted",  mode: "onchain" };

    const usdcL  = X402_CONFIG.usdcAddress.toLowerCase();
    const payToL = X402_CONFIG.payTo.toLowerCase();
    const minAmt = BigInt(X402_CONFIG.priceAtomic);

    for (const log of result.logs) {
      if (log.address.toLowerCase() !== usdcL)    continue;
      if (log.topics[0] !== TRANSFER_TOPIC)        continue;
      if (log.topics.length < 3)                   continue;
      const to     = "0x" + log.topics[2].slice(26);
      if (to.toLowerCase() !== payToL)             continue;
      const amount = BigInt(log.data);
      if (amount < minAmt) return { valid: false, reason: `amount_low:${amount}<${minAmt}`, mode: "onchain" };
      return {
        valid:  true,
        reason: "verified_onchain — USDC Transfer confirmed",
        mode:   "onchain",
        amount: amount.toString(),
        from:   "0x" + log.topics[1].slice(26),
      };
    }
    return { valid: false, reason: "no_usdc_transfer_to_payto", mode: "onchain" };
  } catch (e) {
    return { valid: false, reason: `rpc_error: ${String(e)}`, mode: "onchain" };
  }
}
