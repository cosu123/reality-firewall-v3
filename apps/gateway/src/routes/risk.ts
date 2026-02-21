/**
 * routes/risk.ts — Reality Firewall v3 Risk API Routes
 * ======================================================
 * POST /api/v1/check          — Free risk check, no payment required
 * POST /api/v1/drill          — Paid drill, requires x402 USDC payment
 * POST /api/v1/anchor         — Anchor Defense Receipt on Sepolia
 * GET  /api/v1/receipt/:hash  — Look up anchored receipt
 * GET  /api/v1/agent          — ERC-8004 agent card
 * GET  /api/v1/health         — Gateway health + stack info
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { getSignals } from "../lib/creClient.js";
import { computeRisk, applyDrillOverrides } from "../services/riskEngine.js";
import { buildX402Error, verifyPayment, X402_CONFIG } from "../lib/x402.js";
import { loadOrGenerateKey, signPayload, verifySignature, anchorReceipt } from "../lib/anchorClient.js";
import { getAgentInfo } from "../lib/erc8004.js";
import type {
  DefenseReceipt, CheckResponse, DrillResponse, AnchorResponse,
  DrillRequest, CheckRequest, AnchorRequest,
} from "../lib/types.js";

const checkSchema = z.object({
  asset:       z.string().toUpperCase().default("WETH"),
  protocolId:  z.string().optional().default("demo-protocol"),
});

const drillSchema = z.object({
  asset:             z.string().toUpperCase().default("WETH"),
  protocolId:        z.string().optional().default("demo-protocol"),
  paymentTxHash:     z.string().optional(),
  shockPct:          z.number().min(0).max(30).optional(),
  blocks:            z.number().min(1).max(200).optional(),
  liquidityDropPct:  z.number().min(0).max(90).optional(),
  stalenessSec:      z.number().min(0).max(600).optional(),
});

const anchorSchema = z.object({
  evidenceHash: z.string().regex(/^0x[0-9a-f]{64}$/i),
  runId:        z.string(),
  score:        z.number().min(0).max(100),
  level:        z.number().min(0).max(4),
  isDrill:      z.boolean(),
});

async function buildDefenseReceipt(params: {
  mode:         "check" | "drill";
  protocolId:   string;
  asset:        string;
  paymentTxHash?: string;
  paymentVerified: boolean;
  paymentAmount?:  string;
  paymentMode?:    string;
  shockPct?:     number;
  blocks?:       number;
  liquidityDropPct?: number;
  stalenessSec?: number;
}): Promise<{ receipt: DefenseReceipt; response: CheckResponse | DrillResponse }> {
  const { publicKeyHex } = loadOrGenerateKey();

  // 1. Get oracle signals (CRE cascade)
  let signals = await getSignals(params.asset, params.mode === "drill");

  // 2. Apply drill overrides if any
  if (params.mode === "drill" && (params.shockPct || params.liquidityDropPct || params.stalenessSec)) {
    signals = applyDrillOverrides(signals, {
      shockPct:          params.shockPct,
      liquidityDropPct:  params.liquidityDropPct,
      stalenessSec:      params.stalenessSec,
    });
  }

  // 3. Compute risk (deterministic + optional Claude AI)
  const result = await computeRisk(signals, params.mode === "drill");

  // 4. Get agent identity (ERC-8004)
  const agent = await getAgentInfo(publicKeyHex);

  // 5. Build unsigned receipt
  const unsignedReceipt = {
    version:        "rf-v3" as const,
    runId:          result.runId,
    protocolId:     params.protocolId,
    mode:           params.mode,
    result,
    paymentTxHash:  params.paymentTxHash,
    paymentNetwork: params.paymentTxHash ? X402_CONFIG.network : undefined,
    paymentVerified: params.paymentVerified,
    paymentAmount:  params.paymentAmount,
    agentId:        agent.agentId,
    agentRegistry:  agent.agentRegistry,
    agentPublicKey: publicKeyHex,
    createdAtIso:   new Date().toISOString(),
  };

  // 6. Sign the receipt with Ed25519
  const { signature } = signPayload(unsignedReceipt);

  const receipt: DefenseReceipt = { ...unsignedReceipt, signature };

  const response = {
    receipt,
    agent,
    ...(params.mode === "drill" ? {
      paymentTxHash:   params.paymentTxHash ?? "",
      paymentVerified: params.paymentVerified,
      paymentMode:     (params.paymentMode ?? "demo_accepted") as "demo_accepted" | "verified_onchain",
    } : {}),
  };

  return { receipt, response: response as CheckResponse | DrillResponse };
}

export async function riskRoutes(fastify: FastifyInstance) {

  // ── POST /check — Free risk check ─────────────────────────────────────────
  fastify.post("/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = checkSchema.parse(req.body);
    const { response } = await buildDefenseReceipt({
      mode:            "check",
      protocolId:      body.protocolId ?? "demo-protocol",
      asset:           body.asset,
      paymentVerified: false,
    });
    return reply.status(200).send(response);
  });

  // ── POST /drill — x402-gated attack drill ─────────────────────────────────
  fastify.post("/drill", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = drillSchema.parse(req.body) as DrillRequest;

    // Read payment tx from body or X-Payment-Tx header
    const paymentTx = body.paymentTxHash
      ?? (req.headers["x-payment-tx"] as string | undefined)
      ?? (req.headers["x-payment"] as string | undefined);

    // x402: return 402 if no payment provided
    if (!paymentTx) {
      const x402 = buildX402Error(`/api/v1/drill/${body.asset}`);
      return reply.status(402)
        .header("Content-Type", "application/json")
        .header("X-Payment-Required", Buffer.from(JSON.stringify(x402.paymentRequired)).toString("base64"))
        .send(x402);
    }

    // Verify payment (demo or onchain)
    const verification = await verifyPayment(paymentTx);
    if (!verification.valid) {
      return reply.status(402).send({
        error:  "Payment verification failed",
        reason: verification.reason,
        hint:   `Send ${X402_CONFIG.priceAtomic} USDC to ${X402_CONFIG.payTo} on ${X402_CONFIG.network}`,
      });
    }

    const { response } = await buildDefenseReceipt({
      mode:             "drill",
      protocolId:       body.protocolId ?? "demo-protocol",
      asset:            body.asset,
      paymentTxHash:    paymentTx,
      paymentVerified:  true,
      paymentAmount:    verification.amount,
      paymentMode:      verification.mode === "onchain" ? "verified_onchain" : "demo_accepted",
      shockPct:         body.shockPct,
      blocks:           body.blocks,
      liquidityDropPct: body.liquidityDropPct,
      stalenessSec:     body.stalenessSec,
    });

    return reply.status(200)
      .header("X-Payment-Response", JSON.stringify({ status: "accepted", txHash: paymentTx }))
      .send(response);
  });

  // ── POST /anchor — Anchor receipt on Sepolia ──────────────────────────────
  fastify.post("/anchor", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = anchorSchema.parse(req.body) as AnchorRequest;
    const { publicKeyHex } = loadOrGenerateKey();
    const agent = await getAgentInfo(publicKeyHex);

    const result = await anchorReceipt({
      evidenceHash: body.evidenceHash,
      runId:        body.runId,
      agentId:      agent.agentId,
      score:        body.score,
      level:        body.level,
      isDrill:      body.isDrill,
    });

    const response: AnchorResponse = {
      anchorTxHash:  result.txHash,
      explorerUrl:   result.explorerUrl,
      evidenceHash:  body.evidenceHash,
      simulated:     result.simulated,
    };

    return reply.status(result.success ? 200 : 500).send({
      ...response,
      castCommand:  result.castCommand,
      note:         result.simulated
        ? "Simulated anchor. Set ANCHOR_ENABLED=true + ANCHOR_PRIVATE_KEY + RECEIPT_REGISTRY_ADDRESS for real onchain tx."
        : "Anchored onchain.",
    });
  });

  // ── GET /receipt/:hash — Look up anchored receipt ─────────────────────────
  fastify.get("/receipt/:hash", async (req: FastifyRequest<{ Params: { hash: string } }>, reply: FastifyReply) => {
    const { hash } = req.params;
    // In production: read from ReceiptRegistry.sol via eth_call
    // For demo: return not-found with helpful message
    return reply.status(200).send({
      receipt:  null,
      anchored: false,
      message:  `Receipt ${hash} — onchain lookup requires RECEIPT_REGISTRY_ADDRESS to be set. Deploy ReceiptRegistry.sol and configure the env var.`,
      hint:     "Deploy contracts/src/ReceiptRegistry.sol to Sepolia, then set RECEIPT_REGISTRY_ADDRESS.",
    });
  });

  // ── GET /agent — ERC-8004 agent card ──────────────────────────────────────
  fastify.get("/agent", async (_req: FastifyRequest, reply: FastifyReply) => {
    const { publicKeyHex } = loadOrGenerateKey();
    const agent = await getAgentInfo(publicKeyHex);
    return reply.status(200).send(agent);
  });

  // ── GET /.well-known/agent.json — EIP-8004 discovery endpoint ─────────────
  fastify.get("/../.well-known/agent.json", async (_req: FastifyRequest, reply: FastifyReply) => {
    const { publicKeyHex } = loadOrGenerateKey();
    const agent = await getAgentInfo(publicKeyHex);
    return reply.status(200)
      .header("Content-Type", "application/json")
      .send(agent.card);
  });

  // ── POST /receipt/verify — Verify Ed25519 signature ──────────────────────
  fastify.post("/receipt/verify", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { receipt: DefenseReceipt };
    if (!body.receipt?.signature || !body.receipt?.agentPublicKey) {
      return reply.status(400).send({ error: "receipt.signature and receipt.agentPublicKey required" });
    }
    const { signature, agentPublicKey, ...unsigned } = body.receipt;
    const valid = verifySignature(unsigned, signature, agentPublicKey);
    return reply.status(200).send({
      valid,
      message: valid ? "✅ Signature valid — receipt is authentic" : "❌ Signature invalid",
      alg:     "Ed25519",
    });
  });

  // ── GET /health — Stack info ────────────────────────────────────────────────
  fastify.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status:    "ok",
      version:   "3.0.0",
      timestamp: new Date().toISOString(),
      stack: {
        cre: {
          configured: !!process.env.CRE_WORKFLOW_URL,
          dataFeeds:  "Sepolia (public, no key required)",
          feeds:      ["WETH", "WBTC", "LINK", "USDC"],
        },
        x402: {
          demoMode:  process.env.X402_DEMO_MODE !== "false",
          network:   X402_CONFIG.network,
          payTo:     X402_CONFIG.payTo,
          price:     `${X402_CONFIG.priceAtomic} atomic USDC ($0.001)`,
        },
        erc8004: {
          agentId:           process.env.AGENT_ID ?? "rf-agent-demo",
          sepoliaIdentity:   "0x8004A818BFB912233c491871b3d84c89A494BD9e",
          mainnetIdentity:   "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        },
        anchor: {
          enabled:    process.env.ANCHOR_ENABLED === "true",
          registry:   process.env.RECEIPT_REGISTRY_ADDRESS ?? "not configured",
        },
        claude: {
          configured: !!process.env.ANTHROPIC_API_KEY,
          model:      "claude-sonnet-4-20250514",
        },
      },
    });
  });
}
