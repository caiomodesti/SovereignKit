import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { evaluateGrantM2Alerts, validateGrantM2AlertPolicy } from "../lib/grant-m2-alert-policy.mjs";

const policy = JSON.parse(await readFile("deploy/grant-pilot/m2-alert-policy.json", "utf8"));
const healthy = {
  sampled_at: "2026-09-10T01:30:00.000Z",
  disk_free_bytes: 10 * 1024 ** 3,
  clock_offset_ms: 10,
  service_active: true,
  ready: true,
  consecutive_service_or_readiness_failures: 0,
  delivery_backlog_count: 0,
  oldest_delivery_age_seconds: 0,
  rpc_quota_remaining_percent: 100,
  consecutive_http_429: 0
};

test("validates a frozen policy without claiming delivery", () => {
  assert.deepEqual(validateGrantM2AlertPolicy(structuredClone(policy)), { status: "PASS", gate: "GRANT_M2_ALERT_POLICY", deliveryProven: false, responderAssigned: false, milestone2Started: false });
});

test("emits no alert for a healthy sample", () => {
  const result = evaluateGrantM2Alerts(policy, healthy);
  assert.equal(result.highest_severity, "NONE");
  assert.equal(result.notification_attempted, false);
});

test("evaluates warning and critical boundaries deterministically", () => {
  const warning = structuredClone(healthy);
  warning.disk_free_bytes = 5 * 1024 ** 3 - 1;
  warning.clock_offset_ms = 1001;
  warning.delivery_backlog_count = 12;
  warning.rpc_quota_remaining_percent = 20;
  const warningResult = evaluateGrantM2Alerts(policy, warning);
  assert.equal(warningResult.highest_severity, "WARNING");
  assert.deepEqual(warningResult.alerts.map(item => item.signal), ["DISK_FREE", "CLOCK_DRIFT", "DELIVERY_BACKLOG", "RPC_QUOTA"]);

  const critical = structuredClone(healthy);
  critical.disk_free_bytes = 2 * 1024 ** 3 - 1;
  critical.clock_offset_ms = 5001;
  critical.service_active = false;
  critical.consecutive_service_or_readiness_failures = 2;
  critical.oldest_delivery_age_seconds = 3601;
  critical.consecutive_http_429 = 3;
  const criticalResult = evaluateGrantM2Alerts(policy, critical);
  assert.equal(criticalResult.highest_severity, "CRITICAL");
  assert.equal(criticalResult.append_incident_required, true);
  assert.equal(criticalResult.alerts.length, 5);
});

test("rejects relaxed thresholds or invented notification proof", () => {
  const relaxed = structuredClone(policy);
  relaxed.thresholds.clock_absolute_offset_ms.critical_above = 60000;
  assert.throws(() => validateGrantM2AlertPolicy(relaxed), /thresholds/u);
  const invented = structuredClone(policy);
  invented.delivery.notification_delivery_proven = true;
  assert.throws(() => validateGrantM2AlertPolicy(invented), /must not invent/u);
});

test("rejects automatic reset, deletion, or pilot activation", () => {
  for (const mutate of [
    value => { value.actions.automatic_window_reset = true; },
    value => { value.actions.automatic_evidence_deletion = true; },
    value => { value.milestone_2_started = true; }
  ]) {
    const changed = structuredClone(policy);
    mutate(changed);
    assert.throws(() => validateGrantM2AlertPolicy(changed), /weaken evidence|start the pilot/u);
  }
});
