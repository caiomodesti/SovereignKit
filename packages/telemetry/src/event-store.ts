import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { MeasurementEvent } from "./types.js";
import { MEASUREMENT_VERSION, SCHEMA_VERSION } from "./types.js";

export interface AppendOnlyEventStore {
  append(event: MeasurementEvent): Promise<void>;
  readByAttempt(attemptId: string): Promise<readonly MeasurementEvent[]>;
}

export class InMemoryEventStore implements AppendOnlyEventStore {
  readonly #events: MeasurementEvent[] = [];

  async append(event: MeasurementEvent): Promise<void> {
    assertMeasurementEvent(event);
    this.#events.push(structuredClone(event));
  }

  async readByAttempt(attemptId: string): Promise<readonly MeasurementEvent[]> {
    return this.#events
      .filter(event => event.attemptId === attemptId)
      .map(event => structuredClone(event));
  }
}

export class JsonlEventStore implements AppendOnlyEventStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async append(event: MeasurementEvent): Promise<void> {
    assertMeasurementEvent(event);
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, `${JSON.stringify(event, bigintReplacer)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  }

  async readByAttempt(attemptId: string): Promise<readonly MeasurementEvent[]> {
    let content: string;
    try {
      content = await readFile(this.#path, "utf8");
    } catch (error) {
      if (isMissingFile(error)) {
        return [];
      }
      throw error;
    }

    return content
      .split(/\r?\n/u)
      .filter(line => line.length > 0)
      .map(line => parseMeasurementEvent(line))
      .filter(event => event.attemptId === attemptId);
  }
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

const BIGINT_FIELDS = new Set([
  "contextSlot",
  "lastValidBlockHeight",
  "slot",
  "rpcContextSlot",
  "blockHeight",
]);

function bigintReviver(key: string, value: unknown): unknown {
  return BIGINT_FIELDS.has(key) && typeof value === "string" && /^\d+$/u.test(value)
    ? BigInt(value)
    : value;
}

const EVENT_TYPES = new Set<MeasurementEvent["eventType"]>([
  "TRANSACTION_CREATED",
  "SUBMISSION_ATTEMPTED_RECORDED",
  "RPC_RESPONSE_RECEIVED",
  "OBSERVATION_CYCLE_STARTED",
  "READER_SIGNATURE_STATUS_RECEIVED",
  "READER_BLOCK_HEIGHT_RECEIVED",
  "READER_UNAVAILABLE",
  "OBSERVATION_DEADLINE_REACHED",
]);

function parseMeasurementEvent(line: string): MeasurementEvent {
  const value: unknown = JSON.parse(line, bigintReviver);
  assertMeasurementEvent(value);
  return value;
}

function assertMeasurementEvent(value: unknown): asserts value is MeasurementEvent {
  if (!isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    value.measurementVersion !== MEASUREMENT_VERSION ||
    !isEventType(value.eventType) ||
    !isNonEmptyString(value.softwareVersion) ||
    !isNonEmptyString(value.eventId) ||
    !isNonEmptyString(value.attemptId) ||
    !isNonEmptyString(value.transactionId) ||
    !isNonEmptyString(value.observerId) ||
    !isNonEmptyString(value.keyId) ||
    !isNonEmptyString(value.clockDomainId) ||
    !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 0 ||
    typeof value.monotonicNs !== "string" || !/^\d+$/u.test(value.monotonicNs) ||
    !isTimestamp(value.wallClock) ||
    (value.collectorReceivedAt !== undefined && !isTimestamp(value.collectorReceivedAt)) ||
    !isValidEventData(value.eventType, value.data)
  ) {
    throw new Error("Invalid SovereignKit measurement event in append-only store");
  }
}

function isValidEventData(eventType: MeasurementEvent["eventType"], data: unknown): boolean {
  if (!isRecord(data)) return false;
  switch (eventType) {
    case "TRANSACTION_CREATED":
      return isNonEmptyString(data.transactionId) && isNonEmptyString(data.attemptId) &&
        isNonEmptyString(data.routeId) && isNonEmptyString(data.signature) &&
        (data.experimentId === undefined || isNonEmptyString(data.experimentId)) &&
        (data.probeId === undefined || isNonEmptyString(data.probeId)) && isValidity(data.validity);
    case "SUBMISSION_ATTEMPTED_RECORDED":
      return isNonEmptyString(data.routeId);
    case "RPC_RESPONSE_RECEIVED":
      return data.outcome === "acknowledged"
        ? isNonEmptyString(data.returnedSignature)
        : data.outcome === "rejected" && isRpcError(data.error);
    case "OBSERVATION_CYCLE_STARTED":
      return Array.isArray(data.readerIds) && data.readerIds.length > 0 &&
        data.readerIds.every(isNonEmptyString) && new Set(data.readerIds).size === data.readerIds.length &&
        Number.isSafeInteger(data.requiredQuorum) && Number(data.requiredQuorum) > 0 &&
        Number(data.requiredQuorum) <= data.readerIds.length;
    case "READER_SIGNATURE_STATUS_RECEIVED":
      return isNonEmptyString(data.observationId) && isNonEmptyString(data.readerId) &&
        (data.status === null || data.status === "processed" || data.status === "confirmed" || data.status === "finalized") &&
        (data.slot === undefined || isNonNegativeBigInt(data.slot)) &&
        (data.rpcContextSlot === undefined || isNonNegativeBigInt(data.rpcContextSlot));
    case "READER_BLOCK_HEIGHT_RECEIVED":
      return isNonEmptyString(data.observationId) && isNonEmptyString(data.readerId) &&
        isNonNegativeBigInt(data.blockHeight) && data.commitment === "confirmed";
    case "READER_UNAVAILABLE":
      return isNonEmptyString(data.observationId) && isNonEmptyString(data.readerId) &&
        (data.operation === "signature_status" || data.operation === "block_height") &&
        (data.errorCategory === "TRANSPORT" || data.errorCategory === "TIMEOUT" ||
          data.errorCategory === "RPC" || data.errorCategory === "UNKNOWN");
    case "OBSERVATION_DEADLINE_REACHED":
      return Number.isSafeInteger(data.deadlineMs) && Number(data.deadlineMs) > 0;
  }
}

function isValidity(value: unknown): boolean {
  return isRecord(value) && isNonEmptyString(value.blockhash) && isTimestamp(value.fetchedAt) &&
    isNonNegativeBigInt(value.contextSlot) && isNonNegativeBigInt(value.lastValidBlockHeight) &&
    value.blockhashCommitment === "confirmed";
}

function isRpcError(value: unknown): boolean {
  return isRecord(value) &&
    (value.category === "PRE_FLIGHT" || value.category === "RPC" || value.category === "TRANSPORT" ||
      value.category === "TIMEOUT" || value.category === "UNKNOWN") &&
    (value.code === undefined || typeof value.code === "number" || typeof value.code === "string") &&
    (value.messageClass === undefined || isNonEmptyString(value.messageClass)) &&
    typeof value.mayHaveBeenForwarded === "boolean";
}

function isEventType(value: unknown): value is MeasurementEvent["eventType"] {
  return typeof value === "string" && EVENT_TYPES.has(value as MeasurementEvent["eventType"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isNonNegativeBigInt(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
