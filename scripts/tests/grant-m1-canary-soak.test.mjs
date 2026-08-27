import assert from "node:assert/strict";
import test from "node:test";

import { createGrantM1CanarySample, evaluateGrantM1CanarySoak, validateLoopbackReadyUrl } from "../lib/grant-m1-canary-soak.mjs";

test("admits a complete healthy 24-hour canary", () => {
  const samples = healthySamples();
  const summary = evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples });
  assert.equal(summary.admitted, true);
  assert.equal(summary.sample_count, 1441);
  assert.equal(summary.readiness_ratio, 1);
  assert.deepEqual(summary.blockers, []);
});

test("preserves failures and rejects an identity mismatch", () => {
  const samples = healthySamples();
  samples[500] = createGrantM1CanarySample({
    observerId: "observer-provider-a",
    sampleIndex: 500,
    capturedAt: samples[500].captured_at,
    elapsedMs: samples[500].elapsed_ms,
    latencyMs: 12,
    httpStatus: 200,
    healthSnapshot: { status: "ready", observerId: "observer-provider-b" },
  });
  const summary = evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples });
  assert.equal(summary.admitted, false);
  assert.equal(summary.identity_mismatch_count, 1);
  assert.ok(summary.blockers.includes("observer_identity_mismatch"));
});

test("rejects incomplete coverage and malformed sequence", () => {
  const complete = healthySamples();
  const sparse = complete.filter((_, index) => index % 2 === 0);
  sparse.forEach((sample, index) => { sparse[index] = { ...sample, sample_index: index }; });
  const summary = evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples: sparse });
  assert.equal(summary.admitted, false);
  assert.ok(summary.blockers.includes("sample_coverage_below_95_percent"));

  const malformed = healthySamples();
  malformed[2] = { ...malformed[2], sample_index: 9 };
  assert.throws(() => evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples: malformed }), /sequence is invalid/u);
});

test("does not mistake a forward wall-clock jump for 24 real hours", () => {
  const samples = healthySamples().slice(0, 721).map((sample, index) => ({
    ...sample,
    captured_at: new Date(Date.parse("2026-08-27T00:00:00.000Z") + index * 240_000).toISOString(),
  }));
  const summary = evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples });
  assert.equal(summary.actual_duration_seconds, 43_200);
  assert.equal(summary.admitted, false);
  assert.ok(summary.blockers.includes("duration_below_24_hours"));
});

test("rejects a tampered readiness outcome", () => {
  const samples = healthySamples();
  samples[10] = { ...samples[10], http_status: null };
  assert.throws(
    () => evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples }),
    /outcome is inconsistent/u,
  );
});

test("retains an interrupted run as a rejected summary", () => {
  const sample = createGrantM1CanarySample({
    observerId: "observer-provider-a",
    sampleIndex: 0,
    capturedAt: "2026-08-27T00:00:00.000Z",
    elapsedMs: 0,
    latencyMs: 0,
    errorCode: "ABORTED",
  });
  const summary = evaluateGrantM1CanarySoak({ observerId: "observer-provider-a", intervalSeconds: 60, samples: [sample] });
  assert.equal(summary.admitted, false);
  assert.equal(summary.sample_count, 1);
  assert.ok(summary.blockers.includes("duration_below_24_hours"));
  assert.ok(summary.blockers.includes("readiness_below_99_percent"));
});

test("allows only the loopback readiness endpoint", () => {
  assert.equal(validateLoopbackReadyUrl("http://127.0.0.1:8790/ready").pathname, "/ready");
  assert.throws(() => validateLoopbackReadyUrl("https://observer.example/ready"), /loopback/u);
  assert.throws(() => validateLoopbackReadyUrl("http://127.0.0.1:8790/health"), /loopback/u);
});

function healthySamples() {
  const start = Date.parse("2026-08-27T00:00:00.000Z");
  return Array.from({ length: 1441 }, (_, sampleIndex) => createGrantM1CanarySample({
    observerId: "observer-provider-a",
    sampleIndex,
    capturedAt: new Date(start + sampleIndex * 60_000).toISOString(),
    elapsedMs: sampleIndex * 60_000,
    latencyMs: 8,
    httpStatus: 200,
    healthSnapshot: { status: "ready", observerId: "observer-provider-a" },
  }));
}
