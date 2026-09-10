import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM2PilotReadiness } from "../lib/grant-m2-pilot-readiness.mjs";

const canonical = JSON.parse(await readFile("deploy/grant-pilot/m2-pilot-readiness.json", "utf8"));
const precommitmentContent = await readFile(canonical.freeze_evidence.path, "utf8");

test("accepts a complete preparation contract while keeping M2 blocked", () => {
  const result = validateGrantM2PilotReadiness(structuredClone(canonical), precommitmentContent);
  assert.equal(result.readiness, "BLOCKED_PENDING_EXPLICIT_AUTHORIZATION_AND_EVIDENCE");
  assert.equal(result.blockers, 6);
  assert.equal(result.minimumRealDurationSeconds, 1_209_600);
  assert.equal(result.minimumQualifyingObservations, 3_000);
  assert.equal(result.milestone2Started, false);
});

test("rejects a shortened window or observation target", () => {
  const shortWindow = structuredClone(canonical);
  shortWindow.pilot_contract.minimum_real_duration_seconds -= 1;
  assert.throws(() => validateGrantM2PilotReadiness(shortWindow, precommitmentContent), /immutable pilot contract/u);

  const lowCount = structuredClone(canonical);
  lowCount.pilot_contract.minimum_qualifying_observations = 2_999;
  assert.throws(() => validateGrantM2PilotReadiness(lowCount, precommitmentContent), /immutable pilot contract/u);
});

test("rejects hidden missing data or retroactive rule changes", () => {
  const hidden = structuredClone(canonical);
  hidden.pilot_contract.allow_silent_exclusions = true;
  assert.throws(() => validateGrantM2PilotReadiness(hidden, precommitmentContent), /weakened or incomplete/u);

  const retroactive = structuredClone(canonical);
  retroactive.pilot_contract.allow_retroactive_rule_changes = true;
  assert.throws(() => validateGrantM2PilotReadiness(retroactive, precommitmentContent), /weakened or incomplete/u);
});

test("rejects invented readiness evidence or a hidden blocker", () => {
  const invented = structuredClone(canonical);
  invented.operational_controls.daily_backup_restore = "PROVEN";
  assert.throws(() => validateGrantM2PilotReadiness(invented, precommitmentContent), /must not claim unproven/u);

  const hidden = structuredClone(canonical);
  hidden.blockers.shift();
  assert.throws(() => validateGrantM2PilotReadiness(hidden, precommitmentContent), /complete ordered blocker set/u);
});

test("rejects a pending or unbound freeze", () => {
  const pending = structuredClone(canonical);
  pending.freeze.route_registry = "PENDING";
  assert.throws(() => validateGrantM2PilotReadiness(pending, precommitmentContent), /bind every frozen item/u);

  const unbound = structuredClone(canonical);
  unbound.freeze_evidence.sha256 = "0".repeat(64);
  assert.throws(() => validateGrantM2PilotReadiness(unbound, precommitmentContent), /bind every frozen item/u);
});

test("rejects rehearsal or official-window activation", () => {
  const rehearsal = structuredClone(canonical);
  rehearsal.rehearsal.authorization = "AUTHORIZED";
  assert.throws(() => validateGrantM2PilotReadiness(rehearsal, precommitmentContent), /rehearsal boundary/u);

  const started = structuredClone(canonical);
  started.official_window.authorization = "AUTHORIZED";
  started.official_window.started = true;
  started.official_window.start_timestamp = "2026-09-10T00:00:00.000Z";
  started.milestone_2_started = true;
  assert.throws(() => validateGrantM2PilotReadiness(started, precommitmentContent), /must not start/u);
});
