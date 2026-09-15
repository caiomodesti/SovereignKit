import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createBackupManifest, createDailySummary, validateIncidentLog, validateRehearsalTransactionLedger, validateResourceRevalidation } from "../lib/grant-m2-operational-controls.mjs";
import { validateGrantM2OfficialPreflight } from "../lib/grant-m2-official-preflight.mjs";

const collectorText = [
  JSON.stringify({ collector_sequence: 0, result: { result_id: "result-a" } }),
  JSON.stringify({ collector_sequence: 1, result: { result_id: "result-b" } }),
].join("\n") + "\n";
const ledgerText = [
  JSON.stringify({ unit_id: "unit-a", observer_id: "observer-a", route_id: "route-a", status: "QUALIFYING", result_id: "result-a" }),
  JSON.stringify({ unit_id: "unit-b", observer_id: "observer-b", route_id: "route-a", status: "QUALIFYING", result_id: "result-b" }),
  JSON.stringify({ unit_id: "unit-c", observer_id: "observer-c", route_id: "route-b", status: "MISSING", result_id: null }),
  JSON.stringify({ unit_id: "unit-d", observer_id: "observer-c", route_id: "route-a", status: "REJECTED", result_id: null }),
].join("\n") + "\n";

test("proves byte-identical backup restoration without claiming a separate location", () => {
  const bytes = Buffer.from(collectorText);
  const manifest = createBackupManifest({ sourceBytes: bytes, backupBytes: Buffer.from(bytes), capturedAt: "2026-09-10T01:00:00.000Z", sourceLabel: "collector-primary", destinationLabel: "rehearsal-backup" });
  assert.equal(manifest.byte_identical_restore, true);
  assert.equal(manifest.separate_location_proven, false);
  assert.equal(manifest.record_count, 2);
  assert.equal(manifest.source_sha256, manifest.restored_sha256);
});

test("rejects corrupted restore bytes and partial JSONL", () => {
  const bytes = Buffer.from(collectorText);
  assert.throws(() => createBackupManifest({ sourceBytes: bytes, backupBytes: Buffer.from(`${collectorText} `), capturedAt: "2026-09-10T01:00:00.000Z", sourceLabel: "collector-primary", destinationLabel: "rehearsal-backup" }), /do not match/u);
  assert.throws(() => createBackupManifest({ sourceBytes: Buffer.from(collectorText.trimEnd()), backupBytes: Buffer.from(collectorText.trimEnd()), capturedAt: "2026-09-10T01:00:00.000Z", sourceLabel: "collector-primary", destinationLabel: "rehearsal-backup" }), /partial trailing/u);
});

test("reconciles daily counts with every Collector result", () => {
  const summary = createDailySummary({ ledgerText, collectorText, dayIndex: 0, windowId: "rehearsal-001", generatedAt: "2026-09-10T01:00:00.000Z" });
  assert.deepEqual(summary.counts, { QUALIFYING: 2, REJECTED: 1, MISSING: 1, INVALID: 0 });
  assert.equal(summary.total_expected_units, 4);
  assert.equal(summary.collector_records, 2);
});

test("rejects hidden Collector results, duplicate units, and false result claims", () => {
  assert.throws(() => createDailySummary({ ledgerText: ledgerText.split("\n")[0] + "\n", collectorText, dayIndex: 0, windowId: "rehearsal-001", generatedAt: "2026-09-10T01:00:00.000Z" }), /absent from the cycle ledger/u);
  const duplicate = `${ledgerText}${ledgerText.split("\n")[0]}\n`;
  assert.throws(() => createDailySummary({ ledgerText: duplicate, collectorText, dayIndex: 0, windowId: "rehearsal-001", generatedAt: "2026-09-10T01:00:00.000Z" }), /unit or status/u);
  const falseClaim = `${JSON.stringify({ unit_id: "unit-x", observer_id: "observer-a", route_id: "route-a", status: "MISSING", result_id: "result-a" })}\n`;
  assert.throws(() => createDailySummary({ ledgerText: falseClaim, collectorText: "", dayIndex: 0, windowId: "rehearsal-001", generatedAt: "2026-09-10T01:00:00.000Z" }), /must not claim/u);
});

test("retains an all-missing day when the Collector log is empty", () => {
  const missing = `${JSON.stringify({ unit_id: "unit-missing", observer_id: "observer-a", route_id: "route-a", status: "MISSING", result_id: null })}\n`;
  const summary = createDailySummary({ ledgerText: missing, collectorText: "", dayIndex: 1, windowId: "rehearsal-001", generatedAt: "2026-09-11T01:00:00.000Z" });
  assert.equal(summary.counts.MISSING, 1);
  assert.equal(summary.counts.QUALIFYING, 0);
  assert.equal(summary.collector_records, 0);
});

test("validates an append-only incident sequence and rejects weakened records", () => {
  const incident = `${JSON.stringify({ schema_version: "GrantM2IncidentLog@0.1.0", sequence: 0, incident_id: "incident-0001", opened_at: "2026-09-10T01:00:00.000Z", status: "OPEN", component: "ROUTE", summary: "RPC route returned HTTP 429", raw_evidence_preserved: true, automatic_window_reset: false })}\n`;
  assert.equal(validateIncidentLog(incident).records, 1);
  const weakened = incident.replace('"raw_evidence_preserved":true', '"raw_evidence_preserved":false');
  assert.throws(() => validateIncidentLog(weakened), /weakens preservation rules/u);
});

test("retains the official transport incident as acceptance-blocking evidence", async () => {
  const incident = await readFile("fixtures/grant-m2/official-incidents-20260914.jsonl", "utf8");
  assert.equal(validateIncidentLog(incident).records, 1);
  const record = JSON.parse(incident.trim());
  assert.equal(record.status, "ACCEPTANCE_BLOCKING");
  assert.equal(record.raw_evidence_preserved, true);
  assert.equal(record.automatic_window_reset, false);
});

test("records the corrected three-observer transport probe without changing official state", async () => {
  const probeBytes = await readFile("fixtures/grant-m2/official-transport-probe-20260914.json");
  const probe = JSON.parse(probeBytes.toString("utf8"));
  const state = JSON.parse(await readFile("fixtures/grant-m2/official-transport-probe-state-20260914.json", "utf8"));
  assert.equal(createHash("sha256").update(probeBytes).digest("hex"), state.probe_evidence_sha256);
  assert.equal(probe.status, "PASS");
  assert.equal(probe.observers.length, 3);
  assert.deepEqual(probe.observers.map(observer => observer.observer_id).sort(), ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"]);
  assert.ok(probe.observers.every(observer => observer.status === "PASS" && observer.transaction_submitted === false && observer.worker_started === false && /^[a-f0-9]{64}$/u.test(observer.receipt_sha256)));
  assert.equal(probe.transactions_submitted, 0);
  assert.equal(probe.workers_started, 0);
  assert.equal(probe.official_window_started, false);
  assert.equal(state.probe_id, probe.probe_id);
  assert.equal(state.source_commit, probe.source_commit);
  assert.equal(state.official_state_files_before, state.official_state_files_after);
  assert.equal(state.official_state_aggregate_sha256_before, state.official_state_aggregate_sha256_after);
  assert.equal(state.claim_boundaries.transport_path_proven, true);
  assert.equal(state.claim_boundaries.immediate_preflight_passed, false);
  assert.equal(state.claim_boundaries.replacement_window_authorized, false);
});

test("retains post-upgrade backups, monitor recovery and a non-starting transport proof", async () => {
  const upgrades = JSON.parse(await readFile("fixtures/grant-m2/official-host-upgrades-20260914.json", "utf8"));
  const probe = JSON.parse(await readFile("fixtures/grant-m2/official-transport-probe-post-upgrade-20260914.json", "utf8"));
  const state = JSON.parse(await readFile("fixtures/grant-m2/official-post-upgrade-state-20260914.json", "utf8"));
  const ids = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
  assert.equal(upgrades.status, "UPGRADED_THREE_HOSTS_MONITORS_REACTIVATED");
  assert.deepEqual(upgrades.observers.map(observer => observer.observer_id), ids);
  assert.ok(upgrades.observers.every(observer => observer.backup_root.endsWith(upgrades.previous_source_commit) && observer.qualified_observer_active === true && observer.monitor_timer_active === true && observer.monitor_timer_enabled === true && observer.worker_instances === 0 && /^[a-f0-9]{64}$/u.test(observer.upgrade_evidence_sha256)));
  assert.equal(probe.status, "PASS");
  assert.deepEqual(probe.observers.map(observer => observer.observer_id), ids);
  assert.ok(probe.observers.every(observer => observer.status === "PASS" && observer.transaction_submitted === false && observer.worker_started === false && /^[a-f0-9]{64}$/u.test(observer.receipt_sha256)));
  assert.equal(probe.transactions_submitted, 0);
  assert.equal(probe.workers_started, 0);
  assert.equal(probe.official_window_started, false);
  assert.equal(state.transport_probe_id, probe.probe_id);
  assert.equal(state.source_commit, upgrades.source_commit);
  assert.equal(state.remote_probe_file_copy_verified, false);
  assert.equal(state.official_state_files_before, state.official_state_files_after);
  assert.equal(state.official_state_aggregate_sha256_before, state.official_state_aggregate_sha256_after);
  assert.equal(state.immediate_preflight_passed, false);
  assert.equal(state.replacement_window_authorized, false);
  assert.equal(state.milestone_2_complete, false);
});

test("retains the coordinator backup and the passed non-starting replacement preflight", async () => {
  const swap = JSON.parse(await readFile("fixtures/grant-m2/official-coordinator-swap-20260914.json", "utf8"));
  const probeBytes = await readFile("fixtures/grant-m2/official-transport-probe-preflight-20260915.json");
  const probe = JSON.parse(probeBytes.toString("utf8"));
  const preflight = JSON.parse(await readFile("fixtures/grant-m2/official-preflight-20260915.json", "utf8"));
  const checked = validateGrantM2OfficialPreflight(preflight, swap.source_commit);
  assert.equal(swap.backup_present, true);
  assert.equal(swap.runtime_manifest_verified, true);
  assert.equal(swap.backup_manifest_verified, true);
  assert.equal(swap.service_active, false);
  assert.equal(swap.service_enabled, false);
  assert.equal(swap.official_state_files, 487);
  assert.equal(probe.probe_id, preflight.transport_probe.probe_id);
  assert.deepEqual(probe, preflight.transport_probe);
  assert.equal(createHash("sha256").update(probeBytes).digest("hex"), "5c274fbf084990cd0a7c6a4229f8c2ee69dd237a11da380ae2362fbc85c112da");
  assert.equal(checked.sha256, "edd031001adea725658e0fe80dae19fcecf2e7b89fe1f347ce0128d37f6df15c");
  assert.equal(checked.officialWindowStarted, false);
  assert.equal(preflight.resources.alchemy_remaining_compute_units, 29_995_070);
  assert.equal(preflight.worker_instances_started, 0);
  assert.equal(preflight.official_window_started, false);
});

test("requires exact rehearsal accounting without relabeling an unobserved transaction", () => {
  const rows = Array.from({ length: 12 }, (_, sequence) => ({ schema_version: "GrantM2RehearsalTransactionLedger@0.1.0", sequence, submitted_at: `2026-09-12T01:${String(sequence).padStart(2, "0")}:00.000Z`, source_run: "live-test", slot_id: sequence.toString(16).padStart(64, "0"), assignment_id: `assignment-${sequence}`, signature: `signature-${sequence}`, observer_id: ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"][sequence % 3], route_id: sequence % 2 ? "solana-public-devnet" : "alchemy-solana-devnet", terminal_status: sequence === 0 ? "ACKNOWLEDGED_UNOBSERVED" : "FINALIZED", qualifying_units: 0, official_window_started: false }));
  const text = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  assert.equal(validateRehearsalTransactionLedger(text).finalized, 11);
  assert.throws(() => validateRehearsalTransactionLedger(text.replace("ACKNOWLEDGED_UNOBSERVED", "FINALIZED")), /terminal accounting/u);
});

test("recomputes authenticated quota, host floors and Devnet fee capacity", async () => {
  const record = JSON.parse(await readFile("fixtures/grant-m2/resource-revalidation-20260912.json", "utf8"));
  const result = validateResourceRevalidation(record);
  assert.equal(result.alchemyRemainingComputeUnits, 29_996_270);
  assert.equal(result.remainingAfterFrozenUpperComputeUnits, 24_141_806);
  assert.equal(result.minimumHostMemoryAvailableKb, 577_804);
  assert.equal(result.projectedRemainingLamports, 70_735_000);
  assert.equal(result.officialWindowStarted, false);

  const drift = structuredClone(record);
  drift.alchemy_account_quota.remaining_compute_units += 1;
  assert.throws(() => validateResourceRevalidation(drift), /quota evidence/u);
  const weakHost = structuredClone(record);
  weakHost.hosts["observer-google-e2-micro"].memory_available_kb = 524_287;
  assert.throws(() => validateResourceRevalidation(weakHost), /resource floor/u);
});
