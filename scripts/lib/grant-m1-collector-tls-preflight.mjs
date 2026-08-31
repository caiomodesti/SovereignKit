import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { connect } from "node:tls";

export const GRANT_M1_COLLECTOR_TLS_PREFLIGHT_VERSION = "GrantM1CollectorTlsPreflight@0.1.0";

const COMPONENT_ID = /^[A-Za-z0-9._:-]{1,160}$/u;
const RESERVED_SUFFIXES = [".invalid", ".test", ".localhost", ".local", ".internal", ".home.arpa"];

export function validateCollectorTlsOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) throw new Error("Collector origin must be a non-empty trimmed URL");
  const origin = new URL(value);
  if (origin.protocol !== "https:") throw new Error("Collector origin must use HTTPS");
  if (origin.username || origin.password || origin.search || origin.hash) throw new Error("Collector origin must not contain credentials, query, or fragment");
  if (origin.pathname !== "/" || (origin.port !== "" && origin.port !== "443")) throw new Error("Collector origin must use the HTTPS origin without a path or nonstandard port");
  const hostname = origin.hostname.toLowerCase();
  if (isIP(hostname) !== 0 || !hostname.includes(".") || RESERVED_SUFFIXES.some(suffix => hostname.endsWith(suffix))) {
    throw new Error("Collector origin must use a controlled public DNS hostname");
  }
  return origin;
}

export async function runGrantM1CollectorTlsPreflight({
  componentId,
  collectorOrigin,
  expectedAddress,
  capturedAt = new Date().toISOString(),
  timeoutMs = 10_000,
  resolveImpl = resolveCollectorAddresses,
  fetchImpl = globalThis.fetch,
  tlsInspectImpl = inspectCollectorTls,
}) {
  if (!COMPONENT_ID.test(componentId)) throw new Error("Collector component ID is invalid");
  const origin = validateCollectorTlsOrigin(collectorOrigin);
  if (isIP(expectedAddress) === 0) throw new Error("Expected Collector address must be one IPv4 or IPv6 address");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) throw new Error("TLS preflight timeout must be from 1000 to 30000 ms");
  const capturedTime = Date.parse(capturedAt);
  if (!Number.isFinite(capturedTime) || new Date(capturedTime).toISOString() !== capturedAt) throw new Error("TLS preflight timestamp must be canonical");

  const addresses = [...new Set(await resolveImpl(origin.hostname))];
  if (addresses.length === 0 || addresses.some(address => isIP(address) === 0)) throw new Error("Collector DNS resolution returned invalid addresses");
  if (!addresses.includes(expectedAddress)) throw new Error("Collector DNS does not resolve to the expected private evidence target");

  const tls = await tlsInspectImpl({ hostname: origin.hostname, port: 443, timeoutMs });
  if (tls.authorized !== true || !["TLSv1.2", "TLSv1.3"].includes(tls.protocol)) throw new Error("Collector TLS certificate is not publicly trusted with a supported protocol");
  const certificateValidUntil = Date.parse(tls.validTo);
  if (!Number.isFinite(certificateValidUntil) || certificateValidUntil - capturedTime < 86_400_000) throw new Error("Collector TLS certificate expires within 24 hours");

  const [redirect, health, wrongMethod, invalidPayload] = await Promise.all([
    request(fetchImpl, `http://${origin.hostname}/v0/probe-results`, { method: "GET", redirect: "manual" }, timeoutMs),
    request(fetchImpl, new URL("/health", origin), { method: "GET", redirect: "manual" }, timeoutMs),
    request(fetchImpl, new URL("/v0/probe-results", origin), { method: "GET", redirect: "manual" }, timeoutMs),
    request(fetchImpl, new URL("/v0/probe-results", origin), { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: "{}" }, timeoutMs),
  ]);
  const location = redirect.headers?.get?.("location") ?? null;
  if (![301, 308].includes(redirect.status) || location === null || !location.startsWith(`${origin.origin}/`)) throw new Error("Collector plaintext HTTP does not redirect to the controlled HTTPS origin");
  if (health.status !== 404) throw new Error("Collector health endpoint is publicly reachable");
  if (wrongMethod.status !== 404) throw new Error("Collector ingestion route accepts an unexpected method");
  if (invalidPayload.status !== 422) throw new Error("Collector TLS edge did not reach schema-validating ingestion");

  return {
    schema_version: GRANT_M1_COLLECTOR_TLS_PREFLIGHT_VERSION,
    component_id: componentId,
    captured_at: capturedAt,
    scope: "PRIVATE_COLLECTOR_TLS_EDGE_ONLY",
    collector_origin: origin.origin,
    resolved_address_count: addresses.length,
    expected_address_matched: true,
    expected_address_persisted: false,
    tls_authorized: true,
    tls_protocol: tls.protocol,
    certificate_valid_until: new Date(certificateValidUntil).toISOString(),
    http_redirect_status: redirect.status,
    public_health_status: health.status,
    wrong_method_status: wrongMethod.status,
    invalid_payload_status: invalidPayload.status,
    exposed_route: "POST /v0/probe-results",
    public_health_exposed: false,
    signed_result_submitted: false,
    observer_independence_established: false,
    milestone_acceptance_effect: "NONE",
  };
}

export async function resolveCollectorAddresses(hostname) {
  const [ipv4, ipv6] = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ]);
  return [...ipv4, ...ipv6];
}

export function inspectCollectorTls({ hostname, port, timeoutMs }) {
  return new Promise((resolveInspect, rejectInspect) => {
    const socket = connect({ host: hostname, port, servername: hostname, rejectUnauthorized: true });
    const timer = setTimeout(() => socket.destroy(new Error("Collector TLS inspection timed out")), timeoutMs);
    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const result = { authorized: socket.authorized, protocol: socket.getProtocol(), validTo: certificate.valid_to };
      clearTimeout(timer); socket.end(); resolveInspect(result);
    });
    socket.once("error", error => { clearTimeout(timer); rejectInspect(new Error("Collector TLS inspection failed", { cause: error })); });
  });
}

async function request(fetchImpl, url, init, timeoutMs) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Error("Collector TLS edge request failed", { cause: error });
  }
}
