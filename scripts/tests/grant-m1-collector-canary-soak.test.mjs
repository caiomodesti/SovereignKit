import test from "node:test";
import assert from "node:assert/strict";

import { createGrantM1CollectorCanarySample, evaluateGrantM1CollectorCanarySoak, validateCollectorLoopbackHealthUrl } from "../lib/grant-m1-collector-canary-soak.mjs";

test("admits a complete healthy 24-hour Collector soak", () => {
  const samples = healthySamples(1441);
  const result = evaluateGrantM1CollectorCanarySoak({ componentId: "collector-e4", intervalSeconds: 60, samples });
  assert.equal(result.admitted, true);
  assert.equal(result.coverage_ratio, 1);
  assert.equal(result.storage_regression_count, 0);
});

test("rejects short, sparse, unavailable, or regressing evidence", () => {
  assert.equal(evaluateGrantM1CollectorCanarySoak({ componentId: "collector-e4", intervalSeconds: 60, samples: healthySamples(2, 60_000) }).admitted, false);
  const sparse = healthySamples(2, 86_400_000); assert.ok(evaluateGrantM1CollectorCanarySoak({ componentId: "collector-e4", intervalSeconds: 60, samples: sparse }).blockers.includes("sample_coverage_below_95_percent"));
  const unavailable = healthySamples(1441);
  for (let index = 100; index < 120; index += 1) unavailable[index] = createGrantM1CollectorCanarySample({ componentId: "collector-e4", sampleIndex: index, capturedAt: timestamp(index), elapsedMs: index * 60_000, latencyMs: 5000, errorCode: "TIMEOUT" });
  assert.ok(evaluateGrantM1CollectorCanarySoak({ componentId: "collector-e4", intervalSeconds: 60, samples: unavailable }).blockers.includes("readiness_below_99_percent"));
  const regress = healthySamples(1441); regress[100].stored_count = 0; regress[99].stored_count = 1;
  assert.ok(evaluateGrantM1CollectorCanarySoak({ componentId: "collector-e4", intervalSeconds: 60, samples: regress }).blockers.includes("stored_count_regressed"));
});

test("restricts health checks to loopback /health", () => {
  assert.equal(validateCollectorLoopbackHealthUrl("http://127.0.0.1:8787/health").pathname, "/health");
  assert.throws(() => validateCollectorLoopbackHealthUrl("https://example.com/health"), /loopback/u);
  assert.throws(() => validateCollectorLoopbackHealthUrl("http://127.0.0.1:8787/ready"), /loopback/u);
});

function healthySamples(count, finalElapsed = 86_400_000) {
  return Array.from({ length: count }, (_, index) => createGrantM1CollectorCanarySample({ componentId: "collector-e4", sampleIndex: index, capturedAt: timestamp(index, count, finalElapsed), elapsedMs: Math.round(index * finalElapsed / (count - 1 || 1)), latencyMs: 2, httpStatus: 200, healthSnapshot: { status: "ok", storedCount: 1 } }));
}
function timestamp(index, count = 1441, finalElapsed = 86_400_000) { return new Date(Date.parse("2026-08-28T12:00:00.000Z") + Math.round(index * finalElapsed / (count - 1 || 1))).toISOString(); }
