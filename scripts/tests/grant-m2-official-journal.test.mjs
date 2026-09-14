import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";
import { createGrantM2OfficialRun, GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "../lib/grant-m2-official-run.mjs";
import {
  appendGrantM2OfficialEvent,
  decideGrantM2OfficialDueSlots,
  initializeGrantM2OfficialJournal,
  loadGrantM2OfficialJournal,
} from "../lib/grant-m2-official-journal.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const run = createGrantM2OfficialRun({
  runId: "m2-official-journal-test",
  startAt: "2026-09-14T03:10:00.000Z",
  authorizedAt: "2026-09-14T03:05:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT,
  preflightCapturedAt: "2026-09-14T03:04:00.000Z",
  preflightSha256: "a".repeat(64),
  precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit: "b".repeat(40),
  observerInitialSequences: { "observer-aws-a": 100, "observer-google-e2-micro": 200, "observer-oracle-a1": 300 },
  quota,
});

async function directory() { return mkdtemp(join(tmpdir(), "grant-m2-official-journal-")); }

test("starts once and deterministically classifies due versus missing slots", async () => {
  const root = await directory();
  await initializeGrantM2OfficialJournal({ directory: root, run, quota });
  let state = await appendGrantM2OfficialEvent({ directory: root, run, quota, event: {
    event: "WINDOW_STARTED",
    recorded_at: run.schedule.start_at,
    run_id: run.run_id,
    preflight_sha256: run.authorization.preflight_sha256,
    official_window_started: true,
    milestone_2_started: true,
  } });
  assert.equal(state.started, true);
  assert.equal(state.accountedUnits, 0);
  const withinTolerance = new Date(Date.parse(run.schedule.start_at) + 120_000).toISOString();
  assert.deepEqual(decideGrantM2OfficialDueSlots({ run, records: state.records, nowAt: withinTolerance }).slice(0, 2).map(item => item.decision), ["DUE", "DUE"]);
  const late = new Date(Date.parse(run.schedule.start_at) + 120_001).toISOString();
  assert.equal(decideGrantM2OfficialDueSlots({ run, records: state.records, nowAt: late })[0].decision, "MISSING");
  await assert.rejects(() => appendGrantM2OfficialEvent({ directory: root, run, quota, event: state.records[0] }));
});

test("records a missing slot without backfill and never records it twice", async () => {
  const root = await directory();
  await initializeGrantM2OfficialJournal({ directory: root, run, quota });
  await appendGrantM2OfficialEvent({ directory: root, run, quota, event: {
    event: "WINDOW_STARTED", recorded_at: run.schedule.start_at, run_id: run.run_id,
    preflight_sha256: run.authorization.preflight_sha256, official_window_started: true, milestone_2_started: true,
  } });
  const slot = run.schedule.slots[0];
  const missing = {
    event: "SLOT_TERMINAL",
    recorded_at: new Date(Date.parse(slot.due_at) + 120_001).toISOString(),
    slot_id: slot.slot_id,
    cycle_index: slot.cycle_index,
    observer_id: slot.observer_id,
    route_id: slot.route_id,
    terminal_status: "MISSING",
    qualifying_units: 0,
    result_id: null,
    reason: "MISSED_WITHOUT_BACKFILL",
  };
  const state = await appendGrantM2OfficialEvent({ directory: root, run, quota, event: missing });
  assert.equal(state.counts.MISSING, 1);
  await assert.rejects(() => appendGrantM2OfficialEvent({ directory: root, run, quota, event: missing }), /duplicated/u);
});

test("requires full evidence for a qualifying slot", async () => {
  const root = await directory();
  await initializeGrantM2OfficialJournal({ directory: root, run, quota });
  await appendGrantM2OfficialEvent({ directory: root, run, quota, event: {
    event: "WINDOW_STARTED", recorded_at: run.schedule.start_at, run_id: run.run_id,
    preflight_sha256: run.authorization.preflight_sha256, official_window_started: true, milestone_2_started: true,
  } });
  const slot = run.schedule.slots[0];
  const base = {
    event: "SLOT_TERMINAL", recorded_at: new Date(Date.parse(slot.due_at) + 1).toISOString(), slot_id: slot.slot_id,
    cycle_index: slot.cycle_index, observer_id: slot.observer_id, route_id: slot.route_id,
    terminal_status: "QUALIFYING", qualifying_units: 1, result_id: "result-1", signature: "1".repeat(88),
    observation_terminal_state: "FINALIZED",
    raw_sha256: "a".repeat(64), signed_result_sha256: "b".repeat(64), delivery_receipt_sha256: "c".repeat(64),
    collector_record_sha256: "d".repeat(64),
    collector_status: "ACCEPTED", raw_to_derived_recomputed: true, observer_signature_verified: true, collector_receipt_bound: true,
  };
  const state = await appendGrantM2OfficialEvent({ directory: root, run, quota, event: base });
  assert.equal(state.counts.QUALIFYING, 1);
  const root2 = await directory();
  await initializeGrantM2OfficialJournal({ directory: root2, run, quota });
  await appendGrantM2OfficialEvent({ directory: root2, run, quota, event: {
    event: "WINDOW_STARTED", recorded_at: run.schedule.start_at, run_id: run.run_id,
    preflight_sha256: run.authorization.preflight_sha256, official_window_started: true, milestone_2_started: true,
  } });
  await assert.rejects(() => appendGrantM2OfficialEvent({ directory: root2, run, quota, event: { ...base, collector_receipt_bound: false } }), /semantic evidence/u);
  const root3 = await directory();
  await initializeGrantM2OfficialJournal({ directory: root3, run, quota });
  await appendGrantM2OfficialEvent({ directory: root3, run, quota, event: {
    event: "WINDOW_STARTED", recorded_at: run.schedule.start_at, run_id: run.run_id,
    preflight_sha256: run.authorization.preflight_sha256, official_window_started: true, milestone_2_started: true,
  } });
  await assert.rejects(() => appendGrantM2OfficialEvent({ directory: root3, run, quota, event: { ...base, collector_status: "DUPLICATE" } }), /semantic evidence/u);
});

test("fails closed on a partial or noncanonical journal event", async () => {
  const root = await directory();
  await initializeGrantM2OfficialJournal({ directory: root, run, quota });
  await writeFile(join(root, "events", "event-000000.json"), "{\"partial\":true}", "utf8");
  await assert.rejects(() => loadGrantM2OfficialJournal({ directory: root, run, quota }), /partial/u);
});
