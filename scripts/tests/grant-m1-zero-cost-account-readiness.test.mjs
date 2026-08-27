import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateGrantM1ZeroCostAccountReadiness } from "../lib/grant-m1-zero-cost-account-readiness.mjs";

const example = JSON.parse(await readFile("deploy/grant-pilot/zero-cost-account-readiness.example.json", "utf8"));

test("example is secret-free, valid, and deliberately blocked", () => {
  const result = evaluateGrantM1ZeroCostAccountReadiness(example);
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.ok(result.blockers.length > 0);
});

test("complete attestations open only the zero-cost provisioning gate", () => {
  const ready = structuredClone(example);
  ready.provider_accounts.forEach(provider => {
    provider.account_owner_verified = true;
    provider.mfa_enabled = true;
    provider.offer_terms_reviewed = true;
    provider.candidate_offer_visible = true;
    provider.billing_guard_active = true;
    provider.expiration_exit_control_recorded = true;
  });
  ready.collector_hostname_plan = {
    controlled_by_operator: true,
    conventional_dns: true,
    value: "collector.example.invalid",
  };
  ready.host_key_custody_acknowledged = true;
  ready.free_price_is_not_independence_acknowledged = true;
  ready.provisioning_approved = true;
  ready.provisioning_approved_at = "2026-08-27T03:30:00.000Z";

  assert.deepEqual(evaluateGrantM1ZeroCostAccountReadiness(ready), {
    ready: true,
    status: "READY_FOR_ZERO_COST_PROVISIONING",
    blockers: [],
  });
});

test("rejects provider drift, spend authorization, and sensitive fields", () => {
  const provider = structuredClone(example);
  provider.provider_accounts[0].provider_id = "other";
  assert.throws(() => evaluateGrantM1ZeroCostAccountReadiness(provider), /AWS, Google Cloud, and Oracle/u);

  const spend = structuredClone(example);
  spend.cash_spend_authorized = true;
  assert.throws(() => evaluateGrantM1ZeroCostAccountReadiness(spend), /cannot authorize cash spend/u);

  const sensitive = structuredClone(example);
  sensitive.provider_accounts[0].recovery_code = "do-not-store";
  assert.throws(() => evaluateGrantM1ZeroCostAccountReadiness(sensitive), /sensitive field/u);
});

test("rejects invalid hostname and noncanonical approval time", () => {
  const hostname = structuredClone(example);
  hostname.collector_hostname_plan.value = "not a hostname";
  assert.throws(() => evaluateGrantM1ZeroCostAccountReadiness(hostname), /valid hostname/u);

  const time = structuredClone(example);
  time.provisioning_approved = true;
  time.provisioning_approved_at = "tomorrow";
  const result = evaluateGrantM1ZeroCostAccountReadiness(time);
  assert.ok(result.blockers.includes("explicit zero-cost provisioning approval with timestamp"));
});
