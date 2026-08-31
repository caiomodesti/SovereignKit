import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM1OracleE4CanaryPlan } from "../lib/grant-m1-oracle-e4-canary-plan.mjs";

const canonicalPlan = JSON.parse(await readFile("deploy/grant-pilot/oracle-e4-collector-canary-plan.json", "utf8"));

test("accepts the bounded admitted private Oracle E4 Collector", () => {
  const result = validateGrantM1OracleE4CanaryPlan(structuredClone(canonicalPlan));
  assert.equal(result.status, "PASS");
  assert.equal(result.provisioned, true);
  assert.equal(result.admitted, true);
  assert.ok(result.estimatedComputeMonthlyBrl < result.maximumConsoleEstimateMonthlyBrl);
});

test("rejects repository-side billing authorization or admission rollback", () => {
  const billing = structuredClone(canonicalPlan);
  billing.billing_authorized_by_repository = true;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(billing), /cannot authorize/u);

  const unadmitted = structuredClone(canonicalPlan);
  unadmitted.candidate.admitted = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(unadmitted), /must be admitted/u);
});

test("rejects cost or resource drift", () => {
  const cost = structuredClone(canonicalPlan);
  cost.pricing_snapshot.estimated_compute_monthly_brl = 1;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(cost), /estimate is inconsistent/u);

  const memory = structuredClone(canonicalPlan);
  memory.candidate.memory_gib = 2;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(memory), /resources drifted/u);
});

test("rejects missing admission evidence or weakened methodology", () => {
  const soak = structuredClone(canonicalPlan);
  soak.admission_gates.canary_soak_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(soak), /must remain true/u);

  const boundary = structuredClone(canonicalPlan);
  boundary.methodology_boundaries.observer_independence_effect = "ESTABLISHED";
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(boundary), /methodology boundary/u);
});

test("requires the observed versioned preflight and durable replay evidence", () => {
  const preflight = structuredClone(canonicalPlan);
  preflight.admission_gates.versioned_host_preflight_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(preflight), /must remain true/u);

  const replay = structuredClone(canonicalPlan);
  replay.admission_gates.collector_durable_replay_recovery_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(replay), /must remain true/u);
});

test("requires verified full-VM and post-reboot recovery", () => {
  const reboot = structuredClone(canonicalPlan);
  reboot.admission_gates.full_vm_restart_recovery_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(reboot), /must remain true/u);

  const postReboot = structuredClone(canonicalPlan);
  postReboot.admission_gates.post_reboot_versioned_host_preflight_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(postReboot), /must remain true/u);
});
