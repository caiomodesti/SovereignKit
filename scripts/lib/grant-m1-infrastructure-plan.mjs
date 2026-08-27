export const GRANT_M1_INFRASTRUCTURE_PLAN_VERSION = "GrantM1InfrastructurePlan@0.1.0";

export function validateGrantM1InfrastructurePlan(plan) {
  if (plan === null || typeof plan !== "object") throw new Error("infrastructure plan must be an object");
  if (plan.schema_version !== GRANT_M1_INFRASTRUCTURE_PLAN_VERSION) throw new Error("infrastructure plan version is invalid");
  if (plan.status !== "PLANNED_NOT_PROVISIONED") throw new Error("unprovisioned infrastructure plan must retain its explicit status");
  if (plan.billing_authorized !== false) throw new Error("repository plan cannot authorize provider billing");
  if (plan.activation_policy?.mode !== "PAID_FALLBACK_ONLY" ||
      plan.activation_policy?.zero_cost_review_required !== true ||
      plan.activation_policy?.benefit_inventory_status !== "IN_PROGRESS_NON_BLOCKING" ||
      plan.activation_policy?.free_tier_eligibility !== "RESEARCH_COMPLETE_ACCOUNT_VALIDATION_REQUIRED" ||
      plan.activation_policy?.operator_spend_authorization !== "NOT_AUTHORIZED") {
    throw new Error("paid infrastructure must remain blocked behind the zero-cost review");
  }
  if (!Array.isArray(plan.components)) throw new Error("infrastructure components are required");

  const ids = plan.components.map(component => component.component_id);
  if (new Set(ids).size !== ids.length) throw new Error("infrastructure component IDs must be unique");
  if (plan.components.some(component => component.provisioned !== false)) {
    throw new Error("planned infrastructure cannot claim a component is provisioned");
  }

  const observers = plan.components.filter(component => component.role === "OBSERVER");
  const collectors = plan.components.filter(component => component.role === "COLLECTOR");
  if (observers.length !== plan.constraints?.required_observer_count || observers.length < 3) {
    throw new Error("infrastructure plan must contain exactly the required observer count");
  }
  const observerProviders = new Set(observers.map(observer => observer.provider_id));
  if (observerProviders.size !== plan.constraints?.required_distinct_observer_providers || observerProviders.size < 3) {
    throw new Error("observer providers are not operationally distinct in the plan");
  }
  if (collectors.length !== 1 || plan.constraints?.collector_is_not_an_observer !== true) {
    throw new Error("infrastructure plan must contain one non-observer Collector");
  }
  const collector = collectors[0];
  if (collector.public_ingress_path !== "/v0/probe-results" || collector.health_loopback_only !== true) {
    throw new Error("Collector exposure boundary is invalid");
  }

  const estimatedCents = plan.components.reduce(
    (sum, component) => sum + Math.round(component.base_monthly_usd * 100),
    0,
  );
  const estimated = estimatedCents / 100;
  if (Math.abs(estimated - plan.budget?.estimated_base_monthly) > 0.001) {
    throw new Error("infrastructure base estimate does not match component prices");
  }
  if (plan.budget?.proposed_monthly_ceiling < estimated) throw new Error("proposed budget ceiling is below the base estimate");
  if (!String(plan.constraints?.known_failure_coupling ?? "").includes("Collector")) {
    throw new Error("central Collector failure coupling must remain explicit");
  }
  if (plan.external_requirements?.billing_method !== "REQUIRED_NOT_AUTHORIZED") {
    throw new Error("billing must remain an external operator requirement");
  }
  return {
    status: "PASS",
    gate: "GRANT_M1_INFRASTRUCTURE_PLAN",
    observers: observers.length,
    distinctObserverProviders: observerProviders.size,
    collectors: collectors.length,
    estimatedBaseMonthlyUsd: estimated,
    proposedMonthlyCeilingUsd: plan.budget.proposed_monthly_ceiling,
    provisionedComponents: 0,
  };
}
