import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCollectorDurableReplay } from "../lib/grant-m1-collector-durable-replay.mjs";

test("accepts one durable append reconstructed across restart with duplicate replay", () => {
  const result = evaluateCollectorDurableReplay(healthy());
  assert.equal(result.passed, true);
  assert.equal(result.checks.replay_rejected_as_duplicate, true);
});

test("fails closed on missing durability, restart state, duplicate handling, or permissions", () => {
  assert.throws(() => evaluateCollectorDurableReplay({ ...healthy(), afterAcceptStoredCount: 0 }), /first durable ingest/u);
  assert.throws(() => evaluateCollectorDurableReplay({ ...healthy(), afterRestartStoredCount: 0 }), /reconstruct/u);
  assert.throws(() => evaluateCollectorDurableReplay({ ...healthy(), replayStatus: "ACCEPTED" }), /not idempotent/u);
  assert.throws(() => evaluateCollectorDurableReplay({ ...healthy(), evidenceMode: 0o640 }), /0600/u);
});

function healthy() { return { capturedAt: "2026-08-28T12:00:00.000Z", beforeStoredCount: 0, acceptStatus: "ACCEPTED", afterAcceptStoredCount: 1, serviceRestarted: true, afterRestartStoredCount: 1, replayStatus: "DUPLICATE", afterReplayStoredCount: 1, evidenceRecordCount: 1, evidenceMode: 0o600 }; }
