import { createHash } from "node:crypto";

export const GRANT_M2_ALERT_POLICY_VERSION = "GrantM2AlertPolicy@0.1.0";

export function validateGrantM2AlertPolicy(policy, artifacts) {
  validatePolicyStructure(policy);
  const evidenceContent = artifacts?.get(policy.delivery.evidence_path);
  if (typeof evidenceContent !== "string" || createHash("sha256").update(evidenceContent).digest("hex") !== policy.delivery.evidence_sha256) {
    throw new Error("M2 alert delivery evidence hash mismatch");
  }
  const evidence = JSON.parse(evidenceContent);
  if (evidence.schema_version !== "GrantM2NotificationDeliveryEvidence@0.1.0" ||
      evidence.destination_label !== policy.delivery.destination || evidence.responder_label !== policy.delivery.offline_responder ||
      evidence.api_accepted !== true || evidence.operator_confirmed_receipt !== true ||
      evidence.message_scope !== "SYNTHETIC_PRE_REHEARSAL_ALERT" || evidence.rehearsal_started !== false ||
      evidence.milestone_2_started !== false || evidence.secrets_retained !== false) {
    throw new Error("M2 alert delivery evidence is incomplete or unsafe");
  }
  return { status: "PASS", gate: "GRANT_M2_ALERT_POLICY", deliveryProven: true, responderAssigned: true, milestone2Started: false };
}

function validatePolicyStructure(policy) {
  if (policy?.schema_version !== GRANT_M2_ALERT_POLICY_VERSION || policy.status !== "FROZEN_CHANNEL_DELIVERY_PROVEN") {
    throw new Error("M2 alert policy version or status is invalid");
  }
  const thresholds = policy.thresholds ?? {};
  if (policy.sample_interval_seconds !== 60 ||
      thresholds.disk_free_bytes?.warning_below !== 5 * 1024 ** 3 || thresholds.disk_free_bytes?.critical_below !== 2 * 1024 ** 3 ||
      thresholds.clock_absolute_offset_ms?.warning_above !== 1000 || thresholds.clock_absolute_offset_ms?.critical_above !== 5000 ||
      thresholds.service_or_readiness?.critical_after_consecutive_failures !== 2 ||
      thresholds.delivery_backlog?.warning_count_at_or_above !== 12 || thresholds.delivery_backlog?.critical_count_at_or_above !== 18 ||
      thresholds.delivery_backlog?.critical_oldest_age_seconds_above !== 3600 ||
      thresholds.rpc_quota?.warning_remaining_percent_at_or_below !== 20 || thresholds.rpc_quota?.critical_remaining_percent_at_or_below !== 10 ||
      thresholds.rpc_quota?.warning_on_http_429 !== true || thresholds.rpc_quota?.critical_after_consecutive_http_429 !== 3) {
    throw new Error("M2 alert thresholds are incomplete or changed");
  }
  if (policy.delivery?.destination !== "telegram-private-operator" || policy.delivery?.offline_responder !== "primary-operator" ||
      policy.delivery?.synthetic_delivery_test !== "DELIVERED_AND_OPERATOR_CONFIRMED" || policy.delivery?.notification_delivery_proven !== true ||
      policy.delivery?.evidence_path !== "fixtures/grant-m2/telegram-delivery-test-20260909.json" ||
      !/^[0-9a-f]{64}$/u.test(policy.delivery?.evidence_sha256)) {
    throw new Error("M2 alert policy delivery binding is invalid");
  }
  if (policy.actions?.automatic_window_reset !== false || policy.actions?.automatic_evidence_deletion !== false ||
      policy.actions?.automatic_threshold_relaxation !== false || policy.actions?.open_append_only_incident_on_critical !== true ||
      policy.actions?.manual_response_required !== true || policy.milestone_2_started !== false) {
    throw new Error("M2 alert actions weaken evidence preservation or start the pilot");
  }
}

export function evaluateGrantM2Alerts(policy, sample) {
  validatePolicyStructure(policy);
  validateSample(sample);
  const alerts = [];
  const add = (signal, severity, value, threshold) => alerts.push({ signal, severity, value, threshold });
  const thresholds = policy.thresholds;

  if (sample.disk_free_bytes < thresholds.disk_free_bytes.critical_below) add("DISK_FREE", "CRITICAL", sample.disk_free_bytes, thresholds.disk_free_bytes.critical_below);
  else if (sample.disk_free_bytes < thresholds.disk_free_bytes.warning_below) add("DISK_FREE", "WARNING", sample.disk_free_bytes, thresholds.disk_free_bytes.warning_below);

  const clockOffset = Math.abs(sample.clock_offset_ms);
  if (clockOffset > thresholds.clock_absolute_offset_ms.critical_above) add("CLOCK_DRIFT", "CRITICAL", clockOffset, thresholds.clock_absolute_offset_ms.critical_above);
  else if (clockOffset > thresholds.clock_absolute_offset_ms.warning_above) add("CLOCK_DRIFT", "WARNING", clockOffset, thresholds.clock_absolute_offset_ms.warning_above);

  if ((!sample.service_active || !sample.ready) && sample.consecutive_service_or_readiness_failures >= thresholds.service_or_readiness.critical_after_consecutive_failures) {
    add("SERVICE_READINESS", "CRITICAL", sample.consecutive_service_or_readiness_failures, thresholds.service_or_readiness.critical_after_consecutive_failures);
  }

  if (sample.delivery_backlog_count >= thresholds.delivery_backlog.critical_count_at_or_above || sample.oldest_delivery_age_seconds > thresholds.delivery_backlog.critical_oldest_age_seconds_above) {
    add("DELIVERY_BACKLOG", "CRITICAL", sample.delivery_backlog_count, thresholds.delivery_backlog.critical_count_at_or_above);
  } else if (sample.delivery_backlog_count >= thresholds.delivery_backlog.warning_count_at_or_above) {
    add("DELIVERY_BACKLOG", "WARNING", sample.delivery_backlog_count, thresholds.delivery_backlog.warning_count_at_or_above);
  }

  if (sample.consecutive_http_429 >= thresholds.rpc_quota.critical_after_consecutive_http_429 || sample.rpc_quota_remaining_percent <= thresholds.rpc_quota.critical_remaining_percent_at_or_below) {
    add("RPC_QUOTA", "CRITICAL", sample.rpc_quota_remaining_percent, thresholds.rpc_quota.critical_remaining_percent_at_or_below);
  } else if (sample.consecutive_http_429 > 0 || sample.rpc_quota_remaining_percent <= thresholds.rpc_quota.warning_remaining_percent_at_or_below) {
    add("RPC_QUOTA", "WARNING", sample.rpc_quota_remaining_percent, thresholds.rpc_quota.warning_remaining_percent_at_or_below);
  }

  return {
    schema_version: "GrantM2AlertEvaluation@0.1.0",
    sampled_at: sample.sampled_at,
    alerts,
    highest_severity: alerts.some(item => item.severity === "CRITICAL") ? "CRITICAL" : alerts.length > 0 ? "WARNING" : "NONE",
    append_incident_required: alerts.some(item => item.severity === "CRITICAL"),
    notification_attempted: false,
  };
}

function validateSample(sample) {
  if (typeof sample !== "object" || sample === null || new Date(sample.sampled_at).toISOString() !== sample.sampled_at) throw new Error("M2 alert sample timestamp is invalid");
  for (const field of ["disk_free_bytes", "clock_offset_ms", "consecutive_service_or_readiness_failures", "delivery_backlog_count", "oldest_delivery_age_seconds", "rpc_quota_remaining_percent", "consecutive_http_429"]) {
    if (typeof sample[field] !== "number" || !Number.isFinite(sample[field]) || sample[field] < 0) throw new Error(`M2 alert sample ${field} is invalid`);
  }
  if (sample.rpc_quota_remaining_percent > 100 || typeof sample.service_active !== "boolean" || typeof sample.ready !== "boolean") throw new Error("M2 alert sample range or readiness is invalid");
}
