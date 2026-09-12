import { createHash } from 'node:crypto';

export const GRANT_M2_LIVE_MONITOR_POLICY_VERSION = 'GrantM2LiveMonitorPolicy@0.1.0';
export const GRANT_M2_LIVE_MONITOR_EVALUATION_VERSION = 'GrantM2LiveMonitorEvaluation@0.1.0';

const OBSERVERS = ['observer-aws-a', 'observer-google-e2-micro', 'observer-oracle-a1'];

export function validateGrantM2LiveMonitorPolicy(policy, baselineContent) {
  if (policy?.schema_version !== GRANT_M2_LIVE_MONITOR_POLICY_VERSION || policy.status !== 'PRESTART_MONITOR_FROZEN_NOT_ACTIVATED' || policy.sample_interval_seconds !== 60) {
    throw Error('M2 live monitor policy version or status is invalid');
  }
  const baseline = policy.baseline_alert_policy ?? {};
  if (baseline.path !== 'deploy/grant-pilot/m2-alert-policy.json' || typeof baselineContent !== 'string' ||
      createHash('sha256').update(baselineContent).digest('hex') !== baseline.sha256) throw Error('M2 live monitor baseline policy hash mismatch');
  const thresholds = policy.thresholds ?? {};
  if (thresholds.memory_available_bytes?.warning_below !== 512 * 1024 ** 2 || thresholds.memory_available_bytes?.critical_below !== 384 * 1024 ** 2 ||
      thresholds.disk_free_bytes?.warning_below !== 5 * 1024 ** 3 || thresholds.disk_free_bytes?.critical_below !== 2 * 1024 ** 3 ||
      thresholds.clock_absolute_offset_ms?.warning_above !== 1000 || thresholds.clock_absolute_offset_ms?.critical_above !== 5000 ||
      thresholds.service_or_ntp?.critical_after_consecutive_failures !== 2 || thresholds.delivery_backlog?.warning_count_at_or_above !== 12 ||
      thresholds.delivery_backlog?.critical_count_at_or_above !== 18 || thresholds.delivery_backlog?.critical_oldest_age_seconds_above !== 3600 ||
      thresholds.local_rpc_quota?.warning_remaining_percent_at_or_below !== 20 || thresholds.local_rpc_quota?.critical_remaining_percent_at_or_below !== 10) {
    throw Error('M2 live monitor thresholds are incomplete or changed');
  }
  if (policy.notification?.destination !== 'telegram-private-operator' || policy.notification?.send_on_state_change !== true ||
      policy.notification?.send_recovery !== true || policy.notification?.critical_reminder_seconds !== 3600 ||
      policy.notification?.warning_reminder_seconds !== 21600 || policy.notification?.contains_credentials !== false) throw Error('M2 live monitor notification policy is invalid');
  if (policy.actions?.automatic_window_reset !== false || policy.actions?.automatic_evidence_deletion !== false ||
      policy.actions?.automatic_threshold_relaxation !== false || policy.actions?.manual_response_required !== true ||
      policy.authorizes_official_window !== false || policy.official_window_started !== false) throw Error('M2 live monitor authorization boundary is invalid');
  return { status: 'PASS', gate: 'GRANT_M2_LIVE_MONITOR_POLICY', sampleIntervalSeconds: 60, memoryWarningBytes: 512 * 1024 ** 2, officialWindowStarted: false };
}

export function evaluateGrantM2LiveMonitor(policy, sample) {
  validateSample(sample);
  const alerts = [];
  const add = (signal, severity, value, threshold) => alerts.push({ signal, severity, value, threshold });
  const t = policy.thresholds;
  if (sample.memory_available_bytes < t.memory_available_bytes.critical_below) add('MEMORY_AVAILABLE', 'CRITICAL', sample.memory_available_bytes, t.memory_available_bytes.critical_below);
  else if (sample.memory_available_bytes < t.memory_available_bytes.warning_below) add('MEMORY_AVAILABLE', 'WARNING', sample.memory_available_bytes, t.memory_available_bytes.warning_below);
  if (sample.disk_free_bytes < t.disk_free_bytes.critical_below) add('DISK_FREE', 'CRITICAL', sample.disk_free_bytes, t.disk_free_bytes.critical_below);
  else if (sample.disk_free_bytes < t.disk_free_bytes.warning_below) add('DISK_FREE', 'WARNING', sample.disk_free_bytes, t.disk_free_bytes.warning_below);
  if (sample.clock_absolute_offset_ms > t.clock_absolute_offset_ms.critical_above) add('CLOCK_DRIFT', 'CRITICAL', sample.clock_absolute_offset_ms, t.clock_absolute_offset_ms.critical_above);
  else if (sample.clock_absolute_offset_ms > t.clock_absolute_offset_ms.warning_above) add('CLOCK_DRIFT', 'WARNING', sample.clock_absolute_offset_ms, t.clock_absolute_offset_ms.warning_above);
  if ((!sample.service_active || !sample.ntp_synchronized) && sample.consecutive_service_or_ntp_failures >= t.service_or_ntp.critical_after_consecutive_failures) {
    add(sample.service_active ? 'NTP_SYNC' : 'OBSERVER_SERVICE', 'CRITICAL', sample.consecutive_service_or_ntp_failures, t.service_or_ntp.critical_after_consecutive_failures);
  }
  if (sample.delivery_backlog_count >= t.delivery_backlog.critical_count_at_or_above || sample.oldest_delivery_age_seconds > t.delivery_backlog.critical_oldest_age_seconds_above) {
    add('DELIVERY_BACKLOG', 'CRITICAL', sample.delivery_backlog_count, t.delivery_backlog.critical_count_at_or_above);
  } else if (sample.delivery_backlog_count >= t.delivery_backlog.warning_count_at_or_above) add('DELIVERY_BACKLOG', 'WARNING', sample.delivery_backlog_count, t.delivery_backlog.warning_count_at_or_above);
  if (sample.local_rpc_quota_remaining_percent <= t.local_rpc_quota.critical_remaining_percent_at_or_below) add('LOCAL_RPC_QUOTA', 'CRITICAL', sample.local_rpc_quota_remaining_percent, t.local_rpc_quota.critical_remaining_percent_at_or_below);
  else if (sample.local_rpc_quota_remaining_percent <= t.local_rpc_quota.warning_remaining_percent_at_or_below) add('LOCAL_RPC_QUOTA', 'WARNING', sample.local_rpc_quota_remaining_percent, t.local_rpc_quota.warning_remaining_percent_at_or_below);
  return {
    schema_version: GRANT_M2_LIVE_MONITOR_EVALUATION_VERSION,
    sampled_at: sample.sampled_at,
    observer_id: sample.observer_id,
    sample: { consecutive_service_or_ntp_failures: sample.consecutive_service_or_ntp_failures },
    alerts,
    highest_severity: alerts.some(alert => alert.severity === 'CRITICAL') ? 'CRITICAL' : alerts.length > 0 ? 'WARNING' : 'NONE',
    signal_fingerprint: createHash('sha256').update(alerts.map(alert => `${alert.signal}:${alert.severity}`).sort().join('|')).digest('hex'),
    official_window_started: false,
  };
}

export function decideGrantM2LiveMonitorNotification(policy, previous, current) {
  const now = Date.parse(current.sampled_at);
  if (previous === undefined) return current.highest_severity === 'NONE' ? { send: false, kind: 'NONE' } : { send: true, kind: 'ALERT' };
  if (previous.notification_pending === true) return { send: true, kind: current.highest_severity === 'NONE' ? 'RECOVERY' : 'ALERT' };
  const previousTime = Date.parse(previous.notification_sent_at ?? previous.sampled_at);
  if (current.highest_severity === 'NONE' && previous.highest_severity !== 'NONE') return { send: true, kind: 'RECOVERY' };
  if (current.highest_severity !== previous.highest_severity || current.signal_fingerprint !== previous.signal_fingerprint) return { send: current.highest_severity !== 'NONE', kind: 'ALERT' };
  const reminder = current.highest_severity === 'CRITICAL' ? policy.notification.critical_reminder_seconds : policy.notification.warning_reminder_seconds;
  return current.highest_severity !== 'NONE' && now - previousTime >= reminder * 1000 ? { send: true, kind: 'REMINDER' } : { send: false, kind: 'NONE' };
}

export function formatGrantM2LiveMonitorMessage(evaluation, kind) {
  if (kind === 'RECOVERY') return `SovereignKit M2: RECUPERADO em ${evaluation.observer_id}. Monitoramento normal em ${evaluation.sampled_at}.`;
  const signals = evaluation.alerts.map(alert => `${alert.signal}=${alert.severity}`).join(', ');
  return `SovereignKit M2: ${kind} ${evaluation.highest_severity} em ${evaluation.observer_id}: ${signals}. Ação manual necessária. Janela oficial não é reiniciada automaticamente.`;
}

function validateSample(sample) {
  if (sample === null || typeof sample !== 'object' || new Date(sample.sampled_at).toISOString() !== sample.sampled_at || !OBSERVERS.includes(sample.observer_id)) throw Error('M2 live monitor sample identity is invalid');
  for (const field of ['memory_available_bytes', 'disk_free_bytes', 'clock_absolute_offset_ms', 'consecutive_service_or_ntp_failures', 'delivery_backlog_count', 'oldest_delivery_age_seconds', 'local_rpc_quota_remaining_percent']) {
    if (typeof sample[field] !== 'number' || !Number.isFinite(sample[field]) || sample[field] < 0) throw Error(`M2 live monitor sample ${field} is invalid`);
  }
  if (sample.local_rpc_quota_remaining_percent > 100 || typeof sample.service_active !== 'boolean' || typeof sample.ntp_synchronized !== 'boolean') throw Error('M2 live monitor sample range is invalid');
}
