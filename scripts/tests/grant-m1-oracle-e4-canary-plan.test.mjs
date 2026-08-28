import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM1OracleE4CanaryPlan } from "../lib/grant-m1-oracle-e4-canary-plan.mjs";

const canonicalPlan = JSON.parse(await readFile("deploy/grant-pilot/oracle-e4-collector-canary-plan.json", "utf8"));

test("accepts the bounded provisioned but unadmitted Oracle E4 Collector canary", () => {
  const result = validateGrantM1OracleE4CanaryPlan(structuredClone(canonicalPlan));
  assert.equal(result.status, "PASS");
  assert.equal(result.provisioned, true);
  assert.equal(result.admitted, false);
  assert.ok(result.estimatedComputeMonthlyBrl < result.maximumConsoleEstimateMonthlyBrl);
});

test("rejects repository-side billing authorization or fake admission", () => {
  const billing = structuredClone(canonicalPlan);
  billing.billing_authorized_by_repository = true;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(billing), /cannot authorize/u);

  const admitted = structuredClone(canonicalPlan);
  admitted.candidate.admitted = true;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(admitted), /without claiming admission/u);
});

test("rejects cost or resource drift", () => {
  const cost = structuredClone(canonicalPlan);
  cost.pricing_snapshot.estimated_compute_monthly_brl = 1;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(cost), /estimate is inconsistent/u);

  const memory = structuredClone(canonicalPlan);
  memory.candidate.memory_gib = 2;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(memory), /resources drifted/u);
});

test("rejects premature readiness or weakened methodology", () => {
  const ready = structuredClone(canonicalPlan);
  ready.admission_gates.canary_soak_passed = true;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(ready), /must remain false/u);

  const boundary = structuredClone(canonicalPlan);
  boundary.methodology_boundaries.observer_independence_effect = "ESTABLISHED";
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(boundary), /methodology boundary/u);
});

test("requires the observed full-VM recovery evidence", () => {
  const reboot = structuredClone(canonicalPlan);
  reboot.admission_gates.full_vm_restart_recovery_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(reboot), /must remain true/u);

  const aggregate = structuredClone(canonicalPlan);
  aggregate.admission_gates.restart_recovery_passed = false;
  assert.throws(() => validateGrantM1OracleE4CanaryPlan(aggregate), /must remain true/u);
});
