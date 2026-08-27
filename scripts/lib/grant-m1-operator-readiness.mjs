const REQUIRED_PROVIDERS = ["aws", "digitalocean", "hetzner"];
const FORBIDDEN_FIELD_PATTERN = /(api.?key|password|private.?key|secret|token|payment.?card|endpoint)/iu;

function visit(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_PATTERN.test(key)) {
      throw new Error(`operator readiness must not contain sensitive field ${path}.${key}`);
    }
    visit(entry, `${path}.${key}`);
  }
}

export function evaluateGrantM1OperatorReadiness(document) {
  if (document?.schema_version !== "GrantM1OperatorReadiness@0.1.0") {
    throw new Error("unsupported operator readiness schema");
  }
  visit(document);

  if (document.monthly_ceiling_usd !== 50) {
    throw new Error("operator ceiling must match the frozen USD 50 infrastructure guard");
  }
  if (!Array.isArray(document.provider_accounts) || document.provider_accounts.length !== 3) {
    throw new Error("operator readiness requires exactly three provider accounts");
  }

  const providers = [...document.provider_accounts].sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  if (providers.map(provider => provider.provider_id).join(",") !== [...REQUIRED_PROVIDERS].sort().join(",")) {
    throw new Error("operator provider accounts must be AWS, DigitalOcean, and Hetzner");
  }

  const blockers = [];
  if (document.billing_approved !== true || typeof document.billing_approved_at !== "string") {
    blockers.push("billing approval with timestamp");
  }
  for (const provider of providers) {
    for (const field of ["account_owner_verified", "mfa_enabled", "billing_method_verified", "budget_alert_enabled"]) {
      if (provider[field] !== true) blockers.push(`${provider.provider_id}.${field}`);
    }
  }

  const hostname = document.collector_hostname;
  if (!hostname || hostname.controlled_by_operator !== true || hostname.dns_ready !== true) {
    blockers.push("controlled collector hostname and DNS");
  }
  if (hostname?.value !== null && (typeof hostname.value !== "string" || hostname.value.length < 4)) {
    throw new Error("collector hostname must be null or a non-empty hostname");
  }
  if (document.host_key_custody_acknowledged !== true) blockers.push("host key custody acknowledgement");
  if (document.provisioning_approved !== true || typeof document.provisioning_approved_at !== "string") {
    blockers.push("explicit provisioning approval with timestamp");
  }

  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? "READY_TO_PROVISION" : "ACTION_REQUIRED",
    blockers
  };
}
