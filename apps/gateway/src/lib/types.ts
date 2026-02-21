// lib/types.ts — Reality Firewall v3 — Shared Types
export type RiskLevel = 0 | 1 | 2 | 3 | 4;
export type RiskLevelName = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const LEVEL_NAMES: Record<RiskLevel, RiskLevelName> = {
  0: "SAFE", 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL",
};
export type VulnClass = "NONE"|"ORACLE_DIVERGENCE"|"STALE_FEED"|"THIN_LIQUIDITY"|"COMPOSITE_ATTACK";
export type ActionType = "MONITOR"|"REDUCE_LTV"|"CAP_SUPPLY"|"CAP_BORROW"|"FREEZE_MARKET"|"ALERT_GOVERNANCE";
export interface PolicyAction { type: ActionType; severity: "info"|"warning"|"critical"; reason: string; param?: string; newValue?: number; oldValue?: number; }
export interface OracleSignals { asset: string; oraclePrice: number; dexPrice: number; divergencePct: number; stalenessSeconds: number; liquidityDepthUsd: number; fundingRatePct: number; blockNumber: number; feedAddress: string; sourceLabel: string; creWorkflowId?: string; creEvidenceHash?: string; timestamp: number; }
export interface RiskResult { runId: string; asset: string; score: number; level: RiskLevel; levelName: RiskLevelName; vulnClass: VulnClass; exploitWindowBlocks: number; signals: OracleSignals; actions: PolicyAction[]; aiAnalysis?: string; evidenceHash: string; canonicalPayload: string; timestamp: number; isDrill: boolean; }
export interface DefenseReceipt { version: "rf-v3"; runId: string; protocolId: string; mode: "check"|"drill"; result: RiskResult; paymentTxHash?: string; paymentNetwork?: string; paymentVerified: boolean; paymentAmount?: string; agentId: string; agentRegistry: string; agentPublicKey: string; anchorTxHash?: string; anchorNetwork?: string; anchorExplorer?: string; signature: string; createdAtIso: string; }
export interface X402PaymentRequirement { scheme: "exact"; network: string; maxAmountRequired: string; resource: string; description: string; mimeType: string; payTo: string; maxTimeoutSeconds: number; asset: string; extra: { name: string; version: string; docs: string; }; }
export interface X402ErrorResponse { error: "Payment Required"; code: "x402_payment_required"; paymentRequired: X402PaymentRequirement; hint: string; x402Docs: string; }
export interface AgentCard { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"; name: string; description: string; image?: string; services: Array<{ name: string; endpoint: string; version?: string }>; capabilities: string[]; supportedTrust: string[]; }
export interface AgentIdentity { agentId: string; agentAddress: string; agentURI: string; agentRegistry: string; card: AgentCard; publicKey: string; network: string; registries: { mainnetIdentity: string; mainnetReputation: string; sepoliaIdentity: string; sepoliaReputation: string; eip: string; }; }
export interface CheckRequest { asset: string; protocolId?: string; }
export interface DrillRequest { asset: string; protocolId?: string; paymentTxHash?: string; shockPct?: number; blocks?: number; liquidityDropPct?: number; stalenessSec?: number; }
export interface AnchorRequest { evidenceHash: string; runId: string; score: number; level: number; isDrill: boolean; }
export interface CheckResponse { receipt: DefenseReceipt; agent: AgentIdentity; }
export interface DrillResponse extends CheckResponse { paymentTxHash: string; paymentVerified: boolean; paymentMode: "verified_onchain"|"demo_accepted"; }
export interface AnchorResponse { anchorTxHash: string; explorerUrl: string; evidenceHash: string; simulated: boolean; }
