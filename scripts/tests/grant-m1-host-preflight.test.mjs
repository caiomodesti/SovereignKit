import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGrantM1HostPreflight, GRANT_M1_HOST_PREFLIGHT_VERSION, validateObserverRuntimeManifest } from "../lib/grant-m1-host-preflight.mjs";

test("accepts a frozen healthy observer host", () => {
  const record = evaluateGrantM1HostPreflight(healthy());
  assert.equal(record.schema_version, GRANT_M1_HOST_PREFLIGHT_VERSION);
  assert.equal(record.ready, true);
  assert.equal(record.checks.runtime_manifest_verified, true);
  assert.equal(record.checks.loopback_binding_exclusive, true);
});

test("rejects runtime, unit, service, and network drift", () => {
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), manifestFilesVerified: 2 }), /not fully verified/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), serviceUnitVerified: false }), /integrity failed/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), observerServiceEnabled: false }), /active and enabled/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), loopbackBindingExclusive: false }), /exclusively to loopback/u);
});

test("rejects unsafe observer key, clock, runtime, identity, or disk", () => {
  const mode = healthy(); mode.keyMetadata.mode = 0o640;
  assert.throws(() => evaluateGrantM1HostPreflight(mode), /exactly 0600/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), clockSynchronized: false }), /not synchronized/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), runtimeCommit: "b".repeat(40) }), /does not match/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), runtimeNodeVersion: "v24.0.0" }), /Node\.js version/u);
  const identity = healthy(); identity.healthSnapshot = { status: "ready", observerId: "observer-provider-b" };
  assert.throws(() => evaluateGrantM1HostPreflight(identity), /wrong identity/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), freeBytes: 99 }), /minimum free-disk/u);
});

test("validates Observer runtime manifest paths, hashes, and uniqueness", () => {
  const manifest = { schema_version: "GrantM1ObserverRuntimeManifest@0.1.0", source_commit: "a".repeat(40), node_version: "22.17.0", files: [{ path: "package.json", sha256: "b".repeat(64) }] };
  assert.equal(validateObserverRuntimeManifest(manifest), manifest);
  assert.throws(() => validateObserverRuntimeManifest({ ...manifest, files: [{ path: "../secret", sha256: "b".repeat(64) }] }), /entry is invalid/u);
  assert.throws(() => validateObserverRuntimeManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }), /duplicate paths/u);
});

function healthy() {
  const commit = "a".repeat(40);
  return {
    observerId: "observer-provider-a", capturedAt: "2026-08-30T12:00:00.000Z",
    runtimeCommit: commit, expectedRuntimeCommit: commit,
    runtimeNodeVersion: "v22.17.0", expectedNodeVersion: "v22.17.0",
    runtimeManifestVerified: true, manifestFileCount: 100, manifestFilesVerified: 100,
    serviceUnitVerified: true, clockSynchronized: true,
    observerServiceActive: true, observerServiceEnabled: true, loopbackBindingExclusive: true,
    freeBytes: 10_000_000_000, minimumFreeBytes: 2_000_000_000,
    keyMetadata: { isFile: true, isSymbolicLink: false, ownerMatches: true, mode: 0o600 },
    healthSnapshot: { status: "ready", observerId: "observer-provider-a" }
  };
}
