import { canonicalJson } from "./canonical.js";
import { MATCHING_PROFILE_VERSION, type BuiltProbe, type MatchingValidation } from "./types.js";

export function validateMatchedPair(left: BuiltProbe, right: BuiltProbe): MatchingValidation {
  const reasons: string[] = [];
  if (left.unit.transactionClass === right.unit.transactionClass) reasons.push("classes must differ");
  for (const field of ["experimentId", "experimentVersion", "phase", "observerId", "routeId", "probeIndex"] as const) {
    if (left.unit[field] !== right.unit[field]) reasons.push(`paired unit field differs: ${field}`);
  }
  if (left.pairNonceHex !== right.pairNonceHex) reasons.push("pair nonce differs");
  if (left.signature === right.signature) reasons.push("signed transaction signature was reused");
  if (left.wireTransactionBase64 === right.wireTransactionBase64) reasons.push("signed transaction bytes were reused");

  const leftComparable = { ...left.fingerprint };
  const rightComparable = { ...right.fingerprint };
  if (canonicalJson(leftComparable) !== canonicalJson(rightComparable)) reasons.push("structural fingerprint differs");

  const computeGap = Math.abs(left.fingerprint.expectedComputeUnits - right.fingerprint.expectedComputeUnits);
  const computeTolerance = Math.max(100, left.fingerprint.expectedComputeUnits * 0.01);
  if (computeGap > computeTolerance) reasons.push("expected compute consumption exceeds tolerance");

  return {
    valid: reasons.length === 0,
    profileVersion: MATCHING_PROFILE_VERSION,
    comparedUnitIds: [left.unit.unitId, right.unit.unitId],
    reasons,
  };
}

export function assertUniqueComparativeSignatures(probes: readonly BuiltProbe[]): void {
  const owners = new Map<string, string>();
  for (const probe of probes) {
    const previous = owners.get(probe.signature);
    if (previous !== undefined) {
      throw new Error(`signature ${probe.signature} is shared by units ${previous} and ${probe.unit.unitId}`);
    }
    owners.set(probe.signature, probe.unit.unitId);
  }
}
