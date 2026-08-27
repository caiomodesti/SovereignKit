export const GRANT_M1_ZERO_COST_ACCOUNT_READINESS_VERSION = "GrantM1ZeroCostAccountReadiness@0.1.0";

const REQUIRED_PROVIDERS = ["aws", "google-cloud", "oracle"];
const REQUIRED_PROVIDER_FIELDS = [
  "account_owner_verified",
  "mfa_enabled",
  "offer_terms_reviewed",
  "candidate_offer_visible",
  "billing_guard_active",
  "expiration_exit_control_recorded",
];
const FORBIDDEN_FIELD_PATTERN = /(api.?key|password|private.?key|secret|token|payment.?card|recovery.?code|full.?endpoint)/iu;

export function evaluateGrantM1ZeroCostAccountReadiness(document) {
  if (document?.schema_version !== GRANT_M1_ZERO_COST_ACCOUNT_READINESS_VERSION) {
    throw new Error("unsupported zero-cost account readiness schema");
  }
  visit(document);
  if (document.cash_spend_authorized !== false) throw new Error("zero-cost readiness cannot authorize cash spend");
  if (!Array.isArray(document.provider_accounts) || document.provider_accounts.length !== 3) {
    throw new Error("zero-cost readiness requires exactly three provider accounts");
  }
  const providers = [...document.provider_accounts].sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  if (providers.map(provider => provider.provider_id).join(",") !== [...REQUIRED_PROVIDERS].sort().join(",")) {
    throw new Error("zero-cost provider accounts must be AWS, Google Cloud, and Oracle");
  }

  const blockers = [];
  for (const provider of providers) {
    for (const field of REQUIRED_PROVIDER_FIELDS) if (provider[field] !== true) blockers.push(`${provider.provider_id}.${field}`);
  }
  const hostname = document.collector_hostname_plan;
  if (!hostname || hostname.controlled_by_operator !== true || hostname.conventional_dns !== true) {
    blockers.push("controlled conventional Collector hostname plan");
  }
  if (hostname?.value !== null && !isHostname(hostname.value)) throw new Error("Collector hostname must be null or a valid hostname");
  if (document.host_key_custody_acknowledged !== true) blockers.push("host key custody acknowledgement");
  if (document.free_price_is_not_independence_acknowledged !== true) blockers.push("free price independence boundary acknowledgement");
  if (document.provisioning_approved !== true || !isCanonicalTimestamp(document.provisioning_approved_at)) {
    blockers.push("explicit zero-cost provisioning approval with timestamp");
  }

  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? "READY_FOR_ZERO_COST_PROVISIONING" : "ACTION_REQUIRED",
    blockers,
  };
}

function visit(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_PATTERN.test(key)) throw new Error(`zero-cost readiness must not contain sensitive field ${path}.${key}`);
    visit(entry, `${path}.${key}`);
  }
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isHostname(value) {
  return typeof value === "string" && value.length <= 253 && value.split(".").length >= 2 &&
    value.split(".").every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u.test(label));
}
