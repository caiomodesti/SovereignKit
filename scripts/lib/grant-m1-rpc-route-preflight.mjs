export const GRANT_M1_RPC_ROUTE_PREFLIGHT_VERSION = "GrantM1RpcRoutePreflight@0.1.0";

const RPC_METHODS = Object.freeze([
  ["getHealth", []],
  ["getGenesisHash", []],
  ["getVersion", []],
  ["getSlot", [{ commitment: "finalized" }]],
]);

export function validateGrantRpcEndpoint(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("RPC endpoint must be one non-empty trimmed URL");
  }
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:") throw new Error("grant RPC endpoint must use HTTPS");
  if (endpoint.username !== "" || endpoint.password !== "") {
    throw new Error("grant RPC endpoint must not use URL userinfo credentials");
  }
  if (endpoint.search !== "" || endpoint.hash !== "") {
    throw new Error("grant RPC endpoint must not use query strings or fragments");
  }
  return endpoint;
}

export function sanitizeGrantRpcEndpoint(value) {
  return validateGrantRpcEndpoint(value).origin;
}

export async function runGrantRpcRoutePreflight({
  endpoint,
  routeId,
  providerLabel,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date().toISOString(),
  timeoutMs = 10_000,
}) {
  const parsedEndpoint = validateGrantRpcEndpoint(endpoint);
  if (typeof routeId !== "string" || !/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(routeId)) {
    throw new Error("route ID must contain 3-64 lowercase letters, digits, dots, underscores, or hyphens");
  }
  if (typeof providerLabel !== "string" || providerLabel.trim().length < 2) {
    throw new Error("provider label must be explicit");
  }
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");

  const responses = {};
  for (const [method, params] of RPC_METHODS) {
    responses[method] = await requestRpc({
      endpoint: parsedEndpoint.href,
      method,
      params,
      fetchImpl,
      timeoutMs,
    });
  }

  if (responses.getHealth !== "ok") throw new Error("RPC getHealth did not return ok");
  if (typeof responses.getGenesisHash !== "string" || responses.getGenesisHash.length < 20) {
    throw new Error("RPC getGenesisHash returned an invalid value");
  }
  if (
    responses.getVersion === null
    || typeof responses.getVersion !== "object"
    || typeof responses.getVersion["solana-core"] !== "string"
  ) {
    throw new Error("RPC getVersion returned an invalid value");
  }
  if (typeof responses.getSlot !== "number" && typeof responses.getSlot !== "bigint") {
    throw new Error("RPC getSlot returned an invalid value");
  }

  return {
    schema_version: GRANT_M1_RPC_ROUTE_PREFLIGHT_VERSION,
    captured_at: capturedAt,
    scope: "SINGLE_LOGICAL_RPC_ROUTE_PREFLIGHT_ONLY",
    route_id: routeId,
    logical_endpoint_origin: parsedEndpoint.origin,
    transport: "https_json_rpc",
    provider_label: providerLabel,
    health: "ok",
    genesis_hash: responses.getGenesisHash,
    solana_core_version: responses.getVersion["solana-core"],
    feature_set: responses.getVersion["feature-set"] ?? null,
    finalized_slot: String(responses.getSlot),
    methods_checked: RPC_METHODS.map(([method]) => method),
    credential_material_persisted: false,
    operational_independence_established: false,
    milestone_acceptance_effect: "NONE",
  };
}

async function requestRpc({ endpoint, method, params, fetchImpl, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(`RPC request failed for ${method}`);
  }
  if (!response.ok) throw new Error(`RPC request returned HTTP ${response.status} for ${method}`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`RPC response was not JSON for ${method}`);
  }
  if (payload === null || typeof payload !== "object" || payload.jsonrpc !== "2.0") {
    throw new Error(`RPC response envelope was invalid for ${method}`);
  }
  if (payload.error !== undefined) throw new Error(`RPC returned an error for ${method}`);
  if (!("result" in payload)) throw new Error(`RPC response omitted result for ${method}`);
  return payload.result;
}
