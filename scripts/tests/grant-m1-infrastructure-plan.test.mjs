import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { validateGrantM1InfrastructurePlan } from "../lib/grant-m1-infrastructure-plan.mjs";

const canonicalPlan = JSON.parse(await readFile("deploy/grant-pilot/infrastructure-plan.json", "utf8"));

test("accepts the frozen three-provider plan without claiming provisioning", () => {
  const result = validateGrantM1InfrastructurePlan(structuredClone(canonicalPlan));
  assert.equal(result.observers, 3);
  assert.equal(result.distinctObserverProviders, 3);
  assert.equal(result.collectors, 1);
  assert.equal(result.provisionedComponents, 0);
  assert.equal(result.estimatedBaseMonthlyUsd, 36.98);
});

test("rejects observer provider overlap", () => {
  const plan = structuredClone(canonicalPlan);
  plan.components.find(component => component.component_id === "observer-digitalocean-nyc3").provider_id = "aws";
  assert.throws(() => validateGrantM1InfrastructurePlan(plan), /not operationally distinct/u);
});

test("rejects repository-side billing authorization or fake provisioning", () => {
  const billing = structuredClone(canonicalPlan);
  billing.billing_authorized = true;
  assert.throws(() => validateGrantM1InfrastructurePlan(billing), /cannot authorize/u);

  const provisioned = structuredClone(canonicalPlan);
  provisioned.components[0].provisioned = true;
  assert.throws(() => validateGrantM1InfrastructurePlan(provisioned), /cannot claim/u);
});

test("rejects a mismatched estimate or hidden Collector coupling", () => {
  const estimate = structuredClone(canonicalPlan);
  estimate.budget.estimated_base_monthly = 1;
  assert.throws(() => validateGrantM1InfrastructurePlan(estimate), /does not match/u);

  const coupling = structuredClone(canonicalPlan);
  coupling.constraints.known_failure_coupling = "none";
  assert.throws(() => validateGrantM1InfrastructurePlan(coupling), /failure coupling/u);
});
