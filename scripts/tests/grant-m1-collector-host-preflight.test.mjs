import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGrantM1CollectorHostPreflight, validateCollectorRuntimeManifest } from "../lib/grant-m1-collector-host-preflight.mjs";

test("accepts a healthy frozen Collector host", () => {
  const record = evaluateGrantM1CollectorHostPreflight(healthy());
  assert.equal(record.ready, true);
  assert.equal(record.component_id, "collector-oracle-e4-gru-canary");
  assert.equal(record.checks.loopback_binding_exclusive, true);
});

test("rejects runtime, unit, service, and network drift", () => {
  assert.throws(() => evaluateGrantM1CollectorHostPreflight({ ...healthy(), manifestFilesVerified: 3 }), /not fully verified/u);
  assert.throws(() => evaluateGrantM1CollectorHostPreflight({ ...healthy(), serviceUnitVerified: false }), /integrity failed/u);
  assert.throws(() => evaluateGrantM1CollectorHostPreflight({ ...healthy(), collectorServiceEnabled: false }), /active and enabled/u);
  assert.throws(() => evaluateGrantM1CollectorHostPreflight({ ...healthy(), loopbackBindingExclusive: false }), /exclusively to loopback/u);
});

test("rejects unsafe evidence metadata or bad health", () => {
  const mode = healthy(); mode.evidenceMetadata.mode = 0o640;
  assert.throws(() => evaluateGrantM1CollectorHostPreflight(mode), /exactly 0600/u);
  const health = healthy(); health.healthSnapshot = { status: "ok", storedCount: -1 };
  assert.throws(() => evaluateGrantM1CollectorHostPreflight(health), /health response is invalid/u);
});

test("validates runtime manifest paths, hashes, and uniqueness", () => {
  const manifest = { schema_version: "GrantM1CollectorRuntimeManifest@0.1.0", source_commit: "a".repeat(40), node_version: "22.17.0", files: [{ path: "package.json", sha256: "b".repeat(64) }] };
  assert.equal(validateCollectorRuntimeManifest(manifest), manifest);
  assert.throws(() => validateCollectorRuntimeManifest({ ...manifest, files: [{ path: "../secret", sha256: "b".repeat(64) }] }), /entry is invalid/u);
  assert.throws(() => validateCollectorRuntimeManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }), /duplicate paths/u);
});

function healthy() {
  const commit = "a".repeat(40);
  return {
    componentId: "collector-oracle-e4-gru-canary",
    capturedAt: "2026-08-28T12:00:00.000Z",
    runtimeCommit: commit,
    expectedRuntimeCommit: commit,
    runtimeNodeVersion: "v22.17.0",
    expectedNodeVersion: "v22.17.0",
    runtimeManifestVerified: true,
    manifestFileCount: 100,
    manifestFilesVerified: 100,
    serviceUnitVerified: true,
    clockSynchronized: true,
    collectorServiceActive: true,
    collectorServiceEnabled: true,
    loopbackBindingExclusive: true,
    freeBytes: 10_000_000_000,
    minimumFreeBytes: 2_000_000_000,
    evidenceMetadata: { isFile: true, isSymbolicLink: false, ownerMatches: true, mode: 0o600 },
    healthSnapshot: { status: "ok", storedCount: 0 },
  };
}
