import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ObservationReader, SignatureStatusResult } from "@sovereignkit/telemetry";
import {
  deriveUnitId,
  generateObserverKeyPair,
  IdempotentProbeResultIngestor,
  sha256Hex,
  signProbeResult,
  type ObserverAllowlistEntry,
} from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

import { executeObservationJob, type ObservationJob } from "./observation-worker.js";
import { ProbeResultSchemaValidator } from "./validation.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("Grant Milestone 1 local failure matrix", () => {
  test("preserves quorum with one unavailable reader and refuses quorum with two unavailable readers", async () => {
    const availableJob = makeJob();
    const available = await run(availableJob, [
      reader("reader-a", { status: "finalized", slot: 10n }, 90n),
      reader("reader-b", { status: "finalized", slot: 10n }, 90n),
      unavailableReader("reader-c"),
    ]);
    expect(available.terminal_state).toBe("FINALIZED");

    const unavailableJob = makeJob();
    const unavailable = await run(unavailableJob, [
      reader("reader-a", { status: "finalized", slot: 10n }, 90n),
      unavailableReader("reader-b"),
      unavailableReader("reader-c"),
    ]);
    expect(unavailable.terminal_state).toBe("OBSERVATION_INCONCLUSIVE");
  });

  test("records delayed convergence and keeps conflicting execution claims inconclusive without quorum", async () => {
    const delayedJob = makeJob();
    const delayed = await run(delayedJob, [delayedFinalizedReader("reader-a"), delayedFinalizedReader("reader-b"), delayedFinalizedReader("reader-c")]);
    expect(delayed.terminal_state).toBe("FINALIZED");

    const disagreementJob = makeJob();
    const disagreement = await run(disagreementJob, [
      reader("reader-a", { status: "confirmed", slot: 10n }, 90n),
      reader("reader-b", { status: "confirmed", slot: 10n, executionError: { custom: 1 } }, 90n),
      unavailableReader("reader-c"),
    ]);
    expect(disagreement.terminal_state).toBe("OBSERVATION_INCONCLUSIVE");
  });

  test("rejects unknown, invalid-signature, stale, malformed, and conflicting replay evidence", async () => {
    const job = makeJob();
    const unsigned = await run(job, [
      reader("reader-a", { status: "finalized", slot: 10n }, 90n),
      reader("reader-b", { status: "finalized", slot: 10n }, 90n),
      reader("reader-c", { status: "finalized", slot: 10n }, 90n),
    ]);
    const keyPair = generateObserverKeyPair(job.observerId, job.observerKeyId);
    const signed = signProbeResult(unsigned, keyPair);
    const currentEntry: ObserverAllowlistEntry = {
      observerId: keyPair.observerId,
      keyId: keyPair.keyId,
      publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    };
    expect(new IdempotentProbeResultIngestor([]).ingest(signed, new Date("2026-08-24T12:00:01.000Z")))
      .toMatchObject({ status: "REJECTED", reason: "observer key is not allowlisted" });
    const invalidSignature = `${signed.observer_signature[0] === "A" ? "B" : "A"}${signed.observer_signature.slice(1)}`;
    expect(new IdempotentProbeResultIngestor([currentEntry]).ingest({ ...signed, observer_signature: invalidSignature }, new Date("2026-08-24T12:00:01.000Z")))
      .toMatchObject({ status: "REJECTED", reason: /invalid/ });
    const staleEntry = { ...currentEntry, validUntil: "2026-08-23T23:59:59.999Z" };
    expect(new IdempotentProbeResultIngestor([staleEntry]).ingest(signed, new Date("2026-08-24T12:00:01.000Z")))
      .toMatchObject({ status: "REJECTED", reason: /validity interval/ });
    const validator = new ProbeResultSchemaValidator(await loadSchema());
    expect(validator.validate({ ...signed, unexpected: true })).toMatchObject({ valid: false });
    const ingestor = new IdempotentProbeResultIngestor([currentEntry]);
    expect(ingestor.ingest(signed, new Date("2026-08-24T12:00:01.000Z"))).toMatchObject({ status: "ACCEPTED" });
    expect(ingestor.ingest(signed, new Date("2026-08-24T12:00:02.000Z"))).toMatchObject({ status: "DUPLICATE" });
    expect(ingestor.ingest({ ...signed, result_id: randomUUID() }, new Date("2026-08-24T12:00:03.000Z")))
      .toMatchObject({ status: "REJECTED", reason: /conflicts/ });
  });
});

async function run(job: ObservationJob, readers: readonly ObservationReader[]) {
  const directory = await mkdtemp(join(tmpdir(), "sovereignkit-m1-matrix-"));
  temporaryDirectories.push(directory);
  return executeObservationJob({
    job,
    readers,
    rawLogPath: join(directory, "raw.jsonl"),
    sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  });
}

function makeJob(): ObservationJob {
  const observerId = "observer-provider-a";
  const unitId = deriveUnitId({ experimentId: "grant-m1-matrix", experimentVersion: "1", phase: "healthy", observerId, routeId: "route-a", transactionClass: "MATCHED_CONTROL", probeIndex: 0 });
  return {
    schemaVersion: "ObservationJob@0.1.0",
    resultId: randomUUID(),
    observerId,
    observerKeyId: "key-1",
    observerSequence: 0,
    unit: { experiment_id: "grant-m1-matrix", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experimentDefinitionHash: sha256Hex("grant-m1-matrix-definition"),
    signature: "6".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-24T12:00:00.000Z", submitted_at: "2026-08-24T12:00:00.100Z", response_at: "2026-08-24T12:00:00.200Z" },
    pollIntervalMs: 100,
    observationDeadlineMs: 100,
    readerRequestTimeoutMs: 100,
  };
}

function reader(readerId: string, status: SignatureStatusResult, height: bigint): ObservationReader {
  return { readerId, getSignatureStatus: async () => status, getBlockHeight: async () => height };
}

function unavailableReader(readerId: string): ObservationReader {
  return { readerId, getSignatureStatus: async () => { throw new TypeError("unavailable"); }, getBlockHeight: async () => { throw new TypeError("unavailable"); } };
}

function delayedFinalizedReader(readerId: string): ObservationReader {
  let polls = 0;
  return {
    readerId,
    getSignatureStatus: async () => (++polls === 1 ? { status: null } : { status: "finalized", slot: 10n }),
    getBlockHeight: async () => 90n,
  };
}

async function loadSchema(): Promise<object> {
  return JSON.parse(await readFile(new URL("../../../spec/probe-result.schema.json", import.meta.url), "utf8")) as object;
}
