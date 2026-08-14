import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deriveIdempotencyKey,
  generateObserverKeyPair,
  sha256Hex,
  signProbeResult,
  type ObserverAllowlistEntry,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

import { DurableProbeResultCollector } from "./durable-collector.js";
import { ProbeResultSchemaValidator } from "./validation.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("ProbeResult Draft 2020-12 validation", () => {
  test("accepts deterministic internal identifiers and rejects unknown fields", async () => {
    const schema = await loadSchema();
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const result = signProbeResult(makeUnsignedResult(), keyPair);
    const validator = new ProbeResultSchemaValidator(schema);
    expect(validator.validate(result)).toMatchObject({ valid: true });
    expect(validator.validate({ ...result, unexpected: true })).toMatchObject({ valid: false });
  });
});

describe("durable idempotent Collector", () => {
  test("fsyncs accepted evidence and rebuilds replay protection after restart", async () => {
    const directory = await makeTemporaryDirectory();
    const logPath = join(directory, "accepted.jsonl");
    const schema = await loadSchema();
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const result = signProbeResult(makeUnsignedResult(), keyPair);
    const allowlist = [allowlistFor(keyPair)];

    const first = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath: logPath });
    expect(await first.ingest(result, new Date("2026-08-13T12:00:01.000Z"))).toMatchObject({ status: "ACCEPTED", collectorSequence: 0 });
    expect(await first.ingest(result, new Date("2026-08-13T12:00:02.000Z"))).toMatchObject({ status: "DUPLICATE", storedCount: 1 });
    await first.close();

    expect((await readFile(logPath, "utf8")).trimEnd().split("\n")).toHaveLength(1);
    const restarted = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath: logPath });
    expect(restarted.storedCount()).toBe(1);
    expect(await restarted.ingest(result, new Date("2026-08-13T12:00:03.000Z"))).toMatchObject({ status: "DUPLICATE", storedCount: 1 });
    await restarted.close();
  });

  test("fails closed on a partial trailing record", async () => {
    const directory = await makeTemporaryDirectory();
    const logPath = join(directory, "accepted.jsonl");
    await writeFile(logPath, "{\"collector_sequence\":0", "utf8");
    await expect(DurableProbeResultCollector.open({ schema: await loadSchema(), allowlist: [], acceptedLogPath: logPath }))
      .rejects.toThrow(/partial trailing record/);
  });

  test("rejects schema-invalid input without writing it", async () => {
    const directory = await makeTemporaryDirectory();
    const logPath = join(directory, "accepted.jsonl");
    const keyPair = generateObserverKeyPair("observer-br", "key-1");
    const collector = await DurableProbeResultCollector.open({ schema: await loadSchema(), allowlist: [allowlistFor(keyPair)], acceptedLogPath: logPath });
    const signed = signProbeResult(makeUnsignedResult(), keyPair);
    expect(await collector.ingest({ ...signed, extra_unsigned_field: true })).toMatchObject({ status: "REJECTED", reason: /schema validation failed/ });
    expect(collector.storedCount()).toBe(0);
    await collector.close();
    expect(await readFile(logPath, "utf8")).toBe("");
  });
});

async function loadSchema(): Promise<object> {
  const url = new URL("../../../spec/probe-result.schema.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8")) as object;
}

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sovereignkit-collector-"));
  temporaryDirectories.push(directory);
  return directory;
}

function allowlistFor(keyPair: ReturnType<typeof generateObserverKeyPair>): ObserverAllowlistEntry {
  return {
    observerId: keyPair.observerId,
    keyId: keyPair.keyId,
    publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-09-01T00:00:00.000Z",
  };
}

function makeUnsignedResult(): UnsignedProbeResult {
  const unitId = sha256Hex(["sprint-6-controlled", "1", "healthy", "observer-br", "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
  const firstClaimId = `${unitId}:reader-1`;
  const secondClaimId = `${unitId}:reader-2`;
  return {
    schema_version: "0.1.0",
    result_id: randomUUID(),
    idempotency_key: deriveIdempotencyKey("observer-br", unitId),
    observer_id: "observer-br",
    observer_key_id: "key-1",
    observer_sequence: 1,
    unit: {
      experiment_id: "sprint-6-controlled",
      experiment_version: "1",
      phase: "healthy",
      observer_id: "observer-br",
      route_id: "route-a",
      transaction_class: "MATCHED_CONTROL",
      probe_index: 0,
      unit_id: unitId,
    },
    experiment_definition_hash: sha256Hex("experiment-definition"),
    signature: "4".repeat(88),
    submission: {
      attempt_id: sha256Hex(`${unitId}:attempt-1`),
      attempt_number: 1,
      outcome: "RPC_ACKNOWLEDGED",
      blockhash: "11111111111111111111111111111111",
      blockhash_context_slot: 400,
      last_valid_block_height: 500,
      serialized_size_bytes: 240,
      created_at: "2026-08-13T12:00:00.000Z",
      submitted_at: "2026-08-13T12:00:00.100Z",
      response_at: "2026-08-13T12:00:00.200Z",
    },
    reader_claims: [
      { claim_id: firstClaimId, reader_id: "reader-1", observed_at: "2026-08-13T12:00:00.300Z", signature_status: "confirmed", transaction_slot: 401 },
      { claim_id: secondClaimId, reader_id: "reader-2", observed_at: "2026-08-13T12:00:00.310Z", signature_status: "confirmed", transaction_slot: 401 },
    ],
    quorum_decisions: [{
      decision_id: sha256Hex(`${unitId}:confirmed`),
      decision_type: "CONFIRMED",
      supporting_claim_ids: [firstClaimId, secondClaimId],
      decided_at: "2026-08-13T12:00:00.320Z",
      quorum_rule_version: "ObservationQuorum@0.1.0",
    }],
    terminal_state: "CONFIRMED",
    observer_wall_time: "2026-08-13T12:00:00.400Z",
  };
}
