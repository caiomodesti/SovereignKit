import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ObservationReader, SignatureStatusResult } from "@sovereignkit/telemetry";
import {
  deriveUnitId,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  sha256Hex,
  type ObserverAllowlistEntry,
} from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

import { DurableProbeResultCollector } from "../src/durable-collector.js";
import { createCollectorHttpServer } from "../src/http.js";
import { executeObservationJob, type ObservationJob } from "../src/observation-worker.js";
import { ObserverDeliveryRuntime, type ObserverRuntimeConfig } from "../src/observer-runtime.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("Grant Milestone 1 local end-to-end software path", () => {
  test("derives raw reader evidence, signs locally, delivers, validates, and durably collects", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-grant-m1-e2e-"));
    temporaryDirectories.push(directory);
    const spool = join(directory, "spool");
    await mkdir(spool);
    const keyPair = generateObserverKeyPair("observer-local-e2e", "key-1");
    const keyPath = join(directory, "observer-private.json");
    await writeFile(keyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
    const job = makeJob(keyPair.observerId, keyPair.keyId);
    const rawLogPath = join(directory, "raw-observations.jsonl");
    const unsigned = await executeObservationJob({
      job,
      readers: [
        reader("reader-a", { status: "finalized", slot: 42n, rpcContextSlot: 43n }, 90n),
        reader("reader-b", { status: "finalized", slot: 42n, rpcContextSlot: 43n }, 90n),
        reader("reader-c", { status: "confirmed", slot: 42n, rpcContextSlot: 43n }, 90n),
      ],
      rawLogPath,
    });
    await writeFile(join(spool, "000001.json"), `${JSON.stringify(unsigned)}\n`, "utf8");

    const allowlist: ObserverAllowlistEntry[] = [{
      observerId: keyPair.observerId,
      keyId: keyPair.keyId,
      publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }];
    const schema = JSON.parse(await readFile(join(repositoryRoot, "spec", "probe-result.schema.json"), "utf8")) as object;
    const acceptedLogPath = join(directory, "accepted.jsonl");
    const collector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
    const server = createCollectorHttpServer(collector);
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("collector did not bind a TCP port");
    const config: ObserverRuntimeConfig = {
      schemaVersion: "ObserverRuntimeConfig@0.1.0",
      privateKeyPath: keyPath,
      spoolDirectory: spool,
      deliveryLogPath: join(directory, "delivery.jsonl"),
      collectorUrl: `http://127.0.0.1:${address.port}`,
      pollIntervalMs: 250,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 1_000,
      healthHost: "127.0.0.1",
      healthPort: 0,
    };
    const runtime = await ObserverDeliveryRuntime.open(config);
    await runtime.scanOnce();
    expect(runtime.snapshot()).toMatchObject({ status: "ready", deliveredCount: 1, queuedCount: 0 });
    expect(collector.storedCount()).toBe(1);
    expect((await readFile(rawLogPath, "utf8")).trimEnd().split("\n")).toHaveLength(1);
    expect((await readFile(config.deliveryLogPath, "utf8")).trimEnd().split("\n")).toHaveLength(1);
    const accepted = JSON.parse((await readFile(acceptedLogPath, "utf8")).trim()) as { result: { terminal_state: string; observer_id: string } };
    expect(accepted.result).toMatchObject({ terminal_state: "FINALIZED", observer_id: keyPair.observerId });
    await runtime.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    await collector.close();
  });
});

function makeJob(observerId: string, observerKeyId: string): ObservationJob {
  const unitId = deriveUnitId({ experimentId: "grant-m1-local-e2e", experimentVersion: "1", phase: "healthy", observerId, routeId: "route-a", transactionClass: "MATCHED_CONTROL", probeIndex: 0 });
  return {
    schemaVersion: "ObservationJob@0.1.0",
    resultId: randomUUID(),
    observerId,
    observerKeyId,
    observerSequence: 0,
    unit: { experiment_id: "grant-m1-local-e2e", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experimentDefinitionHash: sha256Hex("grant-m1-local-e2e-definition"),
    signature: "7".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-24T12:00:00.000Z", submitted_at: "2026-08-24T12:00:00.100Z", response_at: "2026-08-24T12:00:00.200Z" },
    pollIntervalMs: 100,
    observationDeadlineMs: 1_000,
    readerRequestTimeoutMs: 100,
  };
}

function reader(readerId: string, status: SignatureStatusResult, height: bigint): ObservationReader {
  return { readerId, getSignatureStatus: async () => status, getBlockHeight: async () => height };
}
