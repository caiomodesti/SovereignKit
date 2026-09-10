import { createHash } from "node:crypto";

export const GRANT_M2_REHEARSAL_PLAN_VERSION = "GrantM2RehearsalPlan@0.1.0";
const EXPECTED_BLOCKERS = [
  "backup_transfer_and_restore_not_proven",
  "resource_and_quota_approval_pending",
  "rehearsal_not_authorized",
];

export function validateGrantM2RehearsalPlan(plan, artifacts) {
  if (plan?.schema_version !== GRANT_M2_REHEARSAL_PLAN_VERSION || plan.status !== "PLANNED_NOT_AUTHORIZED" || plan.scope !== "PRE_M2_REHEARSAL_ONLY") throw new Error("M2 rehearsal plan version, status, or scope is invalid");
  if (plan.bindings?.pilot_precommitment?.path !== "deploy/grant-pilot/m2-pilot-precommitment.json" ||
      plan.bindings?.alert_policy?.path !== "deploy/grant-pilot/m2-alert-policy.json" ||
      plan.bindings?.backup_destination_evidence?.path !== "fixtures/grant-m2/aws-backup-destination-20260909.json" ||
      Object.keys(plan.bindings ?? {}).length !== 3) throw new Error("M2 rehearsal binding inventory is invalid");
  for (const binding of Object.values(plan.bindings ?? {})) {
    const content = artifacts?.get(binding.path);
    if (typeof content !== "string" || createHash("sha256").update(content).digest("hex") !== binding.sha256) throw new Error("M2 rehearsal binding hash mismatch");
  }
  const backupEvidence = JSON.parse(artifacts.get(plan.bindings.backup_destination_evidence.path));
  if (backupEvidence.schema_version !== "GrantM2BackupDestinationEvidence@0.1.0" ||
      backupEvidence.destination_provider !== "AWS" || backupEvidence.destination_host_role !== "observer-aws-a" ||
      backupEvidence.access_restricted_to_service_identity !== true || backupEvidence.available_bytes_above_alert_floor !== true ||
      backupEvidence.observer_service_active !== true || backupEvidence.observer_service_enabled !== true ||
      backupEvidence.destination_created !== true || backupEvidence.transfer_tested !== false || backupEvidence.restore_tested !== false ||
      backupEvidence.separate_provider_from_source !== true || backupEvidence.separate_location_proven !== false ||
      backupEvidence.rehearsal_started !== false || backupEvidence.milestone_2_started !== false) {
    throw new Error("M2 backup destination evidence is incomplete or overclaims readiness");
  }
  const schedule = plan.schedule ?? {};
  const computed = schedule.cycle_indexes?.length * schedule.observers * schedule.routes * schedule.transaction_classes;
  if (schedule.duration_seconds !== 3600 || schedule.cycle_seconds !== 1800 || JSON.stringify(schedule.cycle_indexes) !== "[0,1]" || schedule.observers !== 3 || schedule.routes !== 2 || schedule.transaction_classes !== 1 || schedule.expected_units_per_cycle !== 6 || schedule.expected_units !== computed || computed !== 12 || schedule.start_timestamp !== null || schedule.end_timestamp !== null) throw new Error("M2 rehearsal schedule or arithmetic is invalid");
  if (!Array.isArray(plan.required_evidence) || plan.required_evidence.length !== 15 || new Set(plan.required_evidence).size !== 15) throw new Error("M2 rehearsal evidence inventory is incomplete");
  const criteria = plan.pass_criteria ?? {};
  if (criteria.elapsed_seconds_at_least !== 3600 || criteria.all_expected_units_accounted_for !== true || criteria.duplicate_kpi_units !== 0 || criteria.unexplained_collector_results !== 0 || criteria.signature_or_schema_failures !== 0 || criteria.raw_to_derived_mismatches !== 0 || criteria.backup_restore_byte_identical !== true || criteria.backup_location_separate !== true || criteria.notification_delivery_verified !== true || criteria.unresolved_integrity_incidents !== 0) throw new Error("M2 rehearsal pass criteria are weakened");
  if (JSON.stringify(plan.external_requirements) !== JSON.stringify({ backup_destination: "AWS_OBSERVER_HOST_CONFIGURED_TRANSFER_NOT_TESTED", notification_destination: "TELEGRAM_PRIVATE_OPERATOR_CONFIGURED_AND_TESTED", offline_responder: "PRIMARY_OPERATOR_ASSIGNED", resource_and_quota_approval: "ZERO_INCREMENTAL_SPEND_APPROVED_QUOTA_PENDING" })) throw new Error("M2 rehearsal external readiness record is invalid");
  if (plan.authorization?.rehearsal_authorized !== false || plan.authorization?.authorized_at !== null || plan.authorization?.authorized_by !== null || Object.values(plan.claims ?? {}).some(Boolean) || JSON.stringify(plan.blockers) !== JSON.stringify(EXPECTED_BLOCKERS) || plan.milestone_2_started !== false) throw new Error("M2 rehearsal plan cannot authorize execution or start M2");
  return { status: "PASS", gate: "GRANT_M2_REHEARSAL_PLAN", durationSeconds: 3600, expectedUnits: 12, blockers: 3, rehearsalAuthorized: false, milestone2Started: false };
}
