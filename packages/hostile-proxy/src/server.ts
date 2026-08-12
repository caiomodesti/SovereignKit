import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { address } from "@solana/kit";

import { classifyControlledWireTransaction, hashPairNonce } from "./classifier.js";
import {
  HOSTILE_PROXY_VERSION,
  type ControlledHostileProxyConfig,
  type ProxyAuditEvent,
  type RunningControlledHostileProxy,
  type TransactionClassification,
} from "./types.js";

export async function startControlledHostileProxy(config: ControlledHostileProxyConfig): Promise<RunningControlledHostileProxy> {
  const runtimeConfig = snapshotConfig(config);
  const upstream = validateConfig(runtimeConfig);
  const auditEvents: ProxyAuditEvent[] = [];
  let auditSequence = 0;
  let activeRequests = 0;

  const record = (input: Omit<ProxyAuditEvent, "proxyVersion" | "eventId" | "sequence" | "receivedAt" | "modeType" | "scheduleId">): void => {
    const event: ProxyAuditEvent = {
      proxyVersion: HOSTILE_PROXY_VERSION,
      eventId: randomUUID(),
      sequence: auditSequence++,
      receivedAt: new Date().toISOString(),
      modeType: runtimeConfig.mode.type,
      scheduleId: runtimeConfig.mode.scheduleId,
      ...input,
    };
    auditEvents.push(Object.freeze(event));
    try { runtimeConfig.auditHook?.(event); } catch { /* routing evidence remains in the local trace */ }
  };

  const server = createServer(async (request, response) => {
    if (auditEvents.length >= runtimeConfig.limits.maxAuditEvents) {
      writeJson(response, 503, rpcError(null, -32097, "Controlled proxy audit capacity reached"));
      return;
    }
    if (activeRequests >= runtimeConfig.limits.maxConcurrentRequests) {
      recordAudit(record, "UNKNOWN", "RESOURCE_LIMIT", "concurrency limit reached", request.method ?? "UNKNOWN");
      writeJson(response, 503, rpcError(null, -32097, "Controlled proxy resource limit"));
      return;
    }
    activeRequests += 1;
    try {
      await handleRequest(request, response, runtimeConfig, upstream, record);
    } catch {
      recordAudit(record, "UNKNOWN", "UPSTREAM_ERROR", "unhandled proxy request failure", request.method ?? "UNKNOWN");
      if (!response.headersSent) writeJson(response, 502, rpcError(null, -32096, "Controlled proxy upstream failure"));
      else response.destroy();
    } finally {
      activeRequests -= 1;
    }
  });
  server.requestTimeout = runtimeConfig.limits.upstreamTimeoutMs + 1_000;
  server.headersTimeout = runtimeConfig.limits.upstreamTimeoutMs + 2_000;
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(runtimeConfig.bindPort, runtimeConfig.bindHost, () => { server.off("error", rejectListen); resolveListen(); });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("proxy did not bind a TCP address");
  return {
    url: `http://${runtimeConfig.bindHost === "::1" ? "[::1]" : runtimeConfig.bindHost}:${address.port}`,
    get auditEvents() { return [...auditEvents]; },
    close: () => new Promise<void>((resolveClose, rejectClose) => server.close(error => error === undefined ? resolveClose() : rejectClose(error))),
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: ControlledHostileProxyConfig,
  upstream: URL,
  record: (input: Omit<ProxyAuditEvent, "proxyVersion" | "eventId" | "sequence" | "receivedAt" | "modeType" | "scheduleId">) => void,
): Promise<void> {
  if (request.method !== "POST" || request.url !== "/") {
    recordAudit(record, "UNKNOWN", "INVALID_REQUEST", "only POST / is accepted", request.method ?? "UNKNOWN");
    writeJson(response, 405, rpcError(null, -32600, "Invalid Request"));
    return;
  }
  const body = await readLimitedBody(request, config.limits.maxRequestBytes);
  if (body === undefined) {
    recordAudit(record, "UNKNOWN", "RESOURCE_LIMIT", "request body limit exceeded", "POST");
    writeJson(response, 413, rpcError(null, -32097, "Controlled proxy request limit"));
    return;
  }
  const envelope = parseRpcEnvelope(body);
  if (envelope === undefined) {
    recordAudit(record, "UNKNOWN", "INVALID_REQUEST", "invalid JSON-RPC envelope", "POST");
    const outcome = await forwardRaw(body, response, config, upstream);
    if (outcome !== "FORWARDED") recordAudit(record, "UNKNOWN", "UPSTREAM_ERROR", outcome, "POST");
    return;
  }
  const classification = classifyEnvelope(envelope, config.controlledProgramAddress);
  if (shouldReject(config, classification)) {
    const controlled = classification.kind === "CONTROLLED" ? classification.value : undefined;
    record({
      requestMethod: envelope.method,
      decision: "REJECTED",
      classification: controlled?.classification ?? "UNKNOWN",
      ...(controlled === undefined ? {} : { pairNonceHash: hashPairNonce(controlled.pairNonceHex) }),
      reason: `precommitted schedule ${config.mode.scheduleId}`,
    });
    writeJson(response, 200, rpcError(envelope.id, -32098, "Controlled experiment rejection"));
    return;
  }
  record({
    requestMethod: envelope.method,
    decision: "PASS_THROUGH",
    classification: classification.kind === "CONTROLLED" ? classification.value.classification : "UNKNOWN",
    ...(classification.kind === "CONTROLLED" ? { pairNonceHash: hashPairNonce(classification.value.pairNonceHex) } : {}),
    reason: classification.kind === "UNKNOWN" ? classification.reason : "mode permits controlled transaction",
  });
  const outcome = await forwardRaw(body, response, config, upstream);
  if (outcome !== "FORWARDED") recordAudit(record, classification.kind === "CONTROLLED" ? classification.value.classification : "UNKNOWN", "UPSTREAM_ERROR", outcome, envelope.method);
}

function classifyEnvelope(envelope: RpcEnvelope, programAddress: string): TransactionClassification {
  if (envelope.method !== "sendTransaction") return { kind: "UNKNOWN", reason: "JSON-RPC method is not sendTransaction" };
  const transaction = envelope.params?.[0];
  if (typeof transaction !== "string") return { kind: "UNKNOWN", reason: "sendTransaction payload is not a string" };
  return classifyControlledWireTransaction(transaction, programAddress);
}

function shouldReject(config: ControlledHostileProxyConfig, classification: TransactionClassification): boolean {
  if (classification.kind !== "CONTROLLED") return false;
  if (config.mode.type === "PASS_THROUGH") return false;
  if (config.mode.type === "REJECT_CLASS") return classification.value.classification === config.mode.transactionClass;
  return config.mode.rejectPairNonceHexes.has(classification.value.pairNonceHex);
}

async function forwardRaw(body: Buffer, response: ServerResponse, config: ControlledHostileProxyConfig, upstream: URL): Promise<"FORWARDED" | "UPSTREAM_TIMEOUT_OR_FAILURE" | "UPSTREAM_RESPONSE_LIMIT"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.limits.upstreamTimeoutMs);
  try {
    const upstreamResponse = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: Uint8Array.from(body),
      signal: controller.signal,
      redirect: "error",
    });
    const responseBytes = await readLimitedResponse(upstreamResponse, config.limits.maxResponseBytes);
    if (responseBytes === undefined) {
      writeJson(response, 502, rpcError(null, -32097, "Controlled proxy response limit"));
      return "UPSTREAM_RESPONSE_LIMIT";
    }
    response.statusCode = upstreamResponse.status;
    response.setHeader("content-type", upstreamResponse.headers.get("content-type") ?? "application/json");
    response.setHeader("content-length", responseBytes.length);
    response.end(responseBytes);
    return "FORWARDED";
  } catch {
    writeJson(response, 502, rpcError(null, -32096, "Controlled proxy upstream failure"));
    return "UPSTREAM_TIMEOUT_OR_FAILURE";
  } finally {
    clearTimeout(timer);
  }
}

function validateConfig(config: ControlledHostileProxyConfig): URL {
  if (config.bindHost !== "127.0.0.1" && config.bindHost !== "::1") throw new Error("proxy must bind to loopback");
  if (!Number.isInteger(config.bindPort) || config.bindPort < 0 || config.bindPort > 65_535) throw new Error("invalid bind port");
  if (!config.allowedUpstreamUrls.includes(config.upstreamUrl)) throw new Error("upstream is not allowlisted");
  const upstream = new URL(config.upstreamUrl);
  if (upstream.protocol !== "http:" || !isLoopbackHostname(upstream.hostname) || upstream.username !== "" || upstream.password !== "") {
    throw new Error("upstream must be credential-free loopback HTTP");
  }
  const limits = Object.values(config.limits);
  if (!limits.every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("proxy limits must be positive safe integers");
  if (config.mode.scheduleId.length === 0) throw new Error("precommitted scheduleId is required");
  if (config.mode.type === "REJECT_CLASS" && config.mode.transactionClass !== "PROGRAM_X") throw new Error("selective mode may reject only PROGRAM_X");
  address(config.controlledProgramAddress);
  if (config.mode.type === "GENERAL_DEGRADATION" && [...config.mode.rejectPairNonceHexes].some(value => !/^[a-f0-9]{32}$/.test(value))) {
    throw new Error("general degradation schedule contains an invalid pair nonce");
  }
  if (config.mode.type === "GENERAL_DEGRADATION" && config.mode.rejectPairNonceHexes.size > 10_000) throw new Error("general degradation schedule is too large");
  return upstream;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

async function readLimitedBody(request: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > limit) { request.resume(); return undefined; }
  const chunks: Buffer[] = [];
  let size = 0;
  let exceeded = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) exceeded = true;
    if (!exceeded) chunks.push(buffer);
  }
  return exceeded ? undefined : Buffer.concat(chunks);
}

async function readLimitedResponse(response: Response, limit: number): Promise<Uint8Array | undefined> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > limit) { await reader.cancel(); return undefined; }
    chunks.push(next.value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return combined;
}

function snapshotConfig(config: ControlledHostileProxyConfig): ControlledHostileProxyConfig {
  return {
    ...config,
    allowedUpstreamUrls: [...config.allowedUpstreamUrls],
    limits: { ...config.limits },
    mode: config.mode.type === "GENERAL_DEGRADATION"
      ? { ...config.mode, rejectPairNonceHexes: new Set(config.mode.rejectPairNonceHexes) }
      : { ...config.mode },
  };
}

interface RpcEnvelope {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly method: string;
  readonly params?: readonly unknown[];
}

function parseRpcEnvelope(body: Buffer): RpcEnvelope | undefined {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const envelope = value as Record<string, unknown>;
    if (envelope.jsonrpc !== "2.0" || typeof envelope.method !== "string" ||
        !(envelope.id === null || typeof envelope.id === "string" || typeof envelope.id === "number") ||
        (envelope.params !== undefined && !Array.isArray(envelope.params))) return undefined;
    return { jsonrpc: "2.0", id: envelope.id, method: envelope.method, ...(envelope.params === undefined ? {} : { params: envelope.params }) } as RpcEnvelope;
  } catch { return undefined; }
}

function rpcError(id: string | number | null, code: number, message: string): object {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function writeJson(response: ServerResponse, status: number, value: object): void {
  const body = Buffer.from(JSON.stringify(value));
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("content-length", body.length);
  response.end(body);
}

function recordAudit(
  record: (input: Omit<ProxyAuditEvent, "proxyVersion" | "eventId" | "sequence" | "receivedAt" | "modeType" | "scheduleId">) => void,
  classification: ProxyAuditEvent["classification"],
  decision: ProxyAuditEvent["decision"],
  reason: string,
  requestMethod: string,
): void {
  record({ requestMethod, decision, classification, reason });
}
