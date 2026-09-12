import { createHash } from "node:crypto";

export const GRANT_M2_PRESTART_READINESS_VERSION = "GrantM2PrestartReadiness@0.1.0";

const EXPECTED_PATHS = {
  precommitment: "deploy/grant-pilot/m2-pilot-precommitment.json",
  rehearsal: "fixtures/grant-m2/rehearsal-execution-20260912.json",
  resource_revalidation: "fixtures/grant-m2/resource-revalidation-20260912.json",
  live_monitor_deployment: "fixtures/grant-m2/live-monitor-deployment-20260912.json",
  live_monitor_activation: "fixtures/grant-m2/live-monitor-activation-20260912.json",
};

const EXPECTED_GATES = [
  "operator_alert_receipt_confirmation",
  "immediate_prestart_quota_and_capacity_refresh",
  "separate_explicit_official_window_authorization",
];

const EXPECTED_MONITOR_GATES = [
  "explicit_authorization_to_install_existing_telegram_bot_credentials_on_the_three_observer_hosts",
  "three_host_synthetic_alert_delivery_and_recovery_test",
  "three_host_timer_activation_and_scheduled_sample_verification",
];

function parseBoundArtifact(snapshot, artifacts, key) {
  const binding = snapshot.evidence?.[key];
  if (binding?.path !== EXPECTED_PATHS[key] || !/^[a-f0-9]{64}$/u.test(binding?.sha256 ?? "")) {
    throw new Error(`M2 pre-start ${key} evidence binding is invalid`);
  }
  const content = artifacts?.[binding.path];
  if (typeof content !== "string" || createHash("sha256").update(content).digest("hex") !== binding.sha256) {
    throw new Error(`M2 pre-start ${key} evidence hash does not match`);
  }
  return JSON.parse(content);
}

export function validateGrantM2PrestartReadiness(snapshot, artifacts) {
  if (snapshot?.schema_version !== GRANT_M2_PRESTART_READINESS_VERSION ||
      snapshot.status !== "BLOCKED_PENDING_OPERATOR_CONFIRMATION_AND_PRESTART_AUTHORIZATION") {
    throw new Error("M2 pre-start snapshot status or version is invalid");
  }

  const precommitment = parseBoundArtifact(snapshot, artifacts, "precommitment");
  const rehearsal = parseBoundArtifact(snapshot, artifacts, "rehearsal");
  const resources = parseBoundArtifact(snapshot, artifacts, "resource_revalidation");
  const monitor = parseBoundArtifact(snapshot, artifacts, "live_monitor_deployment");
  const activation = parseBoundArtifact(snapshot, artifacts, "live_monitor_activation");

  if (precommitment.official_window?.started !== false || precommitment.milestone_2_started !== false) {
    throw new Error("M2 precommitment must remain outside the official window");
  }

  const accounting = snapshot.rehearsal_accounting ?? {};
  if (accounting.submitted_transactions !== 12 || accounting.worker_finalized_transactions !== 11 ||
      accounting.acknowledged_without_worker_completion !== 1 || accounting.qualifying_grant_units !== 0 ||
      accounting.additional_rehearsal_transactions_authorized !== 0 ||
      rehearsal.total_rehearsal_transactions !== 12 ||
      rehearsal.aggregate_transaction_accounting?.worker_finalized_transactions !== 11 ||
      rehearsal.aggregate_transaction_accounting?.acknowledged_without_worker_completion !== 1 ||
      rehearsal.qualifying_grant_units !== 0 || rehearsal.official_window_started !== false) {
    throw new Error("M2 rehearsal accounting is incomplete or relabeled");
  }

  const backup = rehearsal.oracle_to_aws_backup_restore ?? {};
  if (rehearsal.raw_to_derived_reconciliation?.status !== "PASS" ||
      rehearsal.raw_to_derived_reconciliation?.observers_reconciled !== 3 ||
      rehearsal.raw_to_derived_reconciliation?.routes_reconciled !== 2 ||
      backup.byte_identical_transfer !== true || backup.restore_extraction_verified !== true ||
      backup.destination_copy_retained !== true) {
    throw new Error("M2 rehearsal proof set is incomplete");
  }

  if (resources.status !== "PASS" || resources.authorizes_official_window !== false ||
      resources.official_window_started !== false ||
      resources.alchemy_quota?.remaining_after_frozen_upper_bound_cu <= 0) {
    throw new Error("M2 resource evidence is invalid or does not preserve the start gate");
  }

  const hosts = [
    monitor.hosts?.["observer-aws-a"],
    monitor.hosts?.["observer-google-e2-micro"],
    monitor.hosts?.["observer-oracle-a1"],
  ];
  if (monitor.status !== "THREE_HOST_PREFLIGHT_PASS_NOT_ACTIVATED" ||
      !/^[a-f0-9]{40}$/u.test(monitor.source_commit ?? "") ||
      !/^[a-f0-9]{64}$/u.test(monitor.runtime_archive_sha256 ?? "") ||
      monitor.runtime_archive_bytes <= 0 || monitor.runtime_manifest_files !== 308 ||
      hosts.some(host => host?.runtime_status !== "UPGRADED_NOT_ACTIVATED" ||
        host?.sample_status !== "PASS" || !Number.isSafeInteger(host?.sample_sequence) ||
        host.sample_sequence < 1 || host?.consecutive_healthy_samples_on_final_runtime !== 2 ||
        host?.service_active !== true ||
        host?.ntp_synchronized !== true || host?.delivery_backlog_count !== 0 ||
        typeof host?.local_rpc_quota_remaining_percent !== "number" ||
        host.local_rpc_quota_remaining_percent <= 0 ||
        host?.highest_severity !== "NONE" || host?.timer_enabled !== false ||
        host?.timer_active !== false || host?.telegram_configuration_installed !== false) ||
      JSON.stringify(monitor.remaining_gates) !== JSON.stringify(EXPECTED_MONITOR_GATES) ||
      monitor.worker_instances_started !== 0 || monitor.authorizes_official_window !== false ||
      monitor.official_window_started !== false) {
    throw new Error("M2 live-monitor deployment state is overstated or inconsistent");
  }

  const activatedHosts = [
    activation.hosts?.["observer-aws-a"],
    activation.hosts?.["observer-google-e2-micro"],
    activation.hosts?.["observer-oracle-a1"],
  ];
  const credential = activation.credential_installation ?? {};
  if (activation.schema_version !== "GrantM2LiveMonitorActivationAggregate@0.1.0" ||
      activation.status !== "THREE_HOST_LIVE_MONITOR_ACTIVE" ||
      activation.source_commit !== monitor.source_commit ||
      credential.hosts !== 3 || credential.mode !== "0640" ||
      credential.owner !== "root" || credential.group !== "sovereignkit" ||
      credential.readable_by_service_identity !== true ||
      credential.credential_content_in_evidence !== false ||
      activatedHosts.some(host => host?.synthetic_alert_delivery_accepted !== true ||
        host?.synthetic_recovery_delivery_accepted !== true ||
        !Array.isArray(host?.scheduled_sample_sequences) ||
        host.scheduled_sample_sequences.length !== 2 ||
        host.scheduled_sample_sequences[0] !== host.activation_sample_sequence + 1 ||
        host.scheduled_sample_sequences[1] !== host.activation_sample_sequence + 2 ||
        host?.timer_enabled !== true || host?.timer_active !== true ||
        host?.service_result !== "success" || host?.latest_highest_severity !== "NONE" ||
        host?.latest_service_active !== true || host?.latest_ntp_synchronized !== true ||
        host?.latest_delivery_backlog_count !== 0 ||
        typeof host?.latest_local_rpc_quota_remaining_percent !== "number" ||
        host.latest_local_rpc_quota_remaining_percent <= 0) ||
      activation.synthetic_alerts_delivered !== 3 ||
      activation.synthetic_recoveries_delivered !== 3 ||
      activation.operator_receipt_confirmation_pending !== true ||
      activation.worker_instances_started !== 0 ||
      activation.authorizes_official_window !== false ||
      activation.official_window_started !== false) {
    throw new Error("M2 live-monitor activation evidence is overstated or inconsistent");
  }

  if (Object.values(snapshot.proven_controls ?? {}).length !== 13 ||
      Object.values(snapshot.proven_controls ?? {}).some(value => value !== true) ||
      JSON.stringify(snapshot.remaining_gates) !== JSON.stringify(EXPECTED_GATES)) {
    throw new Error("M2 pre-start controls or remaining gates are incomplete");
  }

  if (snapshot.notification_credentials_transferred_to_hosts !== true ||
      snapshot.worker_instances_started !== 0 || snapshot.authorizes_official_window !== false ||
      snapshot.official_window_started !== false || snapshot.milestone_2_started !== false) {
    throw new Error("M2 pre-start snapshot crosses an unauthorized boundary");
  }

  return {
    status: "PASS",
    gate: "GRANT_M2_CURRENT_PRESTART_READINESS",
    readiness: "BLOCKED",
    provenControls: 13,
    remainingGates: EXPECTED_GATES.length,
    rehearsalTransactions: 12,
    qualifyingGrantUnits: 0,
    officialWindowStarted: false,
  };
}
