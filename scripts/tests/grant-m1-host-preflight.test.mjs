import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGrantM1HostPreflight, GRANT_M1_HOST_PREFLIGHT_VERSION } from "../lib/grant-m1-host-preflight.mjs";

test("accepts a fail-closed healthy observer host record", () => {
  const record = evaluateGrantM1HostPreflight(healthy());
  assert.equal(record.schema_version, GRANT_M1_HOST_PREFLIGHT_VERSION);
  assert.equal(record.observer_id, "observer-provider-a");
  assert.equal(record.ready, true);
  assert.equal(record.clock_synchronized, true);
  assert.equal(record.key_permissions_verified, true);
  assert.equal(record.checks.runtime_commit_matches, true);
});

test("rejects group-readable observer keys", () => {
  const input = healthy();
  input.keyMetadata.mode = 0o640;
  assert.throws(() => evaluateGrantM1HostPreflight(input), /key permissions are unsafe/u);
});

test("rejects an unsynchronized clock", () => {
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), clockSynchronized: false }), /clock is not synchronized/u);
});

test("rejects a runtime commit mismatch or dirty tree", () => {
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), runtimeCommit: "b".repeat(40) }), /does not match/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), runtimeTreeClean: false }), /tree is not clean/u);
});

test("rejects a mismatched Node.js runtime", () => {
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), runtimeNodeVersion: "v24.0.0" }), /Node\.js version does not match/u);
});

test("rejects wrong observer identity or unavailable service", () => {
  const wrongIdentity = healthy();
  wrongIdentity.healthSnapshot = { status: "ready", observerId: "observer-provider-b" };
  assert.throws(() => evaluateGrantM1HostPreflight(wrongIdentity), /wrong identity/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), observerServiceActive: false }), /service is not active/u);
});

test("rejects insufficient disk or non-canonical timestamps", () => {
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), freeBytes: 99 }), /minimum free-disk/u);
  assert.throws(() => evaluateGrantM1HostPreflight({ ...healthy(), capturedAt: "2026-08-25" }), /canonical ISO timestamp/u);
});

function healthy() {
  const commit = "a".repeat(40);
  return {
    observerId: "observer-provider-a",
    capturedAt: "2026-08-25T12:00:00.000Z",
    runtimeCommit: commit,
    expectedRuntimeCommit: commit,
    runtimeNodeVersion: "v22.17.0",
    expectedNodeVersion: "v22.17.0",
    runtimeTreeClean: true,
    clockSynchronized: true,
    observerServiceActive: true,
    freeBytes: 10_000_000_000,
    minimumFreeBytes: 2_000_000_000,
    keyMetadata: { isFile: true, isSymbolicLink: false, ownerMatches: true, mode: 0o600 },
    healthSnapshot: { status: "ready", observerId: "observer-provider-a" },
  };
}
