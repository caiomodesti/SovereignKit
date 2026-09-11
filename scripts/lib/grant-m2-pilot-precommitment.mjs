import { createHash } from "node:crypto";

export const GRANT_M2_PILOT_PRECOMMITMENT_VERSION = "GrantM2PilotPrecommitment@0.2.0";

const EXPECTED_TERMINAL_STATES = [
  "FINALIZED",
  "CONFIRMED",
  "OBSERVED_EXECUTION_FAILED",
  "EXPIRED",
  "OBSERVATION_INCONCLUSIVE",
];

export function validateGrantM2PilotPrecommitment(plan, artifactContents) {
  if (plan === null || typeof plan !== "object") throw new Error("M2 precommitment must be an object");
  if (plan.schema_version !== GRANT_M2_PILOT_PRECOMMITMENT_VERSION || plan.status !== "FROZEN_NOT_AUTHORIZED") {
    throw new Error("M2 precommitment version or status is invalid");
  }
  if (plan.experiment?.network !== "solana-devnet" || plan.experiment?.genesis_hash !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ||
      plan.experiment?.phase !== "public_pilot" || plan.experiment?.result_unit_phase !== "healthy") {
    throw new Error("M2 experiment must remain pinned to Solana Devnet");
  }

  const observers = plan.observers ?? [];
  if (observers.length !== 3 || new Set(observers.map(item => item.observer_id)).size !== 3 ||
      observers.some(item => !/^[a-f0-9]{40}$/u.test(item.runtime_commit))) {
    throw new Error("M2 observer set or runtime commit is invalid");
  }
  const registryRef = plan.m1_observer_registry ?? {};
  const registryContent = artifactContents?.get(registryRef.path);
  if (typeof registryContent !== "string" || sha256(registryContent) !== registryRef.sha256) {
    throw new Error("M2 accepted observer registry hash mismatch");
  }
  const acceptedRegistry = JSON.parse(registryContent);
  if (acceptedRegistry.schema_version !== "GrantObserverRegistry@0.3.0" || acceptedRegistry.observers?.length !== 3) {
    throw new Error("M2 accepted observer registry is invalid");
  }
  for (const observer of observers) {
    const accepted = acceptedRegistry.observers.find(item => item.observer_id === observer.observer_id);
    if (accepted?.runtime_commit !== observer.runtime_commit || accepted?.independence_status !== "CORROBORATED" ||
        accepted?.runtime_compatibility_status !== "REVIEWED_COMPATIBLE" ||
        accepted?.evidence_protocol_version !== "GrantM1EvidenceProtocol@0.1.0") {
      throw new Error(`M2 observer does not match accepted M1 registry: ${observer.observer_id}`);
    }
  }
  const routes = plan.routes ?? [];
  if (routes.length < 2 || new Set(routes.map(item => item.route_id)).size !== routes.length) {
    throw new Error("M2 requires at least two unique frozen routes");
  }
  for (const route of routes) {
    const content = artifactContents?.get(route.preflight_path);
    if (typeof content !== "string" || sha256(content) !== route.preflight_sha256) {
      throw new Error(`M2 route evidence hash mismatch for ${route.route_id}`);
    }
    const evidence = JSON.parse(content);
    if (evidence.route_id !== route.route_id || evidence.provider_label !== route.provider_label ||
        evidence.logical_endpoint_origin !== route.logical_endpoint_origin || evidence.health !== "ok" ||
        evidence.genesis_hash !== plan.experiment.genesis_hash || evidence.credential_material_persisted !== false) {
      throw new Error(`M2 route evidence content mismatch for ${route.route_id}`);
    }
  }
  const failureRef = plan.route_candidate_failures ?? {};
  const failureContent = artifactContents?.get(failureRef.path);
  if (typeof failureContent !== "string" || sha256(failureContent) !== failureRef.sha256) {
    throw new Error("M2 rejected route-candidate evidence hash mismatch");
  }
  const failureEvidence = JSON.parse(failureContent);
  if (failureRef.expected_rejected_candidates !== 3 || failureEvidence.credential_material_persisted !== false ||
      failureEvidence.admitted_route_effect !== "NONE" || failureEvidence.candidates?.length !== 3 ||
      failureEvidence.candidates.some(candidate => candidate.status !== "REJECTED")) {
    throw new Error("M2 rejected route-candidate evidence is incomplete");
  }

  const readerRef = plan.reader_deployment ?? {};
  const readerContent = artifactContents?.get(readerRef.path);
  if (typeof readerContent !== "string" || sha256(readerContent) !== readerRef.sha256) throw new Error("M2 reader deployment evidence hash mismatch");
  const readerEvidence = JSON.parse(readerContent);
  if (readerEvidence.schema_version !== "GrantM2ReaderDeploymentEvidence@0.1.0" ||
      readerEvidence.status !== "INSTALLED_THREE_HOSTS_RPC_PREFLIGHT_PASSED" || readerEvidence.observers?.length !== 3 ||
      readerEvidence.observers.some(item => item.status !== "INSTALLED_HASH_VERIFIED" || item.rpc_methods_passed !== 12 || item.backup_retained !== true || item.service_active !== true) ||
      readerEvidence.installed_registry_sha256 !== readerRef.registry_sha256 || readerRef.logical_readers !== 3 || readerRef.quorum !== 2 ||
      readerRef.shared_public_upstream !== true || readerRef.independent_reader_infrastructure_proven !== false ||
      readerEvidence.shared_public_upstream !== true || readerEvidence.independent_reader_infrastructure_proven !== false ||
      readerEvidence.remote_rpc_preflight_proven !== true || readerEvidence.offsets_activated !== false ||
      readerEvidence.rehearsal_started !== false || readerEvidence.milestone_2_started !== false) {
    throw new Error("M2 reader deployment evidence is incomplete or overclaims independence");
  }
  const quotaRef = plan.resource_quota_estimate ?? {};
  const quotaContent = artifactContents?.get(quotaRef.path);
  if (typeof quotaContent !== "string" || sha256(quotaContent) !== quotaRef.sha256) throw new Error("M2 resource quota estimate hash mismatch");
  const quotaEvidence = JSON.parse(quotaContent);
  if (quotaEvidence.schema_version !== "GrantM2ResourceQuotaEstimate@0.1.0" || quotaEvidence.status !== "ESTIMATED_NOT_APPROVED" ||
      quotaEvidence.deterministic_cycle_offsets?.length !== 6 || quotaRef.deterministic_offsets_bound !== true || quotaRef.quota_approval !== "PENDING" ||
      quotaEvidence.decision?.authorizes_rehearsal !== false || quotaEvidence.decision?.authorizes_official_window !== false || quotaEvidence.milestone_2_started !== false) {
    throw new Error("M2 resource quota estimate boundary is invalid");
  }

  if (JSON.stringify(plan.transaction_classes) !== JSON.stringify(["MATCHED_CONTROL"]) || plan.comparative_classification_enabled !== false) {
    throw new Error("M2 transaction class scope is broadened without evidence");
  }
  const cadence = plan.cadence ?? {};
  const computedUnits = cadence.planned_cycles * observers.length * routes.length * plan.transaction_classes.length;
  if (cadence.cycle_seconds !== 1800 || cadence.maximum_start_jitter_seconds !== 120 ||
      cadence.planned_cycles !== 672 || cadence.units_per_cycle !== observers.length * routes.length ||
      cadence.planned_units !== computedUnits || cadence.planned_units !== 4032 ||
      cadence.minimum_qualifying_units !== 3000 || cadence.real_window_seconds !== 1209600 ||
      cadence.backfill_missing_cycles !== false) {
    throw new Error("M2 cadence, duration, or unit arithmetic is invalid");
  }

  const observation = plan.observation ?? {};
  if (observation.poll_interval_ms !== 5000 || observation.observation_deadline_ms !== 120000 ||
      observation.reader_request_timeout_ms !== 10000 || observation.quorum_rule_version !== "ObservationQuorum@0.1.0" ||
      observation.raw_poll_schema_version !== "RawObservationPoll@0.2.0" ||
      observation.assignment_schema_version !== "ObservationAssignment@0.1.0" ||
      observation.job_schema_version !== "ObservationJob@0.1.0" || observation.probe_result_schema_version !== "0.1.0" ||
      observation.evidence_protocol_version !== "GrantM1EvidenceProtocol@0.1.0") {
    throw new Error("M2 observation protocol versions or timings are invalid");
  }

  const qualification = plan.qualification ?? {};
  if (JSON.stringify(qualification.terminal_states) !== JSON.stringify(EXPECTED_TERMINAL_STATES) ||
      qualification.primary_unit !== "experiment x observer x route x transaction_class x probe_index" ||
      qualification.require_frozen_unit_membership !== true || qualification.require_valid_assignment_signature !== true ||
      qualification.require_valid_observer_signature !== true || qualification.require_schema_validation !== true ||
      qualification.require_raw_to_derived_recomputation !== true || qualification.require_collector_acceptance !== true ||
      qualification.count_duplicate_delivery !== false || qualification.count_retry_as_new_unit !== false ||
      qualification.count_missing_assignment !== false || qualification.count_structurally_invalid_unit !== false ||
      qualification.retain_all_missing_rejected_invalid_and_excluded !== true) {
    throw new Error("M2 qualification rules are weakened or incomplete");
  }

  const interruption = plan.interruption_policy ?? {};
  if (interruption.automatic_window_reset !== false || interruption.silent_backfill !== false ||
      interruption.route_terminal_failure_counts_when_assignment_was_executed !== true ||
      interruption.collector_or_export_outage_may_recover_without_reset_only_when_observer_raw_evidence_is_intact !== true ||
      interruption.observer_or_scheduler_outage_above_consecutive_cycles !== 2 ||
      interruption.observer_or_scheduler_outage_above_seconds !== 3600 ||
      interruption.continuity_breach_blocks_current_window_acceptance !== true ||
      interruption.clock_integrity_failure_blocks_affected_units !== true ||
      interruption.unresolved_evidence_integrity_failure_blocks_acceptance !== true ||
      interruption.manual_decision_required_for_replacement_window !== true ||
      interruption.preserve_original_window_and_incident_evidence !== true) {
    throw new Error("M2 interruption policy is weakened or incomplete");
  }
  if (plan.official_window?.authorization !== "NOT_AUTHORIZED" || plan.official_window?.started !== false ||
      plan.official_window?.start_timestamp !== null || plan.official_window?.end_timestamp !== null ||
      Object.values(plan.claims ?? {}).some(value => value !== false) || plan.milestone_2_started !== false) {
    throw new Error("M2 precommitment cannot authorize a window or broaden claims");
  }

  return {
    status: "PASS",
    gate: "GRANT_M2_PILOT_PRECOMMITMENT",
    observers: observers.length,
    routes: routes.length,
    classes: plan.transaction_classes.length,
    plannedUnits: cadence.planned_units,
    targetMarginUnits: cadence.planned_units - cadence.minimum_qualifying_units,
    rejectedRouteCandidates: failureEvidence.candidates.length,
    readerDeploymentBound: true,
    quotaApproval: "PENDING",
    milestone2Started: false,
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
