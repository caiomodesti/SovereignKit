import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createBackupManifest, createDailySummary, validateIncidentLog, validateRehearsalTransactionLedger, validateResourceRevalidation } from "../lib/grant-m2-operational-controls.mjs";

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
