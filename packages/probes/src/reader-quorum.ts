import { canonicalJson } from "./canonical.js";
import type { ReaderClaim, UnsignedProbeResult } from "./types.js";

export function compatibleReaderClaims(claims: readonly ReaderClaim[]): readonly ReaderClaim[] {
  const groups = new Map<string, ReaderClaim[]>();
  for (const claim of claims) {
    if (!Number.isSafeInteger(claim.transaction_slot) || claim.transaction_slot! < 0) continue;
    const key = canonicalJson([claim.transaction_slot, claim.execution_error]);
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  return [...groups.values()].find(group => new Set(group.map(claim => claim.reader_id)).size >= 2) ?? [];
}

// Callers retain ledger-observation history across polls. Deadline is separate.
export function evaluateReaderClaimQuorum(claims: readonly ReaderClaim[], lastValidBlockHeight: number, priorLedgerObservation = false): {
  terminal?: UnsignedProbeResult["terminal_state"];
  supportingClaims: readonly ReaderClaim[];
} {
  if (claims.length !== 3 || new Set(claims.map(claim => claim.reader_id)).size !== 3) throw new Error("quorum requires three distinct readers");
  const failed = compatibleReaderClaims(claims.filter(claim => claim.signature_status !== null && claim.execution_error !== undefined));
  if (failed.length >= 2) return { terminal: "OBSERVED_EXECUTION_FAILED", supportingClaims: failed.slice(0, 2) };
  const finalized = compatibleReaderClaims(claims.filter(claim => claim.signature_status === "finalized" && claim.execution_error === undefined));
  if (finalized.length >= 2) return { terminal: "FINALIZED", supportingClaims: finalized.slice(0, 2) };
  const hasLedgerObservation = priorLedgerObservation || claims.some(claim => claim.signature_status !== null);
  const expired = claims.filter(claim => claim.signature_status === null && claim.reader_error === undefined && Number.isSafeInteger(claim.observed_block_height) && claim.observed_block_height! > lastValidBlockHeight);
  if (!hasLedgerObservation && Number.isSafeInteger(lastValidBlockHeight) && lastValidBlockHeight >= 0 && expired.length >= 2) return { terminal: "EXPIRED", supportingClaims: expired.slice(0, 2) };
  return { supportingClaims: [] };
}
