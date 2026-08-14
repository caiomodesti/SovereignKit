import { createHash } from "node:crypto";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

const addFormats = addFormatsModule.default as unknown as (ajv: Ajv2020) => Ajv2020;

export const INTELLIGENCE_SCHEMA_VERSION = "0.1.0" as const;
export const INTELLIGENCE_POLICY_ID = "ClassificationPolicyV0Experimental@0.1.0" as const;
export const INTELLIGENCE_GENERATOR_VERSION = "IntelligenceSnapshotGenerator@0.1.0" as const;

export type IntelligenceTransactionClass = "MATCHED_CONTROL" | "PROGRAM_X";
export type IntelligenceClassification = "HEALTHY" | "DEGRADED" | "ASYMMETRIC" | "INSUFFICIENT_DATA" | "UNKNOWN";
export type IntelligenceEvidenceStrength = "INSUFFICIENT" | "LIMITED" | "STRONG_CONTROLLED" | "NONE";

export interface RouteIntelligence {
  readonly route_id: string;
  readonly transaction_class: IntelligenceTransactionClass;
  readonly classification: IntelligenceClassification;
  readonly evidence_strength: IntelligenceEvidenceStrength;
  readonly window_id: string;
  readonly experiment_id: string;
  readonly experiment_version: string;
  readonly observer_id: string;
  readonly configuration_hash: string;
  readonly source_input_hash: string;
  readonly sample_count: number;
  readonly observed_at: string;
  readonly avoid_after_consecutive_snapshots: number;
  readonly restore_after_consecutive_snapshots: number;
}

export interface IntelligenceSnapshot {
  readonly schema_version: typeof INTELLIGENCE_SCHEMA_VERSION;
  readonly version: number;
  readonly generated_at: string;
  readonly expires_at: string;
  readonly policy_id: typeof INTELLIGENCE_POLICY_ID;
  readonly route_intelligence: readonly RouteIntelligence[];
  readonly input_hash: string;
  readonly generator_version: typeof INTELLIGENCE_GENERATOR_VERSION;
}

export interface IntelligenceSummaryInput {
  readonly policyVersion: "ClassificationPolicyV0Experimental";
  readonly inputHash: string;
  readonly observedAt: string;
  readonly definition: {
    readonly experimentId: string;
    readonly experimentVersion: string;
    readonly configurationHash: string;
    readonly windowId: string;
    readonly observerId: string;
  };
  readonly cells: readonly {
    readonly routeId: string;
    readonly transactionClass: IntelligenceTransactionClass;
    readonly completeCount: number;
  }[];
  readonly classifications: readonly {
    readonly routeId: string;
    readonly classification: IntelligenceClassification;
    readonly evidenceStrength: IntelligenceEvidenceStrength;
  }[];
}

export const INTELLIGENCE_SNAPSHOT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://sovereignkit.org/spec/intelligence-snapshot.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "version", "generated_at", "expires_at", "policy_id", "route_intelligence", "input_hash", "generator_version"],
  properties: {
    schema_version: { const: INTELLIGENCE_SCHEMA_VERSION },
    version: { type: "integer", minimum: 1 },
    generated_at: { type: "string", format: "date-time" },
    expires_at: { type: "string", format: "date-time" },
    policy_id: { const: INTELLIGENCE_POLICY_ID },
    input_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    generator_version: { const: INTELLIGENCE_GENERATOR_VERSION },
    route_intelligence: {
      type: "array",
      maxItems: 10_000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["route_id", "transaction_class", "classification", "evidence_strength", "window_id", "experiment_id", "experiment_version", "observer_id", "configuration_hash", "source_input_hash", "sample_count", "observed_at", "avoid_after_consecutive_snapshots", "restore_after_consecutive_snapshots"],
        properties: {
          route_id: { type: "string", minLength: 1, maxLength: 160 },
          transaction_class: { enum: ["MATCHED_CONTROL", "PROGRAM_X"] },
          classification: { enum: ["HEALTHY", "DEGRADED", "ASYMMETRIC", "INSUFFICIENT_DATA", "UNKNOWN"] },
          evidence_strength: { enum: ["INSUFFICIENT", "LIMITED", "STRONG_CONTROLLED", "NONE"] },
          window_id: { type: "string", minLength: 1, maxLength: 160 },
          experiment_id: { type: "string", minLength: 1, maxLength: 160 },
          experiment_version: { type: "string", minLength: 1, maxLength: 160 },
          observer_id: { type: "string", minLength: 1, maxLength: 160 },
          configuration_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          source_input_hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          sample_count: { type: "integer", minimum: 0 },
          observed_at: { type: "string", format: "date-time" },
          avoid_after_consecutive_snapshots: { type: "integer", minimum: 1, maximum: 100 },
          restore_after_consecutive_snapshots: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  },
} as const;

export function buildIntelligenceSnapshot(options: {
  readonly version: number;
  readonly generatedAt: Date;
  readonly ttlMs: number;
  readonly summaries: readonly IntelligenceSummaryInput[];
  readonly avoidAfterConsecutiveSnapshots?: number;
  readonly restoreAfterConsecutiveSnapshots?: number;
}): IntelligenceSnapshot {
  const avoidAfter = options.avoidAfterConsecutiveSnapshots ?? 2;
  const restoreAfter = options.restoreAfterConsecutiveSnapshots ?? 3;
  if (!Number.isSafeInteger(options.version) || options.version < 1) throw new Error("snapshot version must be a positive safe integer");
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) throw new Error("snapshot ttlMs must be a positive safe integer");
  if (![avoidAfter, restoreAfter].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 100)) throw new Error("hysteresis thresholds must be integers from 1 to 100");
  if (!Number.isFinite(options.generatedAt.getTime())) throw new Error("generatedAt must be valid");
  const summaries = [...options.summaries].sort((left, right) => lexicalCompare(summaryKey(left), summaryKey(right)));
  const entries = summaries.flatMap(summary => entriesFromSummary(summary, options.generatedAt, avoidAfter, restoreAfter));
  const uniqueKeys = new Set(entries.map(entry => intelligenceKey(entry.route_id, entry.transaction_class)));
  if (uniqueKeys.size !== entries.length) throw new Error("snapshot contains duplicate route/class intelligence");
  const snapshot: IntelligenceSnapshot = {
    schema_version: INTELLIGENCE_SCHEMA_VERSION,
    version: options.version,
    generated_at: options.generatedAt.toISOString(),
    expires_at: new Date(options.generatedAt.getTime() + options.ttlMs).toISOString(),
    policy_id: INTELLIGENCE_POLICY_ID,
    route_intelligence: entries.sort((left, right) => lexicalCompare(intelligenceKey(left.route_id, left.transaction_class), intelligenceKey(right.route_id, right.transaction_class))),
    input_hash: sha256Hex(canonicalJson(summaries)),
    generator_version: INTELLIGENCE_GENERATOR_VERSION,
  };
  const validate = createSnapshotValidator();
  if (!validate(snapshot)) throw new Error(`generated snapshot is invalid: ${formatErrors(validate.errors)}`);
  return snapshot;
}

export type IntelligenceDisposition = "LOCAL_PRIMARY_FALLBACK" | "AVOID";
export type IntelligenceDeveloperOverride = "LOCAL_PRIMARY_FALLBACK" | "AVOID" | undefined;

export interface IntelligenceRoutingDecision {
  readonly disposition: IntelligenceDisposition;
  readonly source: "SNAPSHOT" | "DEVELOPER_OVERRIDE" | "FAIL_OPEN";
  readonly snapshotVersion?: number;
  readonly reason?: string;
}

export interface SnapshotPollResult {
  readonly status: "APPLIED" | "UNCHANGED" | "FAIL_OPEN";
  readonly version?: number;
  readonly reason?: string;
}

export function createHttpSnapshotFetcher(url: string, options: { readonly maxBodyBytes?: number } = {}): (signal: AbortSignal) => Promise<unknown> {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("snapshot URL must use HTTP or HTTPS");
  if (endpoint.username.length > 0 || endpoint.password.length > 0) throw new Error("snapshot URL must not contain credentials");
  if (endpoint.protocol === "http:" && !["127.0.0.1", "::1", "[::1]", "localhost"].includes(endpoint.hostname)) {
    throw new Error("non-loopback snapshot URLs must use HTTPS");
  }
  const maxBodyBytes = options.maxBodyBytes ?? 512 * 1024;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error("maxBodyBytes must be a positive safe integer");
  return async signal => {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { accept: "application/json", "cache-control": "no-cache" },
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new Error(`snapshot endpoint returned HTTP ${response.status}`);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("snapshot endpoint did not return application/json");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) throw new Error("snapshot response exceeds body limit");
    if (response.body === null) throw new Error("snapshot response has no body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel("snapshot response exceeds body limit");
        throw new Error("snapshot response exceeds body limit");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new Error("snapshot endpoint returned invalid JSON");
    }
  };
}

interface HysteresisState {
  avoidCount: number;
  restoreCount: number;
  avoided: boolean;
}

export class IntelligenceSnapshotClient {
  readonly #fetchSnapshot: (signal: AbortSignal) => Promise<unknown>;
  readonly #pollTimeoutMs: number;
  readonly #developerOverride: ((routeId: string, transactionClass: IntelligenceTransactionClass) => IntelligenceDeveloperOverride) | undefined;
  readonly #validate: ValidateFunction;
  readonly #states = new Map<string, HysteresisState>();
  #lastVersion = 0;
  #lastSnapshotHash: string | undefined;
  #activeSnapshotGeneratedAtMs: number | undefined;
  #activeSnapshotExpiresAtMs: number | undefined;
  #lastFailOpenReason = "intelligence feed has not been polled";
  #feedAvailable = false;

  constructor(options: {
    readonly fetchSnapshot: (signal: AbortSignal) => Promise<unknown>;
    readonly pollTimeoutMs: number;
    readonly developerOverride?: (routeId: string, transactionClass: IntelligenceTransactionClass) => IntelligenceDeveloperOverride;
  }) {
    if (!Number.isSafeInteger(options.pollTimeoutMs) || options.pollTimeoutMs <= 0) throw new Error("pollTimeoutMs must be a positive safe integer");
    this.#fetchSnapshot = options.fetchSnapshot;
    this.#pollTimeoutMs = options.pollTimeoutMs;
    this.#developerOverride = options.developerOverride;
    this.#validate = createSnapshotValidator();
  }

  async poll(now = new Date()): Promise<SnapshotPollResult> {
    try {
      const snapshot = await withTimeout(this.#fetchSnapshot, this.#pollTimeoutMs);
      if (!this.#validate(snapshot)) return this.#failOpen(`schema validation failed: ${formatErrors(this.#validate.errors)}`);
      const typed = snapshot as IntelligenceSnapshot;
      const temporalError = validateTemporalAndIdentitySemantics(typed, now);
      if (temporalError !== undefined) return this.#failOpen(temporalError);
      if (typed.version < this.#lastVersion) return this.#failOpen("snapshot version rollback");
      const snapshotHash = sha256Hex(canonicalJson(typed));
      if (typed.version === this.#lastVersion) {
        if (snapshotHash !== this.#lastSnapshotHash) return this.#failOpen("snapshot version equivocation");
        this.#activeSnapshotGeneratedAtMs = Date.parse(typed.generated_at);
        this.#activeSnapshotExpiresAtMs = Date.parse(typed.expires_at);
        this.#feedAvailable = true;
        return { status: "UNCHANGED", version: typed.version };
      }
      this.#lastVersion = typed.version;
      this.#lastSnapshotHash = snapshotHash;
      this.#apply(typed);
      this.#activeSnapshotGeneratedAtMs = Date.parse(typed.generated_at);
      this.#activeSnapshotExpiresAtMs = Date.parse(typed.expires_at);
      this.#feedAvailable = true;
      return { status: "APPLIED", version: typed.version };
    } catch (error) {
      return this.#failOpen(error instanceof Error ? error.message : "snapshot polling failed");
    }
  }

  decision(routeId: string, transactionClass: IntelligenceTransactionClass, now = new Date()): IntelligenceRoutingDecision {
    let override: IntelligenceDeveloperOverride;
    try {
      override = this.#developerOverride?.(routeId, transactionClass);
    } catch {
      return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: "developer override threw" };
    }
    if (override !== undefined) {
      if (override !== "AVOID" && override !== "LOCAL_PRIMARY_FALLBACK") {
        return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: "developer override returned an unsupported disposition" };
      }
      return { disposition: override, source: "DEVELOPER_OVERRIDE" };
    }
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: "routing decision time is invalid" };
    if (!this.#feedAvailable) return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: this.#lastFailOpenReason };
    if (this.#activeSnapshotGeneratedAtMs === undefined || nowMs < this.#activeSnapshotGeneratedAtMs) {
      this.#feedAvailable = false;
      this.#lastFailOpenReason = "snapshot generated_at became future-dated before routing decision";
      return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: this.#lastFailOpenReason };
    }
    if (this.#activeSnapshotExpiresAtMs === undefined || nowMs >= this.#activeSnapshotExpiresAtMs) {
      this.#feedAvailable = false;
      this.#lastFailOpenReason = "snapshot became stale before routing decision";
      return { disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: this.#lastFailOpenReason };
    }
    const state = this.#states.get(intelligenceKey(routeId, transactionClass));
    return {
      disposition: state?.avoided === true ? "AVOID" : "LOCAL_PRIMARY_FALLBACK",
      source: "SNAPSHOT",
      snapshotVersion: this.#lastVersion,
      ...(state === undefined ? { reason: "snapshot has no matching route/class entry" } : {}),
    };
  }

  disposition(routeId: string, transactionClass: IntelligenceTransactionClass, now = new Date()): IntelligenceDisposition {
    return this.decision(routeId, transactionClass, now).disposition;
  }

  #apply(snapshot: IntelligenceSnapshot): void {
    const present = new Set<string>();
    for (const entry of snapshot.route_intelligence) {
      const key = intelligenceKey(entry.route_id, entry.transaction_class);
      present.add(key);
      const state = this.#states.get(key) ?? { avoidCount: 0, restoreCount: 0, avoided: false };
      const avoidSignal = entry.classification === "DEGRADED" || (entry.classification === "ASYMMETRIC" && entry.transaction_class === "PROGRAM_X");
      const restoreSignal = entry.classification === "HEALTHY";
      if (avoidSignal) {
        state.avoidCount += 1;
        state.restoreCount = 0;
        if (state.avoidCount >= entry.avoid_after_consecutive_snapshots) state.avoided = true;
      } else if (restoreSignal) {
        state.restoreCount += 1;
        state.avoidCount = 0;
        if (state.restoreCount >= entry.restore_after_consecutive_snapshots) state.avoided = false;
      } else {
        state.avoidCount = 0;
        state.restoreCount = 0;
        state.avoided = false;
      }
      this.#states.set(key, state);
    }
    for (const key of this.#states.keys()) if (!present.has(key)) this.#states.delete(key);
  }

  #failOpen(reason: string): SnapshotPollResult {
    this.#feedAvailable = false;
    this.#lastFailOpenReason = reason;
    return { status: "FAIL_OPEN", reason };
  }
}

function entriesFromSummary(summary: IntelligenceSummaryInput, snapshotGeneratedAt: Date, avoidAfter: number, restoreAfter: number): RouteIntelligence[] {
  if (summary.policyVersion !== "ClassificationPolicyV0Experimental" || !/^[a-f0-9]{64}$/.test(summary.inputHash) || !/^[a-f0-9]{64}$/.test(summary.definition.configurationHash)) {
    throw new Error("summary provenance is invalid or unsupported");
  }
  const sourceObservedAt = Date.parse(summary.observedAt);
  if (!Number.isFinite(sourceObservedAt) || sourceObservedAt > snapshotGeneratedAt.getTime()) throw new Error("summary observedAt is invalid or exceeds snapshot generation time");
  return summary.classifications.flatMap(classification => (["MATCHED_CONTROL", "PROGRAM_X"] as const).map(transactionClass => {
    const cell = summary.cells.find(value => value.routeId === classification.routeId && value.transactionClass === transactionClass);
    if (cell === undefined) throw new Error(`missing ${transactionClass} cell for route ${classification.routeId}`);
    const effectiveClassification = classification.classification === "ASYMMETRIC" && transactionClass === "MATCHED_CONTROL" ? "HEALTHY" : classification.classification;
    return {
      route_id: classification.routeId,
      transaction_class: transactionClass,
      classification: effectiveClassification,
      evidence_strength: classification.evidenceStrength,
      window_id: summary.definition.windowId,
      experiment_id: summary.definition.experimentId,
      experiment_version: summary.definition.experimentVersion,
      observer_id: summary.definition.observerId,
      configuration_hash: summary.definition.configurationHash,
      source_input_hash: summary.inputHash,
      sample_count: cell.completeCount,
      observed_at: new Date(sourceObservedAt).toISOString(),
      avoid_after_consecutive_snapshots: avoidAfter,
      restore_after_consecutive_snapshots: restoreAfter,
    };
  }));
}

function validateTemporalAndIdentitySemantics(snapshot: IntelligenceSnapshot, now: Date): string | undefined {
  const generatedAt = Date.parse(snapshot.generated_at);
  const expiresAt = Date.parse(snapshot.expires_at);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || !Number.isFinite(generatedAt) || !Number.isFinite(expiresAt) || expiresAt <= generatedAt) return "invalid snapshot time interval";
  if (nowMs < generatedAt) return "snapshot generated_at is in the future";
  if (nowMs >= expiresAt) return "snapshot is stale";
  const keys = snapshot.route_intelligence.map(value => intelligenceKey(value.route_id, value.transaction_class));
  if (new Set(keys).size !== keys.length) return "duplicate route/class intelligence";
  if (snapshot.route_intelligence.some(value => Date.parse(value.observed_at) > generatedAt)) return "route intelligence observed_at exceeds generated_at";
  return undefined;
}

async function withTimeout(operation: (signal: AbortSignal) => Promise<unknown>, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("snapshot poll timed out")); }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function summaryKey(summary: IntelligenceSummaryInput): string {
  return `${summary.definition.observerId}\u001f${summary.definition.windowId}\u001f${summary.inputHash}`;
}

function intelligenceKey(routeId: string, transactionClass: IntelligenceTransactionClass): string {
  return `${routeId}\u001f${transactionClass}`;
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not support non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("unsupported canonical JSON value");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function formatErrors(errors: readonly ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(error => `${error.instancePath || "/"} ${error.message ?? error.keyword}`).join("; ");
}

function createSnapshotValidator(): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(INTELLIGENCE_SNAPSHOT_SCHEMA);
}
