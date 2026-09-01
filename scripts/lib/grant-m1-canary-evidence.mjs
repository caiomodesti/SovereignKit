import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { evaluateGrantM1CanarySoak } from "./grant-m1-canary-soak.mjs";

export const GRANT_M1_CANARY_EVIDENCE_VERIFICATION_VERSION = "GrantM1CanaryEvidenceVerification@0.1.0";

const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function verifyGrantM1CanaryEvidence({ observerId, rawJsonl, rawBasename, summary }) {
  if (typeof rawJsonl !== "string" || rawJsonl.length === 0) throw new Error("raw canary JSONL is empty");
  if (!rawJsonl.endsWith("\n")) throw new Error("raw canary JSONL has a partial trailing record");
  if (typeof rawBasename !== "string" || !SAFE_BASENAME.test(rawBasename)) throw new Error("raw canary basename is invalid");
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) throw new Error("canary summary is invalid");
  if (!SHA256.test(summary.raw_jsonl_sha256 ?? "")) throw new Error("canary summary SHA-256 is invalid");
  if (summary.raw_jsonl_path_basename !== rawBasename) throw new Error("canary raw basename does not match summary");

  const lines = rawJsonl.slice(0, -1).split("\n");
  const samples = lines.map((line, index) => {
    if (line.length === 0) throw new Error(`raw canary JSONL contains an empty record at index ${index}`);
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`raw canary JSONL contains invalid JSON at index ${index}`);
    }
  });
  const rawSha256 = createHash("sha256").update(rawJsonl, "utf8").digest("hex");
  if (rawSha256 !== summary.raw_jsonl_sha256) throw new Error("raw canary JSONL SHA-256 does not match summary");

  const expected = {
    ...evaluateGrantM1CanarySoak({
      observerId,
      intervalSeconds: summary.interval_seconds,
      samples,
      requiredDurationSeconds: summary.required_duration_seconds,
    }),
    raw_jsonl_sha256: rawSha256,
    raw_jsonl_path_basename: rawBasename,
  };
  if (!isDeepStrictEqual(summary, expected)) throw new Error("canary summary does not match independently recomputed evidence");

  return {
    schema_version: GRANT_M1_CANARY_EVIDENCE_VERIFICATION_VERSION,
    observer_id: observerId,
    raw_jsonl_path_basename: rawBasename,
    raw_jsonl_sha256: rawSha256,
    sample_count: expected.sample_count,
    actual_duration_seconds: expected.actual_duration_seconds,
    coverage_ratio: expected.coverage_ratio,
    readiness_ratio: expected.readiness_ratio,
    identity_mismatch_count: expected.identity_mismatch_count,
    maximum_gap_ms: expected.maximum_gap_ms,
    admitted: expected.admitted,
    blockers: expected.blockers,
  };
}
