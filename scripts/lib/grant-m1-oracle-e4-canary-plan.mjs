export const GRANT_M1_ORACLE_E4_CANARY_PLAN_VERSION = "GrantM1OracleE4CollectorCanaryPlan@0.5.0";

const nearlyEqual = (left, right) => Math.abs(left - right) <= 0.000001;

export function validateGrantM1OracleE4CanaryPlan(plan) {
  if (plan === null || typeof plan !== "object") throw new Error("Oracle E4 canary plan must be an object");
  if (plan.schema_version !== GRANT_M1_ORACLE_E4_CANARY_PLAN_VERSION) throw new Error("Oracle E4 canary plan version is invalid");
  if (plan.status !== "PROVISIONED_CANARY_NOT_ADMITTED" || plan.scope !== "COLLECTOR_CANARY_ONLY") {
    throw new Error("Oracle E4 canary must remain a provisioned but unadmitted Collector-only canary");
  }
  if (plan.billing_authorized_by_repository !== false ||
      plan.operator_spend_authorization !== "CONFIRMED_OUT_OF_BAND_WITH_DOCUMENTED_ESTIMATOR_LIMITATION") {
    throw new Error("repository plan cannot authorize Oracle billing");
  }

  const provider = plan.provider ?? {};
  if (provider.provider_id !== "oracle" || provider.region !== "sa-saopaulo-1" || provider.account_plan_required !== "PAY_AS_YOU_GO") {
    throw new Error("Oracle provider boundary is invalid");
  }

  const candidate = plan.candidate ?? {};
  if (candidate.role !== "COLLECTOR" || candidate.shape !== "VM.Standard.E4.Flex" || candidate.architecture !== "x86_64") {
    throw new Error("Oracle E4 candidate shape or role is invalid");
  }
  if (candidate.ocpu !== 1 || candidate.memory_gib !== 4 || candidate.burstable_baseline_fraction !== 0.125 || candidate.boot_volume_gib < 46) {
    throw new Error("Oracle E4 candidate resources drifted from the bounded canary");
  }
  if (candidate.provisioned !== true || candidate.admitted !== false || candidate.public_ingress_enabled !== false || candidate.health_loopback_only !== true) {
    throw new Error("Oracle canary must be provisioned without claiming admission or public exposure");
  }

  const pricing = plan.pricing_snapshot ?? {};
  const computedMonthly = (pricing.ocpu_hourly_brl * candidate.burstable_baseline_fraction * candidate.ocpu +
    pricing.memory_gib_hourly_brl * candidate.memory_gib) * pricing.monthly_hours;
  if (pricing.currency !== "BRL" || pricing.monthly_hours !== 730 || !nearlyEqual(computedMonthly, pricing.estimated_compute_monthly_brl)) {
    throw new Error("Oracle E4 monthly estimate is inconsistent");
  }
  if (pricing.maximum_console_estimate_monthly_brl !== 60 || pricing.maximum_console_estimate_monthly_brl < computedMonthly) {
    throw new Error("Oracle E4 budget ceiling is invalid");
  }
  if (!nearlyEqual(pricing.estimated_burstable_total_monthly_brl, computedMonthly + pricing.estimated_boot_volume_monthly_brl) ||
      pricing.estimated_burstable_total_monthly_brl >= pricing.maximum_console_estimate_monthly_brl ||
      pricing.live_console_full_rate_estimate_monthly_brl !== 131.21 ||
      pricing.live_console_estimator_applies_burstable_baseline !== false) {
    throw new Error("Oracle E4 estimator limitation or burstable total is inconsistent");
  }
  if (!Array.isArray(pricing.excluded) || pricing.excluded.length < 4) throw new Error("Oracle E4 excluded-cost boundary is incomplete");

  const provisioning = plan.provisioning_gates ?? {};
  for (const field of [
    "pay_as_you_go_active",
    "shape_visible_in_region",
    "console_estimate_verified",
    "budget_alert_enabled",
    "operator_final_create_confirmation",
    "official_burstable_calculation_within_ceiling",
  ]) {
    if (provisioning[field] !== true) throw new Error(`observed Oracle E4 gate ${field} must remain true`);
  }
  if (provisioning.console_estimate_within_ceiling !== false) throw new Error("full-rate Console estimate must not be presented as within ceiling");
  if (provisioning.reuse_dedicated_vcn_and_nsg !== true || provisioning.ssh_ingress_restricted_to_operator_cidr !== true) {
    throw new Error("Oracle E4 network safety boundary is invalid");
  }

  const admission = plan.admission_gates ?? {};
  if (admission.canary_soak_minimum_seconds !== 86_400) throw new Error("Oracle E4 canary soak cannot be shorter than 24 hours");
  for (const field of ["versioned_host_preflight_passed", "collector_durable_replay_recovery_passed"]) {
    if (admission[field] !== true) throw new Error(`observed Oracle E4 admission evidence ${field} must remain true`);
  }
  if (admission.canary_soak_passed !== false) throw new Error("Oracle E4 soak must remain unpassed until a complete real-host summary exists");
  for (const field of ["basic_live_preflight_passed", "service_restart_recovery_passed", "sanitized_evidence_retained"]) {
    if (admission[field] !== true) throw new Error(`observed Oracle E4 evidence ${field} must remain true`);
  }
  for (const field of ["full_vm_restart_recovery_passed", "restart_recovery_passed"]) {
    if (admission[field] !== false) throw new Error(`unverified Oracle E4 evidence ${field} must remain false`);
  }

  const boundaries = plan.methodology_boundaries ?? {};
  if (boundaries.collector_is_not_an_observer !== true || boundaries.observer_independence_effect !== "NONE" ||
      boundaries.milestone_1_acceptance_effect_before_admission !== "NONE" || boundaries.milestone_2_started !== false) {
    throw new Error("Oracle E4 methodology boundary is invalid");
  }

  return {
    status: "PASS",
    gate: "GRANT_M1_ORACLE_E4_COLLECTOR_CANARY_PLAN",
    estimatedComputeMonthlyBrl: computedMonthly,
    maximumConsoleEstimateMonthlyBrl: pricing.maximum_console_estimate_monthly_brl,
    provisioned: true,
    admitted: false,
  };
}
