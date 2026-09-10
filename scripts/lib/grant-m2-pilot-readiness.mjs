import { createHash } from "node:crypto";

export const GRANT_M2_PILOT_READINESS_VERSION = "GrantM2PilotReadiness@0.2.0";

const EXPECTED_BLOCKERS = [
  "rehearsal_not_authorized_or_run",
  "backup_restore_not_proven",
  "counters_and_incident_log_not_proven",
  "alerts_and_response_not_proven",
  "resource_and_cost_approval_pending",
  "official_window_not_authorized",
];

const REQUIRED_REHEARSAL_CRITERIA = [
  "all accepted observers execute assignment-bound units",
  "every frozen route participates",
  "all qualifying results pass schema and signature verification",
  "Collector replay is idempotent with no duplicate KPI count",
  "daily export can be verified and restored from a separate location",
  "cumulative and per-observer-route counts reconcile to raw records",
  "one synthetic alert reaches the approved responder destination",
];

export function validateGrantM2PilotReadiness(plan, precommitmentContent) {
  if (plan === null || typeof plan !== "object") throw new Error("M2 readiness plan must be an object");
  if (plan.schema_version !== GRANT_M2_PILOT_READINESS_VERSION) throw new Error("M2 readiness plan version is invalid");
  if (plan.status !== "PRECOMMITMENT_FROZEN_NOT_AUTHORIZED") throw new Error("M2 preparation must remain explicitly unauthorized");
  if (plan.milestone_1?.accepted !== true || !String(plan.milestone_1?.accepted_package ?? "").startsWith("fixtures/grant-m1/final-acceptance-")) {
    throw new Error("M2 preparation requires a retained accepted M1 package");
  }

  const contract = plan.pilot_contract ?? {};
  if (contract.network !== "solana-devnet" ||
      contract.minimum_real_duration_seconds !== 14 * 24 * 60 * 60 ||
      contract.minimum_qualifying_observations !== 3000 ||
      contract.required_observers < 3 ||
      contract.require_every_observer_and_route !== true ||
      contract.allow_retroactive_rule_changes !== false ||
      contract.allow_silent_exclusions !== false ||
      contract.missing_data_behavior !== "RETAIN_AND_REPORT" ||
      contract.integrity_failure_behavior !== "BLOCK_ACCEPTANCE") {
    throw new Error("M2 immutable pilot contract is weakened or incomplete");
  }

  const freezeStatuses = Object.values(plan.freeze ?? {});
  if (freezeStatuses.length !== 8 || freezeStatuses.some(status => status !== "FROZEN") ||
      plan.freeze_evidence?.path !== "deploy/grant-pilot/m2-pilot-precommitment.json" ||
      !/^[a-f0-9]{64}$/u.test(plan.freeze_evidence?.sha256 ?? "") ||
      typeof precommitmentContent !== "string" ||
      createHash("sha256").update(precommitmentContent).digest("hex") !== plan.freeze_evidence.sha256) {
    throw new Error("M2 preparation must bind every frozen item to the precommitment");
  }

  const rehearsal = plan.rehearsal ?? {};
  if (rehearsal.authorization !== "NOT_AUTHORIZED" || rehearsal.status !== "NOT_RUN" ||
      rehearsal.proposed_duration_seconds !== 3600 || rehearsal.separate_from_grant_kpi !== true ||
      rehearsal.evidence_path !== null || JSON.stringify(rehearsal.pass_criteria) !== JSON.stringify(REQUIRED_REHEARSAL_CRITERIA)) {
    throw new Error("M2 rehearsal boundary or pass criteria are invalid");
  }

  const controls = plan.operational_controls ?? {};
  const expectedControls = {
    daily_backup_restore: "IMPLEMENTED_NOT_PROVEN",
    daily_cumulative_counts: "IMPLEMENTED_NOT_PROVEN",
    append_only_incident_log: "IMPLEMENTED_NOT_PROVEN",
    disk_alert: "IMPLEMENTED_NOT_PROVEN",
    clock_drift_alert: "IMPLEMENTED_NOT_PROVEN",
    service_readiness_alert: "IMPLEMENTED_NOT_PROVEN",
    delivery_backlog_alert: "IMPLEMENTED_NOT_PROVEN",
    rpc_quota_alert: "IMPLEMENTED_NOT_PROVEN",
    notification_delivery: "NOT_PROVEN",
    offline_responder: "NOT_ASSIGNED",
    fourteen_day_resource_estimate: "PENDING_REVALIDATION",
    cost_approval: "NOT_AUTHORIZED",
  };
  if (JSON.stringify(controls) !== JSON.stringify(expectedControls)) {
    throw new Error("canonical M2 preparation must not claim unproven operational controls");
  }

  const window = plan.official_window ?? {};
  if (window.authorization !== "NOT_AUTHORIZED" || window.started !== false ||
      window.start_timestamp !== null || window.end_timestamp !== null ||
      window.qualifying_observations !== 0 || plan.milestone_2_started !== false) {
    throw new Error("M2 official window must not start from a preparation artifact");
  }
  if (JSON.stringify(plan.blockers) !== JSON.stringify(EXPECTED_BLOCKERS)) {
    throw new Error("M2 preparation must retain the complete ordered blocker set");
  }

  return {
    status: "PASS",
    gate: "GRANT_M2_PREPARATION_CONTRACT",
    readiness: "BLOCKED_PENDING_EXPLICIT_AUTHORIZATION_AND_EVIDENCE",
    blockers: EXPECTED_BLOCKERS.length,
    minimumRealDurationSeconds: contract.minimum_real_duration_seconds,
    minimumQualifyingObservations: contract.minimum_qualifying_observations,
    milestone2Started: false,
  };
}
