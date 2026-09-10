export const GRANT_M2_READER_TOPOLOGY_PROPOSAL_VERSION = "GrantM2ReaderTopologyProposal@0.1.0";
export const GRANT_M2_RESOURCE_QUOTA_ESTIMATE_VERSION = "GrantM2ResourceQuotaEstimate@0.1.0";

const OBSERVERS = ["observer-aws-a", "observer-google-e2-micro", "observer-oracle-a1"];
const ROUTES = ["alchemy-solana-devnet", "solana-public-devnet"];

export function validateGrantM2ReaderTopologyProposal(plan) {
  if (plan?.schema_version !== GRANT_M2_READER_TOPOLOGY_PROPOSAL_VERSION ||
      plan.status !== "OPERATOR_DECISION_REQUIRED" || plan.scope !== "PRE_M2_REHEARSAL_ONLY" ||
      plan.deployment_status !== "NOT_DEPLOYED") throw new Error("M2 reader proposal boundary is invalid");
  if (plan.observation_contract?.logical_readers !== 3 || plan.observation_contract?.quorum !== 2 ||
      plan.observation_contract?.reader_client_must_differ_from_submission_client_instance !== true) {
    throw new Error("M2 reader quorum contract is invalid");
  }
  const current = plan.current_topology ?? [];
  if (current.length !== 3 || new Set(current.map(reader => reader.reader_id)).size !== 3 ||
      current.find(reader => reader.upstream === "ONFINALITY_SOLANA_DEVNET")?.essential_signature_status_method !== "HTTP_429") {
    throw new Error("M2 current reader degradation is not retained");
  }
  const proposed = plan.recommended_topology ?? [];
  if (proposed.length !== 3 || new Set(proposed.map(reader => reader.reader_id)).size !== 3 ||
      new Set(proposed.map(reader => reader.client_identity)).size !== 3 ||
      proposed.filter(reader => reader.upstream === "SOLANA_PUBLIC_DEVNET").length !== 2 ||
      proposed.filter(reader => reader.upstream === "ALCHEMY_SOLANA_DEVNET").length !== 1) {
    throw new Error("M2 recommended reader topology is invalid");
  }
  if (JSON.stringify(plan.deployment_targets) !== JSON.stringify(OBSERVERS) ||
      plan.limitations?.public_reader_clients_share_upstream !== true ||
      plan.limitations?.public_reader_failures_are_correlated !== true ||
      plan.limitations?.proves_three_independent_rpc_providers !== false ||
      plan.limitations?.proves_independent_validators !== false ||
      !String(plan.limitations?.claim_boundary ?? "").includes("not independent witnesses")) {
    throw new Error("M2 reader correlation limitation is missing or weakened");
  }
  if (plan.operator_decision?.recommended_option !== "REPLACE_ONFINALITY_WITH_SECOND_LOGICAL_SOLANA_PUBLIC_CLIENT" ||
      plan.operator_decision?.authorized !== false || plan.operator_decision?.authorized_at !== null ||
      plan.operator_decision?.authorized_by !== null || plan.rehearsal_started !== false || plan.milestone_2_started !== false) {
    throw new Error("M2 reader proposal cannot authorize deployment or execution");
  }
  return { status: "PASS", gate: "GRANT_M2_READER_TOPOLOGY_PROPOSAL", logicalReaders: 3, quorum: 2, deploymentAuthorized: false, milestone2Started: false };
}

export function validateGrantM2ResourceQuotaEstimate(plan) {
  if (plan?.schema_version !== GRANT_M2_RESOURCE_QUOTA_ESTIMATE_VERSION ||
      plan.status !== "ESTIMATED_NOT_APPROVED" || plan.scope !== "FOURTEEN_DAY_M2_PREPARATION") {
    throw new Error("M2 quota estimate boundary is invalid");
  }
  const workload = plan.frozen_workload ?? {};
  const polls = Math.floor(workload.observation_deadline_seconds / workload.poll_interval_seconds) + 1;
  if (workload.planned_units !== 4032 || workload.alchemy_submission_units !== 2016 ||
      workload.observation_deadline_seconds !== 120 || workload.poll_interval_seconds !== 5 ||
      workload.maximum_polls_per_unit !== polls || workload.health_check_days !== 14 ||
      workload.health_checks_per_minute_per_observer !== 1 || workload.observers !== 3) {
    throw new Error("M2 frozen workload inputs are invalid");
  }
  const snapshot = plan.alchemy_plan_snapshot ?? {};
  const costs = plan.alchemy_method_costs ?? {};
  if (snapshot.monthly_compute_unit_limit !== 30_000_000 || snapshot.compute_units_used_at_capture !== 2_340 ||
      snapshot.throughput_limit_cu_per_second !== 300 ||
      ["getSignatureStatuses", "getBlockHeight", "getLatestBlockhash", "sendTransaction", "getHealth"].some(method => costs[method] !== 20)) {
    throw new Error("M2 Alchemy plan snapshot or method costs are invalid");
  }
  const readerPoll = workload.planned_units * polls * (costs.getSignatureStatuses + costs.getBlockHeight);
  const submission = workload.alchemy_submission_units * costs.sendTransaction;
  const blockhash = workload.alchemy_submission_units * costs.getLatestBlockhash;
  const healthChecks = workload.health_check_days * 24 * 60 * workload.observers * workload.health_checks_per_minute_per_observer;
  const health = healthChecks * costs.getHealth;
  const total = readerPoll + submission + blockhash + health;
  const contingency = Math.ceil((total * 11) / 10);
  const usedPlus = snapshot.compute_units_used_at_capture + contingency;
  const headroom = snapshot.monthly_compute_unit_limit - usedPlus;
  const estimate = plan.alchemy_upper_estimate ?? {};
  if (estimate.reader_poll_compute_units !== readerPoll || estimate.submission_compute_units !== submission ||
      estimate.latest_blockhash_compute_units !== blockhash || estimate.health_check_compute_units !== health ||
      estimate.total_compute_units !== total || estimate.total_with_ten_percent_contingency !== contingency ||
      estimate.used_plus_contingency !== usedPlus || estimate.remaining_headroom_compute_units !== headroom || headroom <= 0) {
    throw new Error("M2 Alchemy quota arithmetic is invalid");
  }
  const offsets = plan.deterministic_cycle_offsets ?? [];
  if (offsets.length !== 6 || JSON.stringify(offsets.map(item => item.offset_seconds)) !== "[0,20,40,60,80,100]" ||
      new Set(offsets.map(item => `${item.observer_id}:${item.route_id}`)).size !== 6 ||
      offsets.some(item => !OBSERVERS.includes(item.observer_id) || !ROUTES.includes(item.route_id))) {
    throw new Error("M2 deterministic cycle offsets are invalid");
  }
  const burst = plan.burst_bounds ?? {};
  if (burst.alchemy_max_compute_units_per_second !== 240 || burst.alchemy_limit_compute_units_per_second !== 300 ||
      burst.solana_public_max_requests_per_second !== 26 || burst.solana_public_observed_header_limit_requests_per_second !== 250 ||
      burst.requires_deterministic_offsets !== true || burst.alchemy_max_compute_units_per_second >= burst.alchemy_limit_compute_units_per_second) {
    throw new Error("M2 burst bound is invalid");
  }
  if (plan.decision?.zero_incremental_spend_estimate_fits_current_plan !== true ||
      plan.decision?.quota_approval !== "PENDING_READER_TOPOLOGY_DECISION_AND_OPERATOR_APPROVAL" ||
      plan.decision?.authorizes_spend !== false || plan.decision?.authorizes_rehearsal !== false ||
      plan.decision?.authorizes_official_window !== false || plan.milestone_2_started !== false) {
    throw new Error("M2 quota estimate cannot authorize spend or execution");
  }
  return { status: "PASS", gate: "GRANT_M2_RESOURCE_QUOTA_ESTIMATE", estimatedComputeUnitsWithContingency: contingency, remainingHeadroomComputeUnits: headroom, quotaApproved: false, milestone2Started: false };
}
