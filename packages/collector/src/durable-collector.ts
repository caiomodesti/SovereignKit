import { mkdir, open, readFile, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

import {
  IdempotentProbeResultIngestor,
  type IngestionOutcome,
  type ObserverAllowlistEntry,
  type SignedProbeResult,
} from "@sovereignkit/probes/collector-runtime";

import { ProbeResultSchemaValidator } from "./validation.js";

export interface AcceptedCollectorRecord {
  readonly collector_sequence: number;
  readonly collected_at: string;
  readonly result: SignedProbeResult;
}

export type DurableIngestionOutcome = IngestionOutcome & { readonly collectorSequence?: number };

export class DurableProbeResultCollector {
  readonly #validator: ProbeResultSchemaValidator;
  readonly #ingestor: IdempotentProbeResultIngestor;
  readonly #handle: FileHandle;
  #tail: Promise<void> = Promise.resolve();
  #nextSequence: number;
  #fatalWriteError: Error | undefined;

  private constructor(
    validator: ProbeResultSchemaValidator,
    ingestor: IdempotentProbeResultIngestor,
    handle: FileHandle,
    nextSequence: number,
  ) {
    this.#validator = validator;
    this.#ingestor = ingestor;
    this.#handle = handle;
    this.#nextSequence = nextSequence;
  }

  static async open(options: {
    readonly schema: object;
    readonly allowlist: readonly ObserverAllowlistEntry[];
    readonly acceptedLogPath: string;
  }): Promise<DurableProbeResultCollector> {
    const validator = new ProbeResultSchemaValidator(options.schema);
    const ingestor = new IdempotentProbeResultIngestor(options.allowlist);
    await mkdir(dirname(options.acceptedLogPath), { recursive: true });
    const existing = await readExistingLog(options.acceptedLogPath);
    let expectedSequence = 0;
    for (const record of existing) {
      if (record.collector_sequence !== expectedSequence) throw new Error(`collector log sequence gap at ${expectedSequence}`);
      const validation = validator.validate(record.result);
      if (!validation.valid) throw new Error(`collector log schema failure at ${expectedSequence}: ${validation.errors.join("; ")}`);
      const outcome = ingestor.ingest(validation.value, new Date(record.collected_at));
      if (outcome.status !== "ACCEPTED") throw new Error(`collector log replay failure at ${expectedSequence}: ${"reason" in outcome ? outcome.reason : outcome.status}`);
      expectedSequence += 1;
    }
    const handle = await open(options.acceptedLogPath, "a");
    return new DurableProbeResultCollector(validator, ingestor, handle, expectedSequence);
  }

  ingest(value: unknown, collectorTime = new Date()): Promise<DurableIngestionOutcome> {
    const operation = this.#tail.then(() => this.#ingestExclusive(value, collectorTime));
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  storedCount(): number {
    return this.#ingestor.acceptedResults().length;
  }

  async close(): Promise<void> {
    await this.#tail;
    await this.#handle.close();
  }

  async #ingestExclusive(value: unknown, collectorTime: Date): Promise<DurableIngestionOutcome> {
    if (this.#fatalWriteError !== undefined) throw new Error("collector write path is poisoned; restart and inspect the accepted log", { cause: this.#fatalWriteError });
    const validation = this.#validator.validate(value);
    if (!validation.valid) {
      return { status: "REJECTED", reason: `schema validation failed: ${validation.errors.join("; ")}`, storedCount: this.storedCount() };
    }
    const outcome = this.#ingestor.assess(validation.value, collectorTime);
    if (outcome.status !== "ACCEPTED") return outcome;
    const collectorSequence = this.#nextSequence;
    const record: AcceptedCollectorRecord = {
      collector_sequence: collectorSequence,
      collected_at: collectorTime.toISOString(),
      result: validation.value,
    };
    try {
      await this.#handle.appendFile(`${JSON.stringify(record)}\n`, "utf8");
      await this.#handle.sync();
    } catch (error) {
      this.#fatalWriteError = error instanceof Error ? error : new Error("unknown Collector write failure");
      throw this.#fatalWriteError;
    }
    const committed = this.#ingestor.ingest(validation.value, collectorTime);
    if (committed.status !== "ACCEPTED") {
      this.#fatalWriteError = new Error(`durable result could not enter replay indexes: ${"reason" in committed ? committed.reason : committed.status}`);
      throw this.#fatalWriteError;
    }
    this.#nextSequence += 1;
    return { ...outcome, collectorSequence };
  }
}

async function readExistingLog(path: string): Promise<readonly AcceptedCollectorRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new Error("collector log has a partial trailing record; refusing automatic repair");
  return text.trimEnd().split("\n").map((line, index) => parseRecord(line, index));
}

function parseRecord(line: string, index: number): AcceptedCollectorRecord {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`collector log contains invalid JSON at record ${index}`);
  }
  if (!isRecord(value) || value.collector_sequence !== index || typeof value.collected_at !== "string" || !isRecord(value.result)) {
    throw new Error(`collector log envelope is invalid at record ${index}`);
  }
  return value as unknown as AcceptedCollectorRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
