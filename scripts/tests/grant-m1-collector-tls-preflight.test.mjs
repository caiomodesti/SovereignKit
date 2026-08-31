import assert from "node:assert/strict";
import test from "node:test";

import { runGrantM1CollectorTlsPreflight, validateCollectorTlsOrigin } from "../lib/grant-m1-collector-tls-preflight.mjs";

const capturedAt = "2026-08-30T12:00:00.000Z";

test("accepts a trusted DNS-bound Collector edge with only ingestion exposed", async () => {
  const calls = [];
  const evidence = await runGrantM1CollectorTlsPreflight({
    componentId: "collector-oracle-e4-gru-canary",
    collectorOrigin: "https://collector.sovereignkit.example",
    expectedAddress: "192.0.2.10",
    capturedAt,
    resolveImpl: async () => ["192.0.2.10"],
    tlsInspectImpl: async () => ({ authorized: true, protocol: "TLSv1.3", validTo: "Sep 30 12:00:00 2026 GMT" }),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      if (String(url).startsWith("http://")) return response(308, "https://collector.sovereignkit.example/v0/probe-results");
      if (String(url).endsWith("/health")) return response(404);
      if (init.method === "GET") return response(404);
      return response(422);
    },
  });
  assert.equal(evidence.expected_address_matched, true);
  assert.equal(evidence.expected_address_persisted, false);
  assert.equal(evidence.tls_authorized, true);
  assert.equal(evidence.public_health_exposed, false);
  assert.equal(evidence.invalid_payload_status, 422);
  assert.equal(evidence.observer_independence_established, false);
  assert.equal(calls.length, 4);
  assert.equal(JSON.stringify(evidence).includes("192.0.2.10"), false);
});

test("rejects IP origins, credentials, paths, and reserved names", () => {
  assert.throws(() => validateCollectorTlsOrigin("https://192.0.2.10"), /DNS hostname/u);
  assert.throws(() => validateCollectorTlsOrigin("https://user:pass@collector.example.com"), /credentials/u);
  assert.throws(() => validateCollectorTlsOrigin("https://collector.example.com/path"), /without a path/u);
  assert.throws(() => validateCollectorTlsOrigin("https://collector.example.invalid"), /DNS hostname/u);
});

test("fails closed on DNS mismatch or untrusted TLS", async () => {
  const base = {
    componentId: "collector-oracle-e4-gru-canary",
    collectorOrigin: "https://collector.sovereignkit.example",
    expectedAddress: "192.0.2.10",
    capturedAt,
    fetchImpl: async () => response(404),
    tlsInspectImpl: async () => ({ authorized: true, protocol: "TLSv1.3", validTo: "Sep 30 12:00:00 2026 GMT" }),
  };
  await assert.rejects(runGrantM1CollectorTlsPreflight({ ...base, resolveImpl: async () => ["192.0.2.11"] }), /does not resolve/u);
  await assert.rejects(runGrantM1CollectorTlsPreflight({ ...base, resolveImpl: async () => ["192.0.2.10"], tlsInspectImpl: async () => ({ authorized: false, protocol: "TLSv1.3", validTo: "Sep 30 12:00:00 2026 GMT" }) }), /not publicly trusted/u);
});

test("fails closed when health leaks or the edge misses the Collector", async () => {
  const run = healthStatus => runGrantM1CollectorTlsPreflight({
    componentId: "collector-oracle-e4-gru-canary",
    collectorOrigin: "https://collector.sovereignkit.example",
    expectedAddress: "192.0.2.10",
    capturedAt,
    resolveImpl: async () => ["192.0.2.10"],
    tlsInspectImpl: async () => ({ authorized: true, protocol: "TLSv1.3", validTo: "Sep 30 12:00:00 2026 GMT" }),
    fetchImpl: async (url, init) => {
      if (String(url).startsWith("http://")) return response(308, "https://collector.sovereignkit.example/v0/probe-results");
      if (String(url).endsWith("/health")) return response(healthStatus);
      if (init.method === "GET") return response(404);
      return response(502);
    },
  });
  await assert.rejects(run(200), /health endpoint/u);
  await assert.rejects(run(404), /did not reach/u);
});

function response(status, location = null) {
  return { status, headers: { get: name => name.toLowerCase() === "location" ? location : null } };
}
