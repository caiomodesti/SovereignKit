import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateGrantM1ZeroCostPlan } from "../lib/grant-m1-zero-cost-plan.mjs";

const canonicalPlan = JSON.parse(await readFile("deploy/grant-pilot/zero-cost-candidate-plan.json", "utf8"));

test("accepts the researched but wholly unprovisioned zero-cost topology", () => {
  const result = validateGrantM1ZeroCostPlan(structuredClone(canonicalPlan));
  assert.equal(result.observers, 3);
  assert.equal(result.distinctObserverProviders, 3);
  assert.equal(result.admittedComponents, 0);
  assert.equal(result.authorizedMonthlySpendUsd, 0);
});

test("rejects hidden spend or fake provider admission", () => {
  const spend = structuredClone(canonicalPlan);
  spend.cash_spend_authorized = true;
  assert.throws(() => validateGrantM1ZeroCostPlan(spend), /cannot authorize spend/u);

  const fake = structuredClone(canonicalPlan);
  fake.components[1].admitted = true;
  assert.throws(() => validateGrantM1ZeroCostPlan(fake), /cannot claim eligibility/u);
});

test("rejects observer provider overlap and missing canary", () => {
  const overlap = structuredClone(canonicalPlan);
  overlap.components.find(component => component.component_id === "observer-google-e2-micro").provider_id = "aws";
  assert.throws(() => validateGrantM1ZeroCostPlan(overlap), /three distinct providers/u);

  const noCanary = structuredClone(canonicalPlan);
  noCanary.components.find(component => component.component_id === "observer-oracle-a1").required_gates = ["ACCOUNT_ELIGIBILITY_VERIFIED", "BUDGET_GUARD_ACTIVE", "HOST_PREFLIGHT_PASS"];
  assert.throws(() => validateGrantM1ZeroCostPlan(noCanary), /host admission gates/u);
});

test("rejects Oracle allowance drift or hidden Collector coupling", () => {
  const allowance = structuredClone(canonicalPlan);
  allowance.components.find(component => component.component_id === "observer-oracle-a1").resource_target.ocpu = 2;
  assert.throws(() => validateGrantM1ZeroCostPlan(allowance), /aggregate allowance/u);

  const coupling = structuredClone(canonicalPlan);
  coupling.known_failure_coupling = "none";
  assert.throws(() => validateGrantM1ZeroCostPlan(coupling), /coupling must remain explicit/u);
});

test("rejects non-official offer references and insufficient resources", () => {
  const reference = structuredClone(canonicalPlan);
  reference.components[0].offer_reference = "https://example.com/free";
  assert.throws(() => validateGrantM1ZeroCostPlan(reference), /official HTTPS/u);

  const resources = structuredClone(canonicalPlan);
  resources.components[2].resource_target.memory_mib = 512;
  assert.throws(() => validateGrantM1ZeroCostPlan(resources), /below the candidate floor/u);
});
