import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { evaluateGrantM1OperatorReadiness } from "../lib/grant-m1-operator-readiness.mjs";

const example = JSON.parse(await readFile("deploy/grant-pilot/operator-readiness.example.json", "utf8"));

test("example is valid and deliberately blocked", () => {
  const result = evaluateGrantM1OperatorReadiness(example);
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.ok(result.blockers.length > 0);
});

test("complete operator attestations open the provisioning gate", () => {
  const ready = structuredClone(example);
  ready.billing_approved = true;
  ready.billing_approved_at = "2026-08-27T03:00:00.000Z";
  ready.provider_accounts.forEach(provider => {
    provider.account_owner_verified = true;
    provider.mfa_enabled = true;
    provider.billing_method_verified = true;
    provider.budget_alert_enabled = true;
  });
  ready.collector_hostname = {
    controlled_by_operator: true,
    dns_ready: true,
    value: "collector.example.invalid"
  };
  ready.host_key_custody_acknowledged = true;
  ready.provisioning_approved = true;
  ready.provisioning_approved_at = "2026-08-27T03:01:00.000Z";

  assert.deepEqual(evaluateGrantM1OperatorReadiness(ready), {
    ready: true,
    status: "READY_TO_PROVISION",
    blockers: []
  });
});

test("rejects provider drift, ceiling drift, and sensitive fields", () => {
  const providerDrift = structuredClone(example);
  providerDrift.provider_accounts[0].provider_id = "other";
  assert.throws(() => evaluateGrantM1OperatorReadiness(providerDrift), /AWS, DigitalOcean, and Hetzner/u);

  const ceilingDrift = structuredClone(example);
  ceilingDrift.monthly_ceiling_usd = 100;
  assert.throws(() => evaluateGrantM1OperatorReadiness(ceilingDrift), /USD 50/u);

  const secret = structuredClone(example);
  secret.provider_accounts[0].api_token = "do-not-store";
  assert.throws(() => evaluateGrantM1OperatorReadiness(secret), /sensitive field/u);
});
