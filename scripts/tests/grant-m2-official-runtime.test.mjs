import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createGrantM2OfficialSchedule,
  GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  validateGrantM2OfficialSchedule,
} from "../lib/grant-m2-official-schedule.mjs";
import {
  createGrantM2OfficialRun,
  GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT,
  validateGrantM2OfficialRun,
} from "../lib/grant-m2-official-run.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const base = {
  runId: "m2-official-20260914",
  startAt: "2026-09-14T02:10:00.000Z",
  authorizedAt: "2026-09-14T02:05:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT,
  preflightCapturedAt: "2026-09-14T02:04:00.000Z",
  preflightSha256: "a".repeat(64),
  precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit: "b".repeat(40),
  observerInitialSequences: { "observer-aws-a": 100, "observer-google-e2-micro": 200, "observer-oracle-a1": 300 },
  quota,
};

test("creates exactly 672 frozen cycles and 4032 unique official slots", () => {
  const schedule = createGrantM2OfficialSchedule(base);
  assert.deepEqual(validateGrantM2OfficialSchedule(schedule, quota), {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_SCHEDULE",
    plannedCycles: 672,
    plannedUnits: 4032,
    realWindowSeconds: 1209600,
    backfillMissingCycles: false,
  });
  assert.equal(schedule.slots.length, 4032);
  assert.equal(new Set(schedule.slots.map(slot => slot.slot_id)).size, 4032);
  assert.equal(schedule.slots[0].due_at, base.startAt);
  assert.equal(schedule.slots.at(-1).cycle_index, 671);
  assert.equal(Date.parse(schedule.end_at) - Date.parse(schedule.start_at), 1_209_600_000);
});

test("rejects cadence, duration, route order and backfill drift", () => {
  const schedule = createGrantM2OfficialSchedule(base);
  for (const mutate of [
    value => { value.real_window_seconds -= 1; },
    value => { value.backfill_missing_cycles = true; },
    value => { value.slots[1].route_id = "alchemy-solana-devnet"; },
    value => { value.slots[6].due_at = value.slots[5].due_at; },
  ]) {
    const changed = structuredClone(schedule);
    mutate(changed);
    assert.throws(() => validateGrantM2OfficialSchedule(changed, quota));
  }
});

test("creates authorization without claiming that the official window started", () => {
  const run = createGrantM2OfficialRun(base);
  assert.deepEqual(validateGrantM2OfficialRun(run, quota), {
    status: "PASS",
    gate: "GRANT_M2_OFFICIAL_RUN_AUTHORIZED_NOT_STARTED",
    plannedUnits: 4032,
    officialWindowStarted: false,
  });
  assert.equal(run.authorization.starts_official_fourteen_day_window, true);
  assert.equal(run.official_window_started, false);
  assert.equal(run.milestone_2_started, false);
});

test("rejects paraphrased authorization, stale preflight and insufficient lead time", () => {
  assert.throws(() => createGrantM2OfficialRun({ ...base, authorizationText: "continue" }), /authorization/u);
  assert.throws(() => createGrantM2OfficialRun({ ...base, preflightCapturedAt: "2026-09-14T01:00:00.000Z" }), /stale/u);
  assert.throws(() => createGrantM2OfficialRun({ ...base, startAt: "2026-09-14T02:06:00.000Z" }), /lead time/u);
  assert.throws(() => createGrantM2OfficialRun({ ...base, startAt: "2026-09-14T03:10:00.000Z" }), /stale/u);
  assert.throws(() => createGrantM2OfficialRun({ ...base, observerInitialSequences: { "observer-aws-a": 100 } }), /sequences/u);
});

test("rejects relabeling authorization as a completed start", () => {
  const run = createGrantM2OfficialRun(base);
  run.official_window_started = true;
  run.milestone_2_started = true;
  assert.throws(() => validateGrantM2OfficialRun(run, quota), /contract is invalid/u);
});
