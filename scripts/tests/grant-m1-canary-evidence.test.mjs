import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { verifyGrantM1CanaryEvidence } from "../lib/grant-m1-canary-evidence.mjs";
import { createGrantM1CanarySample, evaluateGrantM1CanarySoak } from "../lib/grant-m1-canary-soak.mjs";

test("independently verifies a complete admitted Observer canary", () => {
  const evidence = healthyEvidence();
  const verification = verifyGrantM1CanaryEvidence(evidence);
  assert.equal(verification.admitted, true);
  assert.equal(verification.sample_count, 1441);
  assert.equal(verification.actual_duration_seconds, 86_400);
});

test("rejects summary drift even when the raw digest is unchanged", () => {
  const evidence = healthyEvidence();
  evidence.summary = { ...evidence.summary, readiness_ratio: 0.999 };
  assert.throws(() => verifyGrantM1CanaryEvidence(evidence), /independently recomputed/u);
});

test("rejects raw evidence drift", () => {
  const evidence = healthyEvidence();
  evidence.rawJsonl = evidence.rawJsonl.replace('"latency_ms":8', '"latency_ms":9');
  assert.throws(() => verifyGrantM1CanaryEvidence(evidence), /SHA-256 does not match/u);
});

test("rejects unsafe basenames and partial trailing records", () => {
  const unsafe = healthyEvidence();
  unsafe.rawBasename = "../canary.jsonl";
  assert.throws(() => verifyGrantM1CanaryEvidence(unsafe), /basename is invalid/u);

  const partial = healthyEvidence();
  partial.rawJsonl = partial.rawJsonl.slice(0, -1);
  assert.throws(() => verifyGrantM1CanaryEvidence(partial), /partial trailing record/u);
});

function healthyEvidence() {
  const observerId = "observer-provider-a";
  const rawBasename = "observer-provider-a-canary.jsonl";
  const start = Date.parse("2026-08-31T04:48:08.256Z");
  const samples = Array.from({ length: 1441 }, (_, sampleIndex) => createGrantM1CanarySample({
    observerId,
    sampleIndex,
    capturedAt: new Date(start + sampleIndex * 60_000).toISOString(),
    elapsedMs: sampleIndex * 60_000,
    latencyMs: 8,
    httpStatus: 200,
    healthSnapshot: { status: "ready", observerId },
  }));
  const rawJsonl = `${samples.map(sample => JSON.stringify(sample)).join("\n")}\n`;
  const summary = {
    ...evaluateGrantM1CanarySoak({ observerId, intervalSeconds: 60, samples }),
    raw_jsonl_sha256: createHash("sha256").update(rawJsonl, "utf8").digest("hex"),
    raw_jsonl_path_basename: rawBasename,
  };
  return { observerId, rawJsonl, rawBasename, summary };
}
