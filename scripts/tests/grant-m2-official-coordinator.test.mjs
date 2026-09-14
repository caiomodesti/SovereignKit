import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planGrantM2OfficialCoordinator } from "../lib/grant-m2-official-coordinator.mjs";
import { createGrantM2OfficialRun, GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "../lib/grant-m2-official-run.mjs";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const run = createGrantM2OfficialRun({
  runId: "m2-official-coordinator-test", startAt: "2026-09-14T04:10:00.000Z", authorizedAt: "2026-09-14T04:05:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT, preflightCapturedAt: "2026-09-14T04:04:00.000Z",
  preflightSha256: "a".repeat(64), precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256, sourceCommit: "b".repeat(40),
  observerInitialSequences: { "observer-aws-a": 100, "observer-google-e2-micro": 200, "observer-oracle-a1": 300 }, quota,
});
const started = { event: "WINDOW_STARTED", recorded_at: run.schedule.start_at };

test("waits before start, starts only inside tolerance, and blocks a late start", () => {
  assert.equal(planGrantM2OfficialCoordinator({ run, quota, records: [], nowAt: "2026-09-14T04:09:59.999Z" }).status, "WAITING_TO_START");
  assert.deepEqual(planGrantM2OfficialCoordinator({ run, quota, records: [], nowAt: run.schedule.start_at }).actions.map(action => action.type), ["START_WINDOW"]);
  assert.equal(planGrantM2OfficialCoordinator({ run, quota, records: [], nowAt: "2026-09-14T04:12:00.001Z" }).status, "BLOCKED_START_MISSED");
});

test("marks late slots missing without backfill and schedules only one active slot per observer", () => {
  const nowAt = "2026-09-14T04:12:00.001Z";
  const plan = planGrantM2OfficialCoordinator({ run, quota, records: [started], nowAt, activeAssignments: [] });
  assert.equal(plan.actions[0].type, "RECORD_MISSING");
  assert.equal(plan.actions[0].slot.slot_id, run.schedule.slots[0].slot_id);
  assert.equal(plan.actions.find(action => action.slot?.slot_id === run.schedule.slots[1].slot_id)?.type, "EXECUTE_SLOT");
  const awsActive = [{ slot_id: run.schedule.slots[0].slot_id, observer_id: "observer-aws-a", assignment_id: "assignment-a" }];
  const withActive = planGrantM2OfficialCoordinator({ run, quota, records: [started], nowAt: "2026-09-14T04:11:00.000Z", activeAssignments: awsActive });
  assert.equal(withActive.actions.find(action => action.slot?.observer_id === "observer-aws-a")?.type, "WAIT_FOR_ACTIVE_OBSERVER");
});

test("never plans two concurrent executions for the same observer", () => {
  const plan = planGrantM2OfficialCoordinator({ run, quota, records: [started], nowAt: "2026-09-14T04:11:40.000Z" });
  const executions = plan.actions.filter(action => action.type === "EXECUTE_SLOT");
  assert.equal(new Set(executions.map(action => action.slot.observer_id)).size, executions.length);
  assert.ok(plan.actions.some(action => action.type === "WAIT_FOR_ACTIVE_OBSERVER"));
});
