import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdir, open, readFile, readdir, stat, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  importObserverPrivateKey,
  signProbeResult,
  type ObserverKeyPair,
  type ObserverPrivateKeyDocument,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";

export const OBSERVER_RUNTIME_CONFIG_VERSION = "ObserverRuntimeConfig@0.1.0" as const;

export interface ObserverRuntimeConfig {
  readonly schemaVersion: typeof OBSERVER_RUNTIME_CONFIG_VERSION;
  readonly privateKeyPath: string;
  readonly spoolDirectory: string;
  readonly deliveryLogPath: string;
  readonly collectorUrl: string;
  readonly pollIntervalMs: number;
  readonly requestTimeoutMs: number;
  readonly heartbeatIntervalMs: number;
  readonly healthHost: "127.0.0.1";
  readonly healthPort: number;
}

export interface ObserverRuntimeSnapshot {
  readonly status: "ready" | "degraded";
  readonly observerId: string;
  readonly keyId: string;
  readonly startedAt: string;
  readonly lastScanAt?: string;
  readonly lastSuccessfulDeliveryAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly deliveredCount: number;
  readonly queuedCount: number;
  readonly lastError?: string;
}

export interface ObserverDeliveryRecord {
  readonly delivery_sequence: number;
  readonly delivered_at: string;
  readonly result_id: string;
  readonly idempotency_key: string;
  readonly payload_hash: string;
  readonly observer_signature: string;
  readonly collector_status: "ACCEPTED" | "DUPLICATE";
  readonly collector_origin: string;
}

export class ObserverDeliveryRuntime {
  readonly #config: ObserverRuntimeConfig;
  readonly #keyPair: ObserverKeyPair;
  readonly #deliveryHandle: FileHandle;
  readonly #deliveredResultIds: Set<string>;
  readonly #startedAt = new Date().toISOString();
  readonly #failedContent = new Map<string, string>();
  #nextDeliverySequence: number;
  #lastScanAt: string | undefined;
  #lastSuccessfulDeliveryAt: string | undefined;
  #lastHeartbeatAt: string | undefined;
  #lastError: string | undefined;
  #queuedCount = 0;
  #running = false;

  private constructor(
    config: ObserverRuntimeConfig,
    keyPair: ObserverKeyPair,
    deliveryHandle: FileHandle,
    deliveredResultIds: Set<string>,
    nextDeliverySequence: number,
  ) {
    this.#config = config;
    this.#keyPair = keyPair;
    this.#deliveryHandle = deliveryHandle;
    this.#deliveredResultIds = deliveredResultIds;
    this.#nextDeliverySequence = nextDeliverySequence;
  }

  static async open(config: ObserverRuntimeConfig): Promise<ObserverDeliveryRuntime> {
    validateObserverRuntimeConfig(config);
    await assertPrivateKeyPermissions(config.privateKeyPath);
    const privateKeyDocument = parsePrivateKeyDocument(JSON.parse(await readFile(config.privateKeyPath, "utf8")) as unknown);
    const keyPair = importObserverPrivateKey(privateKeyDocument);
    await mkdir(config.spoolDirectory, { recursive: true });
    await mkdir(dirname(config.deliveryLogPath), { recursive: true });
    const existing = await readDeliveryLog(config.deliveryLogPath);
    const deliveredResultIds = new Set(existing.map(record => record.result_id));
    if (deliveredResultIds.size !== existing.length) throw new Error("observer delivery log contains duplicate result_id records");
    const deliveryHandle = await open(config.deliveryLogPath, "a");
    return new ObserverDeliveryRuntime(config, keyPair, deliveryHandle, deliveredResultIds, existing.length);
  }

  snapshot(): ObserverRuntimeSnapshot {
    return {
      status: this.#lastError === undefined ? "ready" : "degraded",
      observerId: this.#keyPair.observerId,
      keyId: this.#keyPair.keyId,
      startedAt: this.#startedAt,
      ...(this.#lastScanAt === undefined ? {} : { lastScanAt: this.#lastScanAt }),
      ...(this.#lastSuccessfulDeliveryAt === undefined ? {} : { lastSuccessfulDeliveryAt: this.#lastSuccessfulDeliveryAt }),
      ...(this.#lastHeartbeatAt === undefined ? {} : { lastHeartbeatAt: this.#lastHeartbeatAt }),
      deliveredCount: this.#deliveredResultIds.size,
      queuedCount: this.#queuedCount,
      ...(this.#lastError === undefined ? {} : { lastError: this.#lastError }),
    };
  }

  heartbeat(at = new Date()): ObserverRuntimeSnapshot {
    this.#lastHeartbeatAt = at.toISOString();
    return this.snapshot();
  }

  async scanOnce(now = new Date()): Promise<void> {
    const entries = (await readdir(this.#config.spoolDirectory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length > 10_000) throw new Error("observer spool exceeds the 10000-file safety limit");
    this.#queuedCount = 0;
    this.#lastScanAt = now.toISOString();
    let cycleError: string | undefined;
    for (const entry of entries) {
      const path = join(this.#config.spoolDirectory, entry.name);
      const file = await stat(path);
      if (file.size > 1024 * 1024) {
        cycleError = `spool file exceeds 1 MiB: ${entry.name}`;
        continue;
      }
      const text = await readFile(path, "utf8");
      try {
        const unsigned = parseUnsignedResult(JSON.parse(text) as unknown);
        if (this.#deliveredResultIds.has(unsigned.result_id)) continue;
        this.#queuedCount += 1;
        if (unsigned.observer_id !== this.#keyPair.observerId || unsigned.observer_key_id !== this.#keyPair.keyId) {
          throw new Error("spool result observer identity does not match runtime key");
        }
        const signed = signProbeResult(unsigned, this.#keyPair);
        if (this.#failedContent.get(entry.name) === signed.payload_hash) continue;
        const response = await fetch(new URL("/v0/probe-results", this.#config.collectorUrl), {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "SovereignKit-Observer/0.1" },
          body: JSON.stringify(signed),
          signal: AbortSignal.timeout(this.#config.requestTimeoutMs),
        });
        const responseText = await response.text();
        const responseValue = parseCollectorResponse(responseText);
        if (!response.ok || (responseValue.status !== "ACCEPTED" && responseValue.status !== "DUPLICATE")) {
          this.#failedContent.set(entry.name, signed.payload_hash);
          throw new Error(`collector rejected ${entry.name} with HTTP ${response.status}: ${bounded(responseText)}`);
        }
        const deliveredAt = new Date().toISOString();
        const record: ObserverDeliveryRecord = {
          delivery_sequence: this.#nextDeliverySequence,
          delivered_at: deliveredAt,
          result_id: signed.result_id,
          idempotency_key: signed.idempotency_key,
          payload_hash: signed.payload_hash,
          observer_signature: signed.observer_signature,
          collector_status: responseValue.status,
          collector_origin: new URL(this.#config.collectorUrl).origin,
        };
        await this.#deliveryHandle.appendFile(`${JSON.stringify(record)}\n`, "utf8");
        await this.#deliveryHandle.sync();
        this.#deliveredResultIds.add(signed.result_id);
        this.#nextDeliverySequence += 1;
        this.#queuedCount -= 1;
        this.#lastSuccessfulDeliveryAt = deliveredAt;
        this.#failedContent.delete(entry.name);
      } catch (error) {
        cycleError = error instanceof Error ? error.message : "observer delivery failed";
      }
    }
    this.#lastError = cycleError;
  }

  async run(signal: AbortSignal, emitHeartbeat: (snapshot: ObserverRuntimeSnapshot) => void): Promise<void> {
    if (this.#running) throw new Error("observer runtime is already running");
    this.#running = true;
    let nextHeartbeatAt = 0;
    try {
      while (!signal.aborted) {
        try {
          await this.scanOnce();
        } catch (error) {
          this.#lastError = error instanceof Error ? error.message : "observer scan failed";
        }
        const now = Date.now();
        if (now >= nextHeartbeatAt) {
          emitHeartbeat(this.heartbeat(new Date(now)));
          nextHeartbeatAt = now + this.#config.heartbeatIntervalMs;
        }
        await abortableDelay(this.#config.pollIntervalMs, signal);
      }
    } finally {
      this.#running = false;
    }
  }

  async close(): Promise<void> {
    await this.#deliveryHandle.close();
  }
}

export function createObserverHealthServer(runtime: ObserverDeliveryRuntime): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") return send(response, 200, runtime.snapshot());
    if (request.method === "GET" && request.url === "/ready") {
      const snapshot = runtime.snapshot();
      return send(response, snapshot.status === "ready" ? 200 : 503, snapshot);
    }
    return send(response, 404, { status: "not_found" });
  });
}

export async function loadObserverRuntimeConfig(path: string): Promise<ObserverRuntimeConfig> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (!isRecord(value)) throw new Error("observer runtime config must be an object");
  const allowed = new Set(["schemaVersion", "privateKeyPath", "spoolDirectory", "deliveryLogPath", "collectorUrl", "pollIntervalMs", "requestTimeoutMs", "heartbeatIntervalMs", "healthHost", "healthPort"]);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`observer runtime config has unknown fields: ${unknown.join(", ")}`);
  const config = value as unknown as ObserverRuntimeConfig;
  const base = dirname(resolve(path));
  const resolved: ObserverRuntimeConfig = {
    ...config,
    privateKeyPath: resolveConfigPath(base, config.privateKeyPath),
    spoolDirectory: resolveConfigPath(base, config.spoolDirectory),
    deliveryLogPath: resolveConfigPath(base, config.deliveryLogPath),
  };
  validateObserverRuntimeConfig(resolved);
  return resolved;
}

function validateObserverRuntimeConfig(config: ObserverRuntimeConfig): void {
  if (config.schemaVersion !== OBSERVER_RUNTIME_CONFIG_VERSION) throw new Error("unsupported observer runtime config version");
  if (!isAbsolute(config.privateKeyPath) || !isAbsolute(config.spoolDirectory) || !isAbsolute(config.deliveryLogPath)) {
    throw new Error("resolved observer runtime paths must be absolute");
  }
  const collector = new URL(config.collectorUrl);
  const loopback = collector.hostname === "127.0.0.1" || collector.hostname === "localhost" || collector.hostname === "::1";
  if (collector.protocol !== "https:" && !(collector.protocol === "http:" && loopback)) {
    throw new Error("remote collectorUrl must use HTTPS; HTTP is allowed only for loopback development");
  }
  if (!Number.isSafeInteger(config.pollIntervalMs) || config.pollIntervalMs < 250 || config.pollIntervalMs > 300_000) throw new Error("pollIntervalMs must be an integer from 250 to 300000");
  if (!Number.isSafeInteger(config.requestTimeoutMs) || config.requestTimeoutMs < 1_000 || config.requestTimeoutMs > 60_000) throw new Error("requestTimeoutMs must be an integer from 1000 to 60000");
  if (!Number.isSafeInteger(config.heartbeatIntervalMs) || config.heartbeatIntervalMs < 1_000 || config.heartbeatIntervalMs > 300_000) throw new Error("heartbeatIntervalMs must be an integer from 1000 to 300000");
  if (config.healthHost !== "127.0.0.1") throw new Error("observer health endpoint must remain loopback-only");
  if (!Number.isSafeInteger(config.healthPort) || config.healthPort < 0 || config.healthPort > 65_535) throw new Error("healthPort must be an integer from 0 to 65535");
}

async function assertPrivateKeyPermissions(path: string): Promise<void> {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error("observer private key path must be a regular file");
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("observer private key must not be readable or writable by group/other; expected mode 0600");
  }
}

async function readDeliveryLog(path: string): Promise<readonly ObserverDeliveryRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return [];
    throw error;
  }
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new Error("observer delivery log has a partial trailing record");
  return text.trimEnd().split("\n").map((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`observer delivery log contains invalid JSON at record ${index}`); }
    if (!isRecord(value) || value.delivery_sequence !== index || typeof value.result_id !== "string" || typeof value.idempotency_key !== "string" ||
        typeof value.payload_hash !== "string" || typeof value.observer_signature !== "string" || typeof value.delivered_at !== "string" ||
        (value.collector_status !== "ACCEPTED" && value.collector_status !== "DUPLICATE") || typeof value.collector_origin !== "string") {
      throw new Error(`observer delivery log envelope is invalid at record ${index}`);
    }
    return value as unknown as ObserverDeliveryRecord;
  });
}

function parsePrivateKeyDocument(value: unknown): ObserverPrivateKeyDocument {
  if (!isRecord(value) || value.schemaVersion !== "ObserverPrivateKey@0.1.0" || typeof value.observerId !== "string" ||
      typeof value.keyId !== "string" || typeof value.privateKeyPkcs8Base64 !== "string" || typeof value.publicKeySpkiBase64 !== "string") {
    throw new Error("invalid observer private key document");
  }
  return value as unknown as ObserverPrivateKeyDocument;
}

function parseUnsignedResult(value: unknown): UnsignedProbeResult {
  if (!isRecord(value) || typeof value.result_id !== "string" || typeof value.idempotency_key !== "string" ||
      typeof value.observer_id !== "string" || typeof value.observer_key_id !== "string" || "payload_hash" in value || "observer_signature" in value) {
    throw new Error("spool file must contain one unsigned ProbeResult");
  }
  return value as unknown as UnsignedProbeResult;
}

function parseCollectorResponse(text: string): { readonly status: unknown } {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`collector returned invalid JSON: ${bounded(text)}`); }
  if (!isRecord(value)) throw new Error("collector response must be an object");
  return { status: value.status };
}

function resolveConfigPath(base: string, path: string): string {
  if (typeof path !== "string" || path.length === 0) throw new Error("observer runtime path is required");
  return isAbsolute(path) ? path : resolve(base, path);
}

function bounded(value: string): string {
  return value.replace(/[\r\n]/gu, " ").slice(0, 512);
}

function send(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolveDelay => {
    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolveDelay();
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
