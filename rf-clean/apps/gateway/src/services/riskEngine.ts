import { ethers } from 'ethers';

export interface RiskSignals {
  oraclePrice: number;
  dexPrice: number;
  staleness: number; // seconds
  liquidityUsd: number;
}

export interface RiskResult {
  score: number; // 0-100
  level: 0 | 1 | 2 | 3 | 4; // 0: Safe, 1: Low, 2: Medium, 3: High, 4: Critical
  divergencePct: number;
  actions: string[];
  evidenceHash: string;
  timestamp: number;
}

export class RiskEngine {
  /**
   * Deterministic risk scoring based on signals.
   */
  static computeRisk(signals: RiskSignals): RiskResult {
    const divergencePct = Math.abs((signals.oraclePrice - signals.dexPrice) / signals.oraclePrice) * 100;
    
    let score = 0;
    
    // 1. Divergence Score (up to 50 points)
    if (divergencePct > 10) score += 50;
    else if (divergencePct > 5) score += 30;
    else if (divergencePct > 2) score += 15;
    
    // 2. Staleness Score (up to 30 points)
    if (signals.staleness > 3600) score += 30; // > 1 hour
    else if (signals.staleness > 600) score += 15; // > 10 mins
    
    // 3. Liquidity Score (up to 20 points)
    if (signals.liquidityUsd < 100000) score += 20; // < 100k
    else if (signals.liquidityUsd < 1000000) score += 10; // < 1M

    // Determine Level
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (score >= 80) level = 4;
    else if (score >= 60) level = 3;
    else if (score >= 40) level = 2;
    else if (score >= 20) level = 1;

    // Recommended Actions
    const actions: string[] = [];
    if (level >= 1) actions.push('MONITOR_CLOSELY');
    if (level >= 2) actions.push('REDUCE_LTV');
    if (level >= 3) actions.push('CAP_SUPPLY');
    if (level >= 4) actions.push('FREEZE_MARKET');

    const timestamp = Math.floor(Date.now() / 1000);
    
    // Canonical Receipt for Hashing
    const receipt = {
      signals,
      score,
      level,
      divergencePct,
      actions,
      timestamp
    };

    // Deterministic SHA256 Hash of the canonical JSON
    const evidenceHash = ethers.sha256(ethers.toUtf8Bytes(JSON.stringify(receipt, Object.keys(receipt).sort())));

    return {
      score,
      level,
      divergencePct,
      actions,
      evidenceHash,
      timestamp
    };
  }
}
