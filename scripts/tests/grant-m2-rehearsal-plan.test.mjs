import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateGrantM2RehearsalPlan } from "../lib/grant-m2-rehearsal-plan.mjs";

const plan = JSON.parse(await readFile("deploy/grant-pilot/m2-rehearsal-plan.json", "utf8"));
const artifacts = new Map();
for (const binding of Object.values(plan.bindings)) artifacts.set(binding.path, await readFile(binding.path, "utf8"));

test("accepts a blocked one-hour twelve-unit rehearsal plan", () => {
  assert.deepEqual(validateGrantM2RehearsalPlan(structuredClone(plan), artifacts), { status: "PASS", gate: "GRANT_M2_REHEARSAL_PLAN", durationSeconds: 3600, expectedUnits: 12, blockers: 2, rehearsalAuthorized: false, milestone2Started: false });
});

test("rejects binding drift, shortened duration, or missing units", () => {
  const drift = new Map(artifacts);
  drift.set(plan.bindings.alert_policy.path, `${drift.get(plan.bindings.alert_policy.path)} `);
  assert.throws(() => validateGrantM2RehearsalPlan(structuredClone(plan), drift), /binding hash/u);
  const short = structuredClone(plan); short.schedule.duration_seconds = 3599;
  assert.throws(() => validateGrantM2RehearsalPlan(short, artifacts), /schedule or arithmetic/u);
  const missing = structuredClone(plan); missing.schedule.expected_units = 11;
  assert.throws(() => validateGrantM2RehearsalPlan(missing, artifacts), /schedule or arithmetic/u);
});

test("rejects weaker evidence or acceptance criteria", () => {
  const evidence = structuredClone(plan); evidence.required_evidence.pop();
  assert.throws(() => validateGrantM2RehearsalPlan(evidence, artifacts), /evidence inventory/u);
  const duplicates = structuredClone(plan); duplicates.pass_criteria.duplicate_kpi_units = 1;
  assert.throws(() => validateGrantM2RehearsalPlan(duplicates, artifacts), /pass criteria/u);
  const localBackup = structuredClone(plan); localBackup.pass_criteria.backup_location_separate = false;
  assert.throws(() => validateGrantM2RehearsalPlan(localBackup, artifacts), /pass criteria/u);
  const independent = new Map(artifacts);
  independent.set(plan.bindings.reader_deployment_evidence.path, `${independent.get(plan.bindings.reader_deployment_evidence.path)} `);
  assert.throws(() => validateGrantM2RehearsalPlan(structuredClone(plan), independent), /binding hash/u);
});

test("rejects altered configuration, authorization, or M2 activation", () => {
  const configured = structuredClone(plan); configured.external_requirements.notification_destination = "UNVERIFIED";
  assert.throws(() => validateGrantM2RehearsalPlan(configured, artifacts), /external readiness record/u);
  const authorized = structuredClone(plan); authorized.authorization.rehearsal_authorized = true;
  assert.throws(() => validateGrantM2RehearsalPlan(authorized, artifacts), /cannot authorize/u);
  const started = structuredClone(plan); started.milestone_2_started = true;
  assert.throws(() => validateGrantM2RehearsalPlan(started, artifacts), /cannot authorize/u);
});
