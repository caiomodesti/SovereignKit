import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "../lib/grant-m2-official-run.mjs";
import {
  createGrantM2OfficialReplacementRun,
  GRANT_M2_INTERRUPTED_RUN_ID,
  GRANT_M2_INTERRUPTION_INCIDENT_ID,
  GRANT_M2_INTERRUPTED_STATE_SHA256,
  validateGrantM2OfficialReplacementRun,
} from "../lib/grant-m2-official-replacement.mjs";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "../lib/grant-m2-official-schedule.mjs";

const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const input = {
  runId: "m2-official-replacement-20260915t010000000z",
  startAt: "2026-09-15T01:00:00.000Z",
  authorizedAt: "2026-09-15T00:52:00.000Z",
  authorizationText: GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT,
  preflightCapturedAt: "2026-09-15T00:51:30.000Z",
  preflightSha256: "a".repeat(64),
  precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit: "b".repeat(40),
  observerInitialSequences: { "observer-aws-a": 1, "observer-google-e2-micro": 2, "observer-oracle-a1": 3 },
  quota,
};

test("binds a replacement run to the preserved interrupted window without starting it", () => {
  const run = createGrantM2OfficialReplacementRun(input);
  assert.deepEqual(run.replacement_window, {
    schema_version: "GrantM2OfficialReplacement@0.1.0",
    replaces_run_id: GRANT_M2_INTERRUPTED_RUN_ID,
    incident_id: GRANT_M2_INTERRUPTION_INCIDENT_ID,
    interrupted_state_aggregate_sha256: GRANT_M2_INTERRUPTED_STATE_SHA256,
    original_evidence_preserved: true,
    automatic_window_reset: false,
    explicit_replacement_decision_required: true,
  });
  assert.equal(validateGrantM2OfficialReplacementRun(run, quota).officialWindowStarted, false);
});

test("rejects replacement metadata drift even when the base run remains valid", () => {
  const run = createGrantM2OfficialReplacementRun(input);
  run.replacement_window.automatic_window_reset = true;
  assert.throws(() => validateGrantM2OfficialReplacementRun(run, quota), /replacement-window binding/u);
  assert.throws(() => createGrantM2OfficialReplacementRun({ ...input, runId: "m2-official-not-a-replacement" }), /replacement-window binding/u);
});

test("arm script isolates replacement state and cannot rewrite interrupted evidence", async () => {
  const script = await readFile("scripts/arm-grant-m2-official-replacement-window.sh", "utf8");
  assert.ok(script.includes('replacements_root=$base_state_root/replacements'));
  assert.ok(script.includes('find "$base_state_root" -path "$replacements_root" -prune'));
  assert.match(script, /interrupted evidence state drifted/u);
  assert.ok(script.includes('systemctl is-active --quiet "$service"'));
  assert.ok(script.includes('systemctl is-enabled --quiet "$service"'));
  assert.match(script, /automatic_window_reset!==false/u);
  assert.ok(script.indexOf("check_workers()") < script.indexOf('systemctl enable --now "$service"'));
  assert.match(script, /Date\.parse\(run\.schedule\.start_at\)-Date\.now\(\)<120000/u);
  assert.doesNotMatch(script, /\brm\s+-rf\b/u);
  assert.doesNotMatch(script, /backfill/iu);
});

test("Google memory resilience is bounded, persistent and cannot start an official worker", async () => {
  const script = await readFile("scripts/enable-grant-m2-google-memory-resilience.sh", "utf8");
  assert.match(script, /swap_bytes=2147483648/u);
  assert.match(script, /free_disk -ge 5368709120/u);
  assert.match(script, /fstab_backup/u);
  assert.match(script, /unexpected active swap exists/u);
  assert.match(script, /persistent swap entry exists without active swap/u);
  assert.match(script, /chmod 0600/u);
  assert.ok(script.includes('swapon "$swap_path"'));
  assert.match(script, /official-observation-worker@\*\.service/u);
  assert.doesNotMatch(script, /systemctl start|systemctl enable/u);
  assert.doesNotMatch(script, /\brm\s+-rf\b/u);
});
