import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ObservationReader, SignatureStatusResult } from "@sovereignkit/telemetry";
import { deriveUnitId, generateObserverKeyPair, sha256Hex, signProbeResult } from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

import {
  generateAssignmentAuthorityKeyPair,
  signObservationAssignment,
  type AssignmentAuthorityAllowlistEntry,
  type SignedObservationAssignment,
} from "./observation-assignment.js";
import { executeObservationAssignment, type ObservationJob } from "./observation-worker.js";
import { ProbeResultSchemaValidator } from "./validation.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("independent observation worker", () => {
  test("derives FINALIZED from two real reader responses and produces schema-valid signable evidence", async () => {
    const directory = await temporaryDirectory();
    const job = makeJob();
    const readers = [
      reader("reader-a", { status: "finalized", slot: 12n, rpcContextSlot: 13n }, 90n),
      reader("reader-b", { status: "finalized", slot: 12n, rpcContextSlot: 13n }, 90n),
      reader("reader-c", { status: "confirmed", slot: 12n, rpcContextSlot: 13n }, 90n),
    ];
    const result = await executeObservationAssignment({ ...assigned(job), readers, rawLogPath: join(directory, "raw.jsonl") });
    expect(result).toMatchObject({ terminal_state: "FINALIZED", observer_id: job.observerId });
    expect(result.reader_claims).toHaveLength(3);
    expect(result.quorum_decisions[0]?.supporting_claim_ids).toHaveLength(2);
    const key = generateObserverKeyPair(job.observerId, job.observerKeyId);
    const signed = signProbeResult(result, key);
    const validator = new ProbeResultSchemaValidator(await loadSchema());
    expect(validator.validate(signed)).toMatchObject({ valid: true });
    expect((await readFile(join(directory, "raw.jsonl"), "utf8")).trimEnd().split("\n")).toHaveLength(1);
  });

  test("distinguishes failed execution, expiry, and unavailable-reader inconclusiveness", async () => {
    const failedDirectory = await temporaryDirectory();
    const failedJob = makeJob();
    const failed = await executeObservationAssignment({
      ...assigned(failedJob),
      readers: [
        reader("reader-a", { status: "confirmed", slot: 12n, executionError: { InstructionError: [0, "Custom"] } }, 90n),
        reader("reader-b", { status: "confirmed", slot: 12n, executionError: { InstructionError: [0, "Custom"] } }, 90n),
        reader("reader-c", { status: "confirmed", slot: 12n }, 90n),
      ],
      rawLogPath: join(failedDirectory, "raw.jsonl"),
    });
    expect(failed.terminal_state).toBe("OBSERVED_EXECUTION_FAILED");

    const expiredDirectory = await temporaryDirectory();
    const expiredJob = makeJob();
    const expired = await executeObservationAssignment({
      ...assigned(expiredJob),
      readers: [reader("reader-a", { status: null }, 101n), reader("reader-b", { status: null }, 102n), reader("reader-c", { status: null }, 99n)],
      rawLogPath: join(expiredDirectory, "raw.jsonl"),
    });
    expect(expired.terminal_state).toBe("EXPIRED");

    const unavailableDirectory = await temporaryDirectory();
    const unavailableJob = { ...makeJob(), observationDeadlineMs: 100, pollIntervalMs: 100 };
    const unavailable = await executeObservationAssignment({
      ...assigned(unavailableJob),
      readers: [unavailableReader("reader-a"), unavailableReader("reader-b"), unavailableReader("reader-c")],
      rawLogPath: join(unavailableDirectory, "raw.jsonl"),
      sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    });
    expect(unavailable.terminal_state).toBe("OBSERVATION_INCONCLUSIVE");
    expect(unavailable.reader_claims.every(claim => claim.reader_error === "TRANSPORT+TRANSPORT")).toBe(true);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observation-worker-"));
  temporaryDirectories.push(directory);
  return directory;
}

function makeJob(): ObservationJob {
  const observerId = "observer-provider-a";
  const unit = {
    experiment_id: "grant-m1-observation",
    experiment_version: "1",
    phase: "healthy" as const,
    observer_id: observerId,
    route_id: "route-a",
    transaction_class: "MATCHED_CONTROL" as const,
    probe_index: 0,
    unit_id: deriveUnitId({ experimentId: "grant-m1-observation", experimentVersion: "1", phase: "healthy", observerId, routeId: "route-a", transactionClass: "MATCHED_CONTROL", probeIndex: 0 }),
  };
  return {
    schemaVersion: "ObservationJob@0.1.0",
    resultId: randomUUID(),
    observerId,
    observerKeyId: "key-1",
    observerSequence: 0,
    unit,
    experimentDefinitionHash: sha256Hex("grant-m1-observation-definition"),
    signature: "5".repeat(88),
    submission: {
      attempt_id: sha256Hex(`${unit.unit_id}:attempt-1`),
      attempt_number: 1,
      outcome: "RPC_ACKNOWLEDGED",
      blockhash: "11111111111111111111111111111111",
      blockhash_context_slot: 1,
      last_valid_block_height: 100,
      serialized_size_bytes: 240,
      created_at: "2026-08-24T12:00:00.000Z",
      submitted_at: "2026-08-24T12:00:00.100Z",
      response_at: "2026-08-24T12:00:00.200Z",
    },
    pollIntervalMs: 100,
    observationDeadlineMs: 1_000,
    readerRequestTimeoutMs: 100,
  };
}

function reader(readerId: string, status: SignatureStatusResult, height: bigint): ObservationReader {
  return {
    readerId,
    getSignatureStatus: async () => status,
    getBlockHeight: async () => height,
  };
}

function unavailableReader(readerId: string): ObservationReader {
  return {
    readerId,
    getSignatureStatus: async () => { throw new TypeError("network unavailable"); },
    getBlockHeight: async () => { throw new TypeError("network unavailable"); },
  };
}

function assigned(job: ObservationJob): {
  readonly assignment: SignedObservationAssignment;
  readonly authority: AssignmentAuthorityAllowlistEntry;
  readonly now: () => Date;
} {
  const key = generateAssignmentAuthorityKeyPair("grant-coordinator", "assignment-key-1");
  const assignment = signObservationAssignment({
    schemaVersion: "ObservationAssignment@0.1.0",
    assignmentId: randomUUID(),
    issuerId: key.issuerId,
    issuerKeyId: key.keyId,
    issuedAt: "2026-08-25T11:59:00.000Z",
    expiresAt: "2026-08-25T13:00:00.000Z",
    job,
  }, key);
  return {
    assignment,
    authority: { issuerId: key.issuerId, keyId: key.keyId, publicKeySpkiBase64: key.publicKeySpkiBase64, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" },
    now: () => new Date("2026-08-25T12:00:00.000Z"),
  };
}

async function loadSchema(): Promise<object> {
  return JSON.parse(await readFile(new URL("../../../spec/probe-result.schema.json", import.meta.url), "utf8")) as object;
}
