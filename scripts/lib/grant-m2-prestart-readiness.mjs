import { createHash } from "node:crypto";

export const GRANT_M2_PRESTART_READINESS_VERSION = "GrantM2PrestartReadiness@0.1.0";

const EXPECTED_PATHS = {
  precommitment: "deploy/grant-pilot/m2-pilot-precommitment.json",
  rehearsal: "fixtures/grant-m2/rehearsal-execution-20260912.json",
  resource_revalidation: "fixtures/grant-m2/resource-revalidation-20260912.json",
  live_monitor_deployment: "fixtures/grant-m2/live-monitor-deployment-20260912.json",
};

const EXPECTED_GATES = [
  "aws_ssh_allowlist_refresh",
  "oracle_ssh_allowlist_refresh",
  "three_host_runtime_upgrade",
  "three_host_live_monitor_activation_and_consecutive_samples",
  "operator_alert_receipt_confirmation",
  "immediate_prestart_quota_and_capacity_refresh",
  "separate_explicit_official_window_authorization",
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
      snapshot.status !== "BLOCKED_PENDING_LIVE_MONITOR_AND_HOST_ACCESS") {
    throw new Error("M2 pre-start snapshot status or version is invalid");
  }

  const precommitment = parseBoundArtifact(snapshot, artifacts, "precommitment");
  const rehearsal = parseBoundArtifact(snapshot, artifacts, "rehearsal");
  const resources = parseBoundArtifact(snapshot, artifacts, "resource_revalidation");
  const monitor = parseBoundArtifact(snapshot, artifacts, "live_monitor_deployment");

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

  const google = monitor.hosts?.["observer-google-e2-micro"];
  const aws = monitor.hosts?.["observer-aws-a"];
  const oracle = monitor.hosts?.["observer-oracle-a1"];
  if (monitor.status !== "PARTIAL_GOOGLE_PREFLIGHT_PASS_OTHER_HOSTS_ACCESS_BLOCKED" ||
      google?.sample_status !== "PASS" || google?.timer_enabled !== false ||
      aws?.sample_status !== "BLOCKED_BY_STALE_SSH_ALLOWLIST" ||
      oracle?.sample_status !== "BLOCKED_BY_STALE_SSH_ALLOWLIST" ||
      monitor.official_window_started !== false) {
    throw new Error("M2 live-monitor deployment state is overstated or inconsistent");
  }

  if (Object.values(snapshot.proven_controls ?? {}).length !== 6 ||
      Object.values(snapshot.proven_controls ?? {}).some(value => value !== true) ||
      JSON.stringify(snapshot.remaining_gates) !== JSON.stringify(EXPECTED_GATES)) {
    throw new Error("M2 pre-start controls or remaining gates are incomplete");
  }

  if (snapshot.notification_credentials_transferred_to_hosts !== false ||
      snapshot.worker_instances_started !== 0 || snapshot.authorizes_official_window !== false ||
      snapshot.official_window_started !== false || snapshot.milestone_2_started !== false) {
    throw new Error("M2 pre-start snapshot crosses an unauthorized boundary");
  }

  return {
    status: "PASS",
    gate: "GRANT_M2_CURRENT_PRESTART_READINESS",
    readiness: "BLOCKED",
    provenControls: 6,
    remainingGates: EXPECTED_GATES.length,
    rehearsalTransactions: 12,
    qualifyingGrantUnits: 0,
    officialWindowStarted: false,
  };
}
