/**
 * lib/canonical.ts — JSON Canonicalization Scheme (RFC 8785)
 * 
 * Garantiza que el mismo objeto SIEMPRE produce el mismo hash,
 * independientemente del orden de inserción de claves.
 * 
 * Crítico para: evidenceHash on-chain, auditoría por jurado,
 * verificación independiente de Defense Receipts.
 * 
 * Spec: https://www.rfc-editor.org/rfc/rfc8785
 */
import { createHash } from "node:crypto";

export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!isFinite(value)) throw new Error(`RFC 8785: non-finite number ${value}`);
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys
      .filter(k => obj[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
    return "{" + pairs.join(",") + "}";
  }
  throw new Error(`RFC 8785: unsupported type ${typeof value}`);
}

/** SHA-256 over RFC 8785 canonical JSON → "0x" + hex (Solidity bytes32 compatible) */
export function sha256Canonical(value: unknown): string {
  const canonical = canonicalize(value);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return "0x" + hash;
}

/** Returns both hash and canonical string so the jury can verify independently */
export function hashWithPayload(value: unknown): { evidenceHash: string; canonicalPayload: string } {
  const canonicalPayload = canonicalize(value);
  const evidenceHash = "0x" + createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
  return { evidenceHash, canonicalPayload };
}
