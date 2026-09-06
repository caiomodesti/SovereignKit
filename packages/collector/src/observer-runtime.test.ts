import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deriveIdempotencyKey,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  sha256Hex,
  type ObserverAllowlistEntry,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";
import { afterEach, describe, expect, test } from "vitest";

import { DurableProbeResultCollector } from "./durable-collector.js";
import { createCollectorHttpServer } from "./http.js";
import { createObserverHealthServer, ObserverDeliveryRuntime, type ObserverRuntimeConfig } from "./observer-runtime.js";

const temporaryDirectories: string[] = [];
const servers: ReturnType<typeof createCollectorHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe("deployable observer delivery runtime", () => {
  test("remains unready until its first spool scan completes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-starting-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    await writeFile(keyPath, JSON.stringify(exportObserverPrivateKey(keyPair)), { mode: 0o600 });
    const runtime = await ObserverDeliveryRuntime.open(makeRuntimeConfig(directory, keyPath, "https://collector.example"));
    try {
      expect(runtime.snapshot()).toMatchObject({
        status: "degraded",
        deliveredCount: 0,
        queuedCount: 0,
        lastError: "initial spool scan has not completed",
      });
      await runtime.scanOnce();
      expect(runtime.snapshot()).toMatchObject({ status: "ready", deliveredCount: 0, queuedCount: 0 });
    } finally { await runtime.close(); }
  });

  test("retries a timed-out delivery on the next scan and clears degraded readiness", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-timeout-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    await writeFile(keyPath, JSON.stringify(exportObserverPrivateKey(keyPair)), { mode: 0o600 });
    let requests = 0;
    const server = createServer((request, response) => {
      request.resume();
      requests += 1;
      if (requests === 1) {
        setTimeout(() => response.destroy(), 1_100);
        return;
      }
      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ACCEPTED" }));
    });
    servers.push(server);
    const port = await listen(server);
    const runtime = await ObserverDeliveryRuntime.open(makeRuntimeConfig(directory, keyPath, `http://127.0.0.1:${port}`));
    await writeFile(join(directory, "spool", "1.json"), JSON.stringify(makeUnsignedResult(keyPair.observerId, keyPair.keyId)));
    try {
      await runtime.scanOnce();
      expect(runtime.snapshot()).toMatchObject({ status: "degraded", queuedCount: 1, deliveredCount: 0 });
      await runtime.scanOnce();
      expect(requests).toBe(2);
      expect(runtime.snapshot()).toMatchObject({ status: "ready", queuedCount: 0, deliveredCount: 1 });
    } finally { await runtime.close(); }
  });

  test("recovers after a durable Collector commit whose acknowledgement was lost", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-lost-ack-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    const acceptedLogPath = join(directory, "accepted.jsonl");
    await writeFile(keyPath, JSON.stringify(exportObserverPrivateKey(keyPair)), { mode: 0o600 });
    const allowlist: ObserverAllowlistEntry[] = [{
      observerId: keyPair.observerId, keyId: keyPair.keyId, publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
    }];
    const collector = await DurableProbeResultCollector.open({ schema: await loadSchema(), allowlist, acceptedLogPath });
    let requests = 0;
    const server = createServer(async (request, response) => {
      let body = "";
      request.setEncoding("utf8");
      for await (const chunk of request) body += chunk;
      requests += 1;
      const outcome = await collector.ingest(JSON.parse(body) as unknown);
      if (requests === 1) {
        response.destroy();
        return;
      }
      response.writeHead(outcome.status === "DUPLICATE" ? 200 : 201, { "content-type": "application/json" });
      response.end(JSON.stringify(outcome));
    });
    servers.push(server);
    const port = await listen(server);
    const config = makeRuntimeConfig(directory, keyPath, `http://127.0.0.1:${port}`);
    const firstRuntime = await ObserverDeliveryRuntime.open(config);
    await writeFile(join(directory, "spool", "1.json"), JSON.stringify(makeUnsignedResult(keyPair.observerId, keyPair.keyId)));
    await firstRuntime.scanOnce();
    expect(firstRuntime.snapshot()).toMatchObject({ status: "degraded", queuedCount: 1, deliveredCount: 0 });
    expect(collector.storedCount()).toBe(1);
    await firstRuntime.close();

    const restartedRuntime = await ObserverDeliveryRuntime.open(config);
    try {
      expect(restartedRuntime.snapshot()).toMatchObject({ status: "degraded", deliveredCount: 0 });
      await restartedRuntime.scanOnce();
      expect(requests).toBe(2);
      expect(collector.storedCount()).toBe(1);
      expect(restartedRuntime.snapshot()).toMatchObject({ status: "ready", queuedCount: 0, deliveredCount: 1 });
      const [record] = (await readFile(join(directory, "delivery.jsonl"), "utf8")).trimEnd().split("\n");
      expect(JSON.parse(record!) as object).toMatchObject({ collector_status: "DUPLICATE", delivery_sequence: 0 });
      await restartedRuntime.scanOnce();
      expect(requests).toBe(2);
    } finally {
      await restartedRuntime.close();
      await collector.close();
    }
  });

  test.each([503, 429, 408, 200, 400])("preserves delivery and readiness semantics after HTTP %s", async (failureStatus) => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-retry-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    const spoolDirectory = join(directory, "spool");
    const deliveryLogPath = join(directory, "delivery.jsonl");
    await writeFile(keyPath, JSON.stringify(exportObserverPrivateKey(keyPair)), { mode: 0o600 });
    let requests = 0;
    const server = createServer((request, response) => {
      request.resume();
      requests += 1;
      response.writeHead(requests < 3 ? failureStatus : 200, { "content-type": "application/json" });
      response.end(requests < 3 ? (failureStatus === 200 ? "invalid json" : JSON.stringify({ status: "UNAVAILABLE" })) : JSON.stringify({ status: "ACCEPTED" }));
    });
    servers.push(server);
    const port = await listen(server);
    const runtime = await ObserverDeliveryRuntime.open({
      schemaVersion: "ObserverRuntimeConfig@0.1.0", privateKeyPath: keyPath,
      spoolDirectory, deliveryLogPath, collectorUrl: `http://127.0.0.1:${port}`,
      pollIntervalMs: 250, requestTimeoutMs: 1000, heartbeatIntervalMs: 1000,
      healthHost: "127.0.0.1", healthPort: 0,
    });
    try {
      await writeFile(join(spoolDirectory, "1.json"), JSON.stringify(makeUnsignedResult(keyPair.observerId, keyPair.keyId)));
      for (let index = 0; index < 2; index += 1) {
        await runtime.scanOnce();
        expect(runtime.snapshot()).toMatchObject({ status: "degraded", queuedCount: 1, deliveredCount: 0 });
      }
      await runtime.scanOnce();
      if (failureStatus === 400) {
        expect(requests).toBe(1);
        expect(runtime.snapshot()).toMatchObject({ status: "degraded", queuedCount: 1, deliveredCount: 0 });
        expect(await readFile(deliveryLogPath, "utf8")).toBe("");
        return;
      }
      expect(requests).toBe(3);
      expect(runtime.snapshot()).toMatchObject({ status: "ready", queuedCount: 0, deliveredCount: 1 });
      await runtime.scanOnce();
      expect(requests).toBe(3);
      expect((await readFile(deliveryLogPath, "utf8")).trim().split("\n")).toHaveLength(1);
    } finally { await runtime.close(); }
  });

  test("signs a queued result, durably records delivery, exposes health, and does not redeliver it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-runtime-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    const spoolDirectory = join(directory, "spool");
    const deliveryLogPath = join(directory, "delivery.jsonl");
    const acceptedLogPath = join(directory, "accepted.jsonl");
    await writeFile(keyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
    await import("node:fs/promises").then(module => module.mkdir(spoolDirectory, { recursive: true }));
    const allowlist: ObserverAllowlistEntry[] = [{
      observerId: keyPair.observerId,
      keyId: keyPair.keyId,
      publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    }];
    const collector = await DurableProbeResultCollector.open({ schema: await loadSchema(), allowlist, acceptedLogPath });
    const collectorServer = createCollectorHttpServer(collector);
    servers.push(collectorServer);
    const collectorPort = await listen(collectorServer);
    const unsigned = makeUnsignedResult(keyPair.observerId, keyPair.keyId);
    await writeFile(join(spoolDirectory, "000001.json"), `${JSON.stringify(unsigned)}\n`, "utf8");

    const config: ObserverRuntimeConfig = {
      schemaVersion: "ObserverRuntimeConfig@0.1.0",
      privateKeyPath: keyPath,
      spoolDirectory,
      deliveryLogPath,
      collectorUrl: `http://127.0.0.1:${collectorPort}`,
      pollIntervalMs: 250,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 1_000,
      healthHost: "127.0.0.1",
      healthPort: 0,
    };
    const runtime = await ObserverDeliveryRuntime.open(config);
    await runtime.scanOnce();
    expect(runtime.snapshot()).toMatchObject({ status: "ready", deliveredCount: 1, queuedCount: 0, observerId: keyPair.observerId });
    expect(collector.storedCount()).toBe(1);
    await runtime.scanOnce();
    expect(collector.storedCount()).toBe(1);
    expect((await readFile(deliveryLogPath, "utf8")).trimEnd().split("\n")).toHaveLength(1);

    const healthServer = createObserverHealthServer(runtime);
    servers.push(healthServer);
    const healthPort = await listen(healthServer);
    const health = await fetch(`http://127.0.0.1:${healthPort}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ready", deliveredCount: 1 });
    await runtime.close();
    await collector.close();
  });

  test("refuses plaintext remote collectors and identity-mismatched spool work", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-observer-runtime-"));
    temporaryDirectories.push(directory);
    const keyPair = generateObserverKeyPair("observer-provider-a", "key-1");
    const keyPath = join(directory, "observer-private.json");
    const spoolDirectory = join(directory, "spool");
    await writeFile(keyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
    await import("node:fs/promises").then(module => module.mkdir(spoolDirectory, { recursive: true }));
    const base = {
      schemaVersion: "ObserverRuntimeConfig@0.1.0" as const,
      privateKeyPath: keyPath,
      spoolDirectory,
      deliveryLogPath: join(directory, "delivery.jsonl"),
      pollIntervalMs: 250,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 1_000,
      healthHost: "127.0.0.1" as const,
      healthPort: 0,
    };
    await expect(ObserverDeliveryRuntime.open({ ...base, collectorUrl: "http://collector.example" }))
      .rejects.toThrow(/must use HTTPS/);

    const runtime = await ObserverDeliveryRuntime.open({ ...base, collectorUrl: "https://collector.example" });
    await writeFile(join(spoolDirectory, "mismatch.json"), `${JSON.stringify(makeUnsignedResult("different-observer", "key-1"))}\n`, "utf8");
    await runtime.scanOnce();
    expect(runtime.snapshot()).toMatchObject({ status: "degraded", deliveredCount: 0, queuedCount: 1 });
    expect(runtime.snapshot().lastError).toMatch(/identity does not match/);
    await runtime.close();
  });
});

function makeRuntimeConfig(directory: string, privateKeyPath: string, collectorUrl: string): ObserverRuntimeConfig {
  return {
    schemaVersion: "ObserverRuntimeConfig@0.1.0",
    privateKeyPath,
    spoolDirectory: join(directory, "spool"),
    deliveryLogPath: join(directory, "delivery.jsonl"),
    collectorUrl,
    pollIntervalMs: 250,
    requestTimeoutMs: 1_000,
    heartbeatIntervalMs: 1_000,
    healthHost: "127.0.0.1",
    healthPort: 0,
  };
}

async function loadSchema(): Promise<object> {
  return JSON.parse(await readFile(new URL("../../../spec/probe-result.schema.json", import.meta.url), "utf8")) as object;
}

async function listen(server: ReturnType<typeof createCollectorHttpServer>): Promise<number> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not bind a TCP port");
  return address.port;
}

function makeUnsignedResult(observerId: string, keyId: string): UnsignedProbeResult {
  const unitId = sha256Hex(["grant-m1-runtime", "1", "healthy", observerId, "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
  const claimIds = [`${unitId}:reader-1`, `${unitId}:reader-2`];
  return {
    schema_version: "0.1.0",
    result_id: randomUUID(),
    idempotency_key: deriveIdempotencyKey(observerId, unitId),
    observer_id: observerId,
    observer_key_id: keyId,
    observer_sequence: 0,
    unit: { experiment_id: "grant-m1-runtime", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experiment_definition_hash: sha256Hex("grant-m1-runtime-definition"),
    signature: "5".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-24T12:00:00.000Z", submitted_at: "2026-08-24T12:00:00.100Z", response_at: "2026-08-24T12:00:00.200Z" },
    reader_claims: [
      { claim_id: claimIds[0]!, reader_id: "reader-1", observed_at: "2026-08-24T12:00:00.300Z", signature_status: "confirmed", transaction_slot: 2 },
      { claim_id: claimIds[1]!, reader_id: "reader-2", observed_at: "2026-08-24T12:00:00.310Z", signature_status: "confirmed", transaction_slot: 2 },
    ],
    quorum_decisions: [{ decision_id: sha256Hex(`${unitId}:confirmed`), decision_type: "CONFIRMED", supporting_claim_ids: claimIds, decided_at: "2026-08-24T12:00:00.320Z", quorum_rule_version: "ObservationQuorum@0.1.0" }],
    terminal_state: "CONFIRMED",
    observer_wall_time: "2026-08-24T12:00:00.400Z",
  };
}
