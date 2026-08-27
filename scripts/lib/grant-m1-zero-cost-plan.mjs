export const GRANT_M1_ZERO_COST_PLAN_VERSION = "GrantM1ZeroCostCandidatePlan@0.1.0";

const IDENTIFIER = /^[a-z0-9-]{1,100}$/u;
const ALLOWED_OFFER_MODELS = new Set(["TIME_LIMITED_TRIAL", "ALWAYS_FREE", "ALWAYS_FREE_LIMITED"]);
const ALLOWED_ARCHITECTURES = new Set(["x64", "arm64"]);
const ALLOWED_REFERENCE_HOSTS = new Set(["aws.amazon.com", "docs.cloud.google.com", "docs.oracle.com"]);
const ALLOWED_RISKS = new Set([
  "ACCOUNT_ELIGIBILITY_UNVERIFIED",
  "ARM64_COMPATIBILITY",
  "BILLING_ACCOUNT_REQUIRED",
  "CAPACITY_UNAVAILABLE",
  "HOME_REGION_ONLY",
  "IDLE_RECLAMATION",
  "LOW_MEMORY",
  "MONTHLY_EGRESS_LIMIT",
  "OFFER_MUTABILITY",
  "TRIAL_EXPIRY_AUTO_BILLING",
]);
const COMMON_GATES = new Set(["ACCOUNT_ELIGIBILITY_VERIFIED", "BUDGET_GUARD_ACTIVE"]);

export function validateGrantM1ZeroCostPlan(plan) {
  if (plan === null || typeof plan !== "object" || Array.isArray(plan)) throw new Error("zero-cost plan must be an object");
  if (plan.schema_version !== GRANT_M1_ZERO_COST_PLAN_VERSION) throw new Error("zero-cost plan version is invalid");
  if (plan.status !== "RESEARCH_COMPLETE_ACCOUNT_VALIDATION_REQUIRED") throw new Error("zero-cost plan must not claim account validation");
  if (!isCanonicalTimestamp(plan.researched_at)) throw new Error("zero-cost research timestamp must be canonical");
  if (plan.cash_spend_authorized !== false || plan.target_cash_monthly_usd !== 0) throw new Error("zero-cost plan cannot authorize spend");
  if (plan.admission_policy?.required_observer_count !== 3 ||
      plan.admission_policy?.required_distinct_observer_providers !== 3 ||
      plan.admission_policy?.host_preflight_required !== true ||
      plan.admission_policy?.observer_canary_minimum_seconds !== 86_400 ||
      plan.admission_policy?.paid_fallback_activation !== "EXPLICIT_OPERATOR_APPROVAL_ONLY") {
    throw new Error("zero-cost admission policy is invalid");
  }
  if (!Array.isArray(plan.components) || plan.components.length !== 4) throw new Error("zero-cost plan must contain four candidate components");

  const ids = new Set();
  for (const component of plan.components) validateComponent(component, ids);
  const observers = plan.components.filter(component => component.role === "OBSERVER");
  const collectors = plan.components.filter(component => component.role === "COLLECTOR");
  if (observers.length !== 3 || collectors.length !== 1) throw new Error("zero-cost plan must contain three observers and one Collector");
  const observerProviders = new Set(observers.map(component => component.provider_id));
  if (observerProviders.size !== 3) throw new Error("zero-cost observers must use three distinct providers");

  const oracleComponents = plan.components.filter(component => component.provider_id === "oracle");
  const oracleOcpu = oracleComponents.reduce((sum, component) => sum + (component.resource_target.ocpu ?? 0), 0);
  const oracleMemoryMib = oracleComponents.reduce((sum, component) => sum + component.resource_target.memory_mib, 0);
  const oracleStorageGib = oracleComponents.reduce((sum, component) => sum + component.resource_target.storage_gib, 0);
  if (oracleComponents.length !== 2 || oracleOcpu > 2 || oracleMemoryMib > 12_288 || oracleStorageGib > 200) {
    throw new Error("Oracle candidates exceed the documented Always Free aggregate allowance");
  }
  if (!String(plan.known_failure_coupling ?? "").includes("Collector") || !String(plan.known_failure_coupling).includes("Oracle")) {
    throw new Error("Oracle Collector coupling must remain explicit");
  }
  const expectedOrder = plan.components.map(component => component.component_id);
  if (!Array.isArray(plan.provisioning_order) || plan.provisioning_order.length !== expectedOrder.length ||
      plan.provisioning_order.some((value, index) => value !== expectedOrder[index])) {
    throw new Error("zero-cost provisioning order must be frozen and Collector-first");
  }
  if (plan.fallback?.plan_file !== "deploy/grant-pilot/infrastructure-plan.json" ||
      plan.fallback?.activation !== "EXPLICIT_OPERATOR_APPROVAL_ONLY" ||
      plan.fallback?.proposed_monthly_ceiling_usd !== 50) {
    throw new Error("paid fallback boundary is invalid");
  }

  return {
    status: "PASS",
    gate: "GRANT_M1_ZERO_COST_CANDIDATES",
    candidates: plan.components.length,
    observers: observers.length,
    distinctObserverProviders: observerProviders.size,
    collectors: collectors.length,
    admittedComponents: 0,
    provisionedComponents: 0,
    authorizedMonthlySpendUsd: 0,
  };
}

function validateComponent(component, ids) {
  if (component === null || typeof component !== "object" || Array.isArray(component)) throw new Error("zero-cost component is invalid");
  if (!IDENTIFIER.test(component.component_id) || ids.has(component.component_id)) throw new Error("zero-cost component ID is invalid or duplicated");
  ids.add(component.component_id);
  if (component.role !== "OBSERVER" && component.role !== "COLLECTOR") throw new Error("zero-cost component role is invalid");
  if (!IDENTIFIER.test(component.provider_id)) throw new Error("zero-cost provider ID is invalid");
  if (!ALLOWED_OFFER_MODELS.has(component.offer_model)) throw new Error("zero-cost offer model is invalid");
  const reference = new URL(component.offer_reference);
  if (reference.protocol !== "https:" || !ALLOWED_REFERENCE_HOSTS.has(reference.hostname) || reference.username || reference.password || reference.hash) {
    throw new Error("zero-cost offer reference must be an official HTTPS page");
  }
  if (component.account_eligibility !== "UNVERIFIED" || component.provisioned !== false || component.admitted !== false) {
    throw new Error("zero-cost candidate cannot claim eligibility, provisioning, or admission");
  }
  if (component.expected_cash_monthly_usd !== 0 || !ALLOWED_ARCHITECTURES.has(component.architecture)) {
    throw new Error("zero-cost component cost or architecture is invalid");
  }
  if (!Number.isSafeInteger(component.resource_target?.memory_mib) || component.resource_target.memory_mib < 1024 ||
      !Number.isSafeInteger(component.resource_target?.storage_gib) || component.resource_target.storage_gib < 30) {
    throw new Error("zero-cost component resources are below the candidate floor");
  }
  if (!Array.isArray(component.required_gates) || !Array.isArray(component.risk_codes) || component.risk_codes.length === 0 ||
      component.risk_codes.some(code => !ALLOWED_RISKS.has(code))) {
    throw new Error("zero-cost component gates or risks are invalid");
  }
  for (const gate of COMMON_GATES) if (!component.required_gates.includes(gate)) throw new Error(`zero-cost component is missing ${gate}`);
  if (component.role === "OBSERVER" && (!component.required_gates.includes("HOST_PREFLIGHT_PASS") || !component.required_gates.includes("CANARY_24H_PASS"))) {
    throw new Error("zero-cost observer is missing host admission gates");
  }
  if (component.role === "COLLECTOR" && (!component.required_gates.includes("COLLECTOR_RECOVERY_PASS") || !component.required_gates.includes("TLS_HOSTNAME_CONTROLLED"))) {
    throw new Error("zero-cost Collector is missing recovery or TLS gates");
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
