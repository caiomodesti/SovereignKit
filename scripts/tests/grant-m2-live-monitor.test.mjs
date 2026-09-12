import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { decideGrantM2LiveMonitorNotification, evaluateGrantM2LiveMonitor, formatGrantM2LiveMonitorMessage, validateGrantM2LiveMonitorPolicy } from '../lib/grant-m2-live-monitor.mjs';

const policy = JSON.parse(await readFile('deploy/grant-pilot/m2-live-monitor-policy.json', 'utf8'));
const baseline = await readFile(policy.baseline_alert_policy.path, 'utf8');
const healthy = { sampled_at: '2026-09-12T04:10:00.000Z', observer_id: 'observer-google-e2-micro', memory_available_bytes: 600 * 1024 ** 2, disk_free_bytes: 10 * 1024 ** 3, clock_absolute_offset_ms: 10, service_active: true, ntp_synchronized: true, consecutive_service_or_ntp_failures: 0, delivery_backlog_count: 0, oldest_delivery_age_seconds: 0, local_rpc_quota_remaining_percent: 100 };

test('binds the live monitor to the frozen alert baseline without activating M2', () => {
  assert.equal(validateGrantM2LiveMonitorPolicy(policy, baseline).officialWindowStarted, false);
  assert.throws(() => validateGrantM2LiveMonitorPolicy({ ...policy, baseline_alert_policy: { ...policy.baseline_alert_policy, sha256: '0'.repeat(64) } }, baseline), /hash mismatch/u);
});

test('detects Google memory headroom and critical service failures', () => {
  assert.equal(evaluateGrantM2LiveMonitor(policy, healthy).highest_severity, 'NONE');
  const warning = evaluateGrantM2LiveMonitor(policy, { ...healthy, memory_available_bytes: 511 * 1024 ** 2 });
  assert.deepEqual(warning.alerts.map(alert => alert.signal), ['MEMORY_AVAILABLE']);
  const critical = evaluateGrantM2LiveMonitor(policy, { ...healthy, service_active: false, consecutive_service_or_ntp_failures: 2 });
  assert.equal(critical.highest_severity, 'CRITICAL');
  assert.match(formatGrantM2LiveMonitorMessage(critical, 'ALERT'), /Ação manual necessária/u);
});

test('sends transitions, bounded reminders and recovery only', () => {
  const first = evaluateGrantM2LiveMonitor(policy, { ...healthy, memory_available_bytes: 511 * 1024 ** 2 });
  assert.deepEqual(decideGrantM2LiveMonitorNotification(policy, undefined, first), { send: true, kind: 'ALERT' });
  const previous = { ...first, notification_sent_at: first.sampled_at };
  const soon = evaluateGrantM2LiveMonitor(policy, { ...healthy, sampled_at: '2026-09-12T04:11:00.000Z', memory_available_bytes: 510 * 1024 ** 2 });
  assert.deepEqual(decideGrantM2LiveMonitorNotification(policy, previous, soon), { send: false, kind: 'NONE' });
  const later = { ...soon, sampled_at: '2026-09-12T10:10:00.000Z' };
  assert.deepEqual(decideGrantM2LiveMonitorNotification(policy, previous, later), { send: true, kind: 'REMINDER' });
  const recovered = evaluateGrantM2LiveMonitor(policy, { ...healthy, sampled_at: '2026-09-12T04:12:00.000Z' });
  assert.deepEqual(decideGrantM2LiveMonitorNotification(policy, previous, recovered), { send: true, kind: 'RECOVERY' });
  assert.deepEqual(decideGrantM2LiveMonitorNotification(policy, { ...previous, notification_pending: true }, soon), { send: true, kind: 'ALERT' });
});
