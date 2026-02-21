import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { RiskEngine, RiskSignals } from '../services/riskEngine';

const checkSchema = z.object({
  asset: z.string(),
});

const drillSchema = z.object({
  asset: z.string(),
  paymentTx: z.string().optional(), // For x402 verification
});

export async function riskRoutes(fastify: FastifyInstance) {
  /**
   * GET /check
   * Free risk check (limited signals).
   */
  fastify.post('/check', async (request: FastifyRequest, reply: FastifyReply) => {
    const { asset } = checkSchema.parse(request.body);
    
    // Mock signals for demo (would call CRE/Data Feeds in production)
    const signals: RiskSignals = {
      oraclePrice: 2500,
      dexPrice: 2495,
      staleness: 30,
      liquidityUsd: 5000000,
    };

    const result = RiskEngine.computeRisk(signals);
    return { asset, ...result, isDrill: false };
  });

  /**
   * POST /drill
   * Paid risk drill (full signals + x402 gate).
   */
  fastify.post('/drill', async (request: FastifyRequest, reply: FastifyReply) => {
    const { asset, paymentTx } = drillSchema.parse(request.body);

    // x402 Micropayment Gate Logic
    // In a real implementation, we would verify the paymentTx on Base Sepolia
    if (!paymentTx) {
      return reply.status(402).send({
        error: 'Payment Required',
        message: 'Drill requires a $0.001 USDC micropayment on Base Sepolia.',
        paymentAddress: process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
        amount: '1000', // 0.001 USDC (6 decimals)
        network: 'Base Sepolia',
      });
    }

    // Full signals (simulating deeper CRE analysis)
    const signals: RiskSignals = {
      oraclePrice: 2500,
      dexPrice: 2350, // Significant divergence
      staleness: 120,
      liquidityUsd: 800000, // Low liquidity
    };

    const result = RiskEngine.computeRisk(signals);
    return { asset, ...result, isDrill: true, paymentVerified: true };
  });

  /**
   * POST /anchor
   * Anchors a receipt on-chain.
   */
  fastify.post('/anchor', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      evidenceHash: z.string(),
      runIdHash: z.string(),
      agentId: z.string(),
      score: z.number(),
      level: z.number(),
      isDrill: z.bool(),
    });

    const data = bodySchema.parse(request.body);
    
    // In production, this would trigger a transaction to ReceiptRegistry.sol
    // using a secure signer (e.g., AWS KMS or local encrypted key).
    
    return {
      success: true,
      message: 'Receipt anchored on Sepolia',
      txHash: '0x' + 'f'.repeat(64), // Mock tx hash
      ...data
    };
  });
}
