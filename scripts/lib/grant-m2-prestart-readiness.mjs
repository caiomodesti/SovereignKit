import { createHash } from "node:crypto";

export const GRANT_M2_PRESTART_READINESS_VERSION = "GrantM2PrestartReadiness@0.1.0";
export const GRANT_M2_PRESTART_READINESS_CURRENT_VERSION = "GrantM2PrestartReadiness@0.2.0";

const EXPECTED_PATHS = {
  precommitment: "deploy/grant-pilot/m2-pilot-precommitment.json",
  rehearsal: "fixtures/grant-m2/rehearsal-execution-20260912.json",
  resource_revalidation: "fixtures/grant-m2/resource-revalidation-20260912.json",
  live_monitor_deployment: "fixtures/grant-m2/live-monitor-deployment-20260912.json",
  live_monitor_activation: "fixtures/grant-m2/live-monitor-activation-20260912.json",
};

const CURRENT_EXPECTED_PATHS = {
  ...EXPECTED_PATHS,
  immediate_prestart_refresh: "fixtures/grant-m2/immediate-prestart-refresh-20260913.json",
};

const EXPECTED_GATES = [
  "private_pr_78_merge_authorization_and_merge",
  "immediate_prestart_quota_and_capacity_refresh",
  "separate_explicit_official_window_authorization",
];

const CURRENT_EXPECTED_GATES = [
  "separate_explicit_official_window_authorization",
];

const EXPECTED_MONITOR_GATES = [
  "explicit_authorization_to_install_existing_telegram_bot_credentials_on_the_three_observer_hosts",
  "three_host_synthetic_alert_delivery_and_recovery_test",
  "three_host_timer_activation_and_scheduled_sample_verification",
];

function parseBoundArtifact(snapshot, artifacts, key, expectedPaths) {
  const binding = snapshot.evidence?.[key];
  if (binding?.path !== expectedPaths[key] || !/^[a-f0-9]{64}$/u.test(binding?.sha256 ?? "")) {
    throw new Error(`M2 pre-start ${key} evidence binding is invalid`);
  }
  const content = artifacts?.[binding.path];
  if (typeof content !== "string" || createHash("sha256").update(content).digest("hex") !== binding.sha256) {
    throw new Error(`M2 pre-start ${key} evidence hash does not match`);
  }
  return JSON.parse(content);
}

export function validateGrantM2PrestartReadiness(snapshot, artifacts) {
  const historical = snapshot?.schema_version === GRANT_M2_PRESTART_READINESS_VERSION;
  const current = snapshot?.schema_version === GRANT_M2_PRESTART_READINESS_CURRENT_VERSION;
  if ((!historical && !current) ||
      (historical && snapshot.status !== "BLOCKED_PENDING_PR_MERGE_PRESTART_REFRESH_AND_EXPLICIT_AUTHORIZATION") ||
      (current && snapshot.status !== "BLOCKED_PENDING_EXPLICIT_OFFICIAL_WINDOW_AUTHORIZATION")) {
    throw new Error("M2 pre-start snapshot status or version is invalid");
  }

  const expectedPaths = current ? CURRENT_EXPECTED_PATHS : EXPECTED_PATHS;
  const expectedGates = current ? CURRENT_EXPECTED_GATES : EXPECTED_GATES;
  const expectedControlCount = current ? 15 : 14;

  const precommitment = parseBoundArtifact(snapshot, artifacts, "precommitment", expectedPaths);
  const rehearsal = parseBoundArtifact(snapshot, artifacts, "rehearsal", expectedPaths);
  const resources = parseBoundArtifact(snapshot, artifacts, "resource_revalidation", expectedPaths);
  const monitor = parseBoundArtifact(snapshot, artifacts, "live_monitor_deployment", expectedPaths);
  const activation = parseBoundArtifact(snapshot, artifacts, "live_monitor_activation", expectedPaths);
  const refresh = current ? parseBoundArtifact(snapshot, artifacts, "immediate_prestart_refresh", expectedPaths) : null;

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
      resources.alchemy_account_quota?.remaining_after_frozen_upper_compute_units <= 0) {
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
      activation.operator_receipt_confirmation_pending !== false ||
      activation.operator_receipt_confirmed !== true ||
      activation.operator_confirmed_message_count !== 6 ||
      new Date(activation.operator_receipt_confirmed_at).toISOString() !== activation.operator_receipt_confirmed_at ||
      activation.worker_instances_started !== 0 ||
      activation.authorizes_official_window !== false ||
      activation.official_window_started !== false) {
    throw new Error("M2 live-monitor activation evidence is overstated or inconsistent");
  }

  if (current) validateImmediatePrestartRefresh(refresh, resources, snapshot.captured_at);

  if (Object.values(snapshot.proven_controls ?? {}).length !== expectedControlCount ||
      Object.values(snapshot.proven_controls ?? {}).some(value => value !== true) ||
      JSON.stringify(snapshot.remaining_gates) !== JSON.stringify(expectedGates)) {
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
    provenControls: expectedControlCount,
    remainingGates: expectedGates.length,
    rehearsalTransactions: 12,
    qualifyingGrantUnits: 0,
    officialWindowStarted: false,
  };
}

function validateImmediatePrestartRefresh(refresh, historicalResources, snapshotCapturedAt) {
  if (refresh?.schema_version !== "GrantM2ImmediatePrestartRefresh@0.1.0" ||
      refresh.status !== "PASS" || refresh.claim_scope !== "POST_MERGE_READ_ONLY_PRESTART_REFRESH" ||
      refresh.captured_at !== snapshotCapturedAt || new Date(refresh.captured_at).toISOString() !== refresh.captured_at) {
    throw new Error("M2 immediate pre-start refresh identity is invalid");
  }
  const merged = refresh.merged_runtime ?? {};
  if (merged.pull_request !== 78 || !/^[a-f0-9]{40}$/u.test(merged.head_commit ?? "") ||
      !/^[a-f0-9]{40}$/u.test(merged.merge_commit ?? "") || merged.base_branch !== "main" ||
      new Date(merged.merged_at).toISOString() !== merged.merged_at ||
      new Date(merged.merged_at) >= new Date(refresh.captured_at)) {
    throw new Error("M2 merged runtime evidence is invalid");
  }
  const quota = refresh.alchemy_account_quota ?? {};
  if (quota.captured_via !== "authenticated_alchemy_dashboard_usage_page" ||
      quota.period !== "current_month_utc" || !Number.isSafeInteger(quota.used_compute_units) || quota.used_compute_units < 0 ||
      quota.limit_compute_units !== 30_000_000 || quota.remaining_compute_units !== quota.limit_compute_units - quota.used_compute_units ||
      quota.frozen_upper_compute_units_with_contingency !== historicalResources.rehearsal_measurement?.frozen_upper_compute_units_with_contingency ||
      quota.remaining_after_frozen_upper_compute_units !== quota.remaining_compute_units - quota.frozen_upper_compute_units_with_contingency ||
      quota.frozen_upper_fits_remaining_quota !== true || quota.remaining_after_frozen_upper_compute_units <= 0) {
    throw new Error("M2 refreshed authenticated quota evidence is invalid");
  }
  const payer = refresh.fee_payer ?? {};
  if (payer.captured_via !== "solana_public_devnet_getBalance_finalized" || !Number.isSafeInteger(payer.context_slot) || payer.context_slot < 1 ||
      !Number.isSafeInteger(payer.balance_lamports) || payer.balance_lamports <= 0 || payer.planned_units !== 4032 ||
      payer.projected_fees_lamports_at_5000_per_unit !== payer.planned_units * 5000 ||
      payer.projected_remaining_lamports !== payer.balance_lamports - payer.projected_fees_lamports_at_5000_per_unit ||
      payer.projected_remaining_lamports <= 0) {
    throw new Error("M2 refreshed fee-payer capacity evidence is invalid");
  }
  const expectedHosts = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
  if (JSON.stringify(Object.keys(refresh.hosts ?? {}).sort()) !== JSON.stringify(expectedHosts.sort())) {
    throw new Error("M2 refreshed host set is invalid");
  }
  for (const host of Object.values(refresh.hosts)) {
    if (!Number.isSafeInteger(host.cpu_count) || host.cpu_count < 1 ||
        !Number.isSafeInteger(host.memory_available_kb) || host.memory_available_kb < 524_288 ||
        !Number.isSafeInteger(host.disk_available_kb) || host.disk_available_kb < 5_242_880 ||
        host.ntp_synchronized !== true || host.observer_active !== true ||
        host.monitor_timer_enabled !== true || host.monitor_timer_active !== true || host.worker_instances !== 0 ||
        !Number.isSafeInteger(host.latest_monitor_sequence) || host.latest_monitor_sequence < 1 ||
        new Date(host.latest_monitor_sampled_at).toISOString() !== host.latest_monitor_sampled_at ||
        new Date(host.latest_monitor_sampled_at) > new Date(refresh.captured_at) ||
        host.latest_highest_severity !== "NONE" || host.latest_delivery_backlog_count !== 0 ||
        typeof host.latest_local_rpc_quota_remaining_percent !== "number" || host.latest_local_rpc_quota_remaining_percent <= 0 ||
        host.latest_official_window_started !== false) {
      throw new Error("M2 refreshed host capacity or monitor evidence is invalid");
    }
  }
  const minimumMemory = Math.min(...Object.values(refresh.hosts).map(host => host.memory_available_kb));
  if (refresh.minimum_host_memory_available_kb !== minimumMemory || refresh.google_memory_warning_floor_kb !== 524_288 ||
      refresh.google_memory_headroom_above_warning_floor_kb !== refresh.hosts["observer-google-e2-micro"].memory_available_kb - refresh.google_memory_warning_floor_kb ||
      JSON.stringify(refresh.remaining_gates) !== JSON.stringify(CURRENT_EXPECTED_GATES) ||
      refresh.read_only_refresh !== true || refresh.worker_instances_started !== 0 || refresh.additional_rehearsal_transactions !== 0 ||
      refresh.authorizes_official_window !== false || refresh.official_window_started !== false || refresh.milestone_2_started !== false) {
    throw new Error("M2 immediate pre-start refresh crosses a gate or has invalid arithmetic");
  }
}
