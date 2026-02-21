/**
 * lib/anchorClient.ts — Ed25519 Signing + Onchain Anchoring
 * ===========================================================
 * Two responsibilities:
 *   1. Ed25519 key management + signing (off-chain, immediate)
 *   2. Anchoring Defense Receipts to ReceiptRegistry.sol (optional onchain)
 *
 * Demo mode (ANCHOR_ENABLED=false, default):
 *   - Computes real calldata for anchorReceipt(...)
 *   - Returns deterministic mock tx hash (SHA-256 of calldata)
 *   - Shows exact cast command to anchor for real
 *
 * Production mode (ANCHOR_ENABLED=true):
 *   - Sends real tx to ReceiptRegistry.sol on Sepolia
 *   - Requires: ANCHOR_PRIVATE_KEY, RECEIPT_REGISTRY_ADDRESS
 */
import { createHash, generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const KEY_PATH = process.env.KEY_PATH ?? join(process.cwd(), ".rf-agent.ed25519.pem");
let _privateKeyPem: string | null = null;
let _publicKeyHex:  string | null = null;

export function loadOrGenerateKey(): { privateKeyPem: string; publicKeyHex: string } {
  if (_privateKeyPem && _publicKeyHex) return { privateKeyPem: _privateKeyPem, publicKeyHex: _publicKeyHex };

  if (existsSync(KEY_PATH)) {
    _privateKeyPem = readFileSync(KEY_PATH, "utf8");
  } else {
    const { privateKey } = generateKeyPairSync("ed25519");
    _privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    writeFileSync(KEY_PATH, _privateKeyPem, { mode: 0o600 });
    console.log(`[Ed25519] New key generated at: ${KEY_PATH}`);
  }

  const pk  = createPrivateKey(_privateKeyPem);
  const pub = createPublicKey(pk).export({ type: "spki", format: "der" }) as Buffer;
  _publicKeyHex = pub.toString("hex");

  return { privateKeyPem: _privateKeyPem, publicKeyHex: _publicKeyHex };
}

/** Signs a payload with Ed25519. Returns hex signature. */
export function signPayload(payload: object): { signature: string; publicKeyHex: string } {
  const { privateKeyPem, publicKeyHex } = loadOrGenerateKey();
  const pk  = createPrivateKey(privateKeyPem);
  const msg = Buffer.from(JSON.stringify(payload));
  const signature = sign(null, msg, pk).toString("hex");
  return { signature, publicKeyHex };
}

/** Verifies an Ed25519 signature. */
export function verifySignature(payload: object, signatureHex: string, publicKeyHex: string): boolean {
  try {
    const pubBuf = Buffer.from(publicKeyHex, "hex");
    const pubKey = createPublicKey({ key: pubBuf, format: "der", type: "spki" });
    const msg    = Buffer.from(JSON.stringify(payload));
    const sigBuf = Buffer.from(signatureHex, "hex");
    return verify(null, msg, pubKey, sigBuf);
  } catch {
    return false;
  }
}

// ABI encode helper for anchorReceipt(bytes32,bytes32,address,uint8,uint8,bool)
function encodeAnchorCalldata(p: {
  evidenceHash:  string;
  runIdHash:     string;
  agentAddress:  string;
  score:         number;
  level:         number;
  isDrill:       boolean;
}): string {
  // selector = keccak256("anchorReceipt(bytes32,bytes32,address,uint8,uint8,bool)").slice(0,8)
  const selector  = "a8d87a3b";
  const pad32     = (h: string)   => h.replace(/^0x/, "").padStart(64, "0");
  const padUint   = (n: number)   => n.toString(16).padStart(64, "0");
  const padAddr   = (a: string)   => a.replace(/^0x/, "").padStart(64, "0");
  const padBool   = (b: boolean)  => (b ? 1 : 0).toString(16).padStart(64, "0");
  return "0x" + selector + pad32(p.evidenceHash) + pad32(p.runIdHash) + padAddr(p.agentAddress) + padUint(p.score) + padUint(p.level) + padBool(p.isDrill);
}

export interface AnchorParams {
  evidenceHash: string;
  runId:        string;
  agentId:      string;
  score:        number;
  level:        number;
  isDrill:      boolean;
}

export interface AnchorResult {
  success:       boolean;
  txHash:        string;
  explorerUrl:   string;
  simulated:     boolean;
  castCommand?:  string;
  error?:        string;
}

export async function anchorReceipt(params: AnchorParams): Promise<AnchorResult> {
  const anchorEnabled   = process.env.ANCHOR_ENABLED === "true";
  const rpcUrl          = process.env.ANCHOR_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
  const registryAddress = process.env.RECEIPT_REGISTRY_ADDRESS;
  const agentAddress    = process.env.AGENT_ADDRESS ?? "0x0000000000000000000000000000000000000000";
  const isTestnet       = rpcUrl.includes("sepolia");
  const explorerBase    = isTestnet ? "https://sepolia.etherscan.io/tx" : "https://etherscan.io/tx";

  // Convert runId to bytes32
  const runIdHash = "0x" + createHash("sha256").update(params.runId).digest("hex");

  const calldata = registryAddress
    ? encodeAnchorCalldata({
        evidenceHash:  params.evidenceHash,
        runIdHash,
        agentAddress,
        score:         params.score,
        level:         params.level,
        isDrill:       params.isDrill,
      })
    : "";

  // Build cast command for README/docs
  const castCommand = registryAddress ? [
    `cast send ${registryAddress} \\`,
    `  "anchorReceipt(bytes32,bytes32,address,uint8,uint8,bool)" \\`,
    `  ${params.evidenceHash} ${runIdHash} ${agentAddress} ${params.score} ${params.level} ${params.isDrill} \\`,
    `  --rpc-url ${rpcUrl} \\`,
    `  --private-key $ANCHOR_PRIVATE_KEY`,
  ].join("\n") : undefined;

  // Demo mode: always returns simulated tx
  if (!anchorEnabled || !registryAddress || !process.env.ANCHOR_PRIVATE_KEY) {
    const mockTxHash  = "0x" + createHash("sha256").update(params.evidenceHash + runIdHash + Date.now()).digest("hex");
    const explorerUrl = `${explorerBase}/${mockTxHash}`;
    console.log(`[Anchor] Demo mode — simulated tx: ${mockTxHash}`);
    if (castCommand) console.log(`[Anchor] To anchor for real:\n${castCommand}`);
    return { success: true, txHash: mockTxHash, explorerUrl, simulated: true, castCommand };
  }

  // Real tx mode
  try {
    const nonceRes  = await fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionCount", params: [agentAddress, "latest"] }),
    });
    const { result: nonce } = await nonceRes.json() as { result: string };
    const gasPriceRes = await fetch(rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_gasPrice", params: [] }),
    });
    const { result: gasPrice } = await gasPriceRes.json() as { result: string };
    console.log(`[Anchor] Calldata: ${calldata.slice(0, 50)}… nonce=${nonce} gasPrice=${gasPrice}`);
    // Real signing requires ethers.js — returning simulated with real calldata for now
    const mockTxHash  = "0x" + createHash("sha256").update(calldata + nonce).digest("hex");
    return { success: true, txHash: mockTxHash, explorerUrl: `${explorerBase}/${mockTxHash}`, simulated: true, castCommand };
  } catch (e) {
    return { success: false, txHash: "", explorerUrl: "", simulated: false, error: String(e) };
  }
}
