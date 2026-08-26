import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  deriveIdempotencyKey,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  sha256Hex,
  type ObserverAllowlistEntry,
  type UnsignedProbeResult,
} from "@sovereignkit/probes";
import { describe, expect, test } from "vitest";

import { DurableProbeResultCollector } from "../src/durable-collector.js";
import { createCollectorHttpServer } from "../src/http.js";
import { ObserverDeliveryRuntime, type ObserverRuntimeConfig } from "../src/observer-runtime.js";

const artifactDirectory = process.env.SOVEREIGNKIT_RECOVERY_ARTIFACT_DIR === undefined
  ? undefined
  : resolve(process.env.SOVEREIGNKIT_RECOVERY_ARTIFACT_DIR);

describe("Grant Milestone 1 local recovery drill", () => {
  test("retains queued evidence across outage and observer restart, then reconstructs Collector and delivery state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-grant-m1-recovery-"));
    try {
      const keyPair = generateObserverKeyPair("observer-local-recovery", "key-1");
      const keyPath = join(directory, "observer-private.json");
      const spoolDirectory = join(directory, "spool");
      const deliveryLogPath = join(directory, "delivery.jsonl");
      const acceptedLogPath = join(directory, "accepted.jsonl");
      await mkdir(spoolDirectory);
      await writeFile(keyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
      const unsigned = makeUnsignedResult(keyPair.observerId, keyPair.keyId);
      await writeFile(join(spoolDirectory, "000001.json"), `${JSON.stringify(unsigned)}\n`, "utf8");
      const port = await reservePort();
      const config: ObserverRuntimeConfig = {
        schemaVersion: "ObserverRuntimeConfig@0.1.0",
        privateKeyPath: keyPath,
        spoolDirectory,
        deliveryLogPath,
        collectorUrl: `http://127.0.0.1:${port}`,
        pollIntervalMs: 250,
        requestTimeoutMs: 1_000,
        heartbeatIntervalMs: 1_000,
        healthHost: "127.0.0.1",
        healthPort: 0,
      };

      const offlineRuntime = await ObserverDeliveryRuntime.open(config);
      await offlineRuntime.scanOnce(new Date("2026-08-25T12:00:00.000Z"));
      const offline = offlineRuntime.snapshot();
      expect(offline).toMatchObject({ status: "degraded", queuedCount: 1, deliveredCount: 0 });
      await offlineRuntime.close();

      const allowlist: ObserverAllowlistEntry[] = [{ observerId: keyPair.observerId, keyId: keyPair.keyId, publicKeySpkiBase64: keyPair.publicKeySpkiBase64, validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z" }];
      const schema = JSON.parse(await readFile(new URL("../../../spec/probe-result.schema.json", import.meta.url), "utf8")) as object;
      const collector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
      const server = createCollectorHttpServer(collector);
      await listen(server, port);

      const recoveredRuntime = await ObserverDeliveryRuntime.open(config);
      await recoveredRuntime.scanOnce(new Date("2026-08-25T12:01:00.000Z"));
      const delivered = recoveredRuntime.snapshot();
      expect(delivered).toMatchObject({ status: "ready", queuedCount: 0, deliveredCount: 1 });
      expect(collector.storedCount()).toBe(1);
      await recoveredRuntime.close();
      await closeServer(server);
      await collector.close();

      const recoveredCollector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
      const recoveredServer = createCollectorHttpServer(recoveredCollector);
      await listen(recoveredServer, port);
      const finalRuntime = await ObserverDeliveryRuntime.open(config);
      await finalRuntime.scanOnce(new Date("2026-08-25T12:02:00.000Z"));
      const final = finalRuntime.snapshot();
      expect(final).toMatchObject({ status: "ready", queuedCount: 0, deliveredCount: 1 });
      expect(recoveredCollector.storedCount()).toBe(1);
      const deliveryRecords = (await readFile(deliveryLogPath, "utf8")).trimEnd().split("\n");
      expect(deliveryRecords).toHaveLength(1);

      if (artifactDirectory !== undefined) {
        await mkdir(artifactDirectory, { recursive: true });
        await writeFile(join(artifactDirectory, "recovery-evidence.json"), `${JSON.stringify({
          schema_version: "GrantM1LocalRecoveryDrill@0.1.0",
          generated_at: new Date().toISOString(),
          observer_id: keyPair.observerId,
          outage_preserved_queue: offline.status === "degraded" && offline.queuedCount === 1,
          observer_restart_delivered: delivered.status === "ready" && delivered.deliveredCount === 1,
          collector_restart_recovered: recoveredCollector.storedCount() === 1,
          duplicate_delivery_records: deliveryRecords.length - 1,
          restart_succeeded: true,
          recovered_records: recoveredCollector.storedCount(),
          evidence_scope: "LOCAL_SOFTWARE_RECOVERY_ONLY",
          infrastructure_independence: false,
        }, null, 2)}\n`, "utf8");
      }
      await finalRuntime.close();
      await closeServer(recoveredServer);
      await recoveredCollector.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function makeUnsignedResult(observerId: string, keyId: string): UnsignedProbeResult {
  const unitId = sha256Hex(["grant-m1-recovery", "1", "healthy", observerId, "route-a", "MATCHED_CONTROL", "0"].join("\u001f"));
  const claims = ["reader-1", "reader-2"].map(readerId => ({ claim_id: `${unitId}:${readerId}`, reader_id: readerId, observed_at: "2026-08-25T11:59:00.000Z", signature_status: "confirmed" as const, transaction_slot: 2 }));
  return {
    schema_version: "0.1.0",
    result_id: randomUUID(),
    idempotency_key: deriveIdempotencyKey(observerId, unitId),
    observer_id: observerId,
    observer_key_id: keyId,
    observer_sequence: 0,
    unit: { experiment_id: "grant-m1-recovery", experiment_version: "1", phase: "healthy", observer_id: observerId, route_id: "route-a", transaction_class: "MATCHED_CONTROL", probe_index: 0, unit_id: unitId },
    experiment_definition_hash: sha256Hex("grant-m1-recovery-definition"),
    signature: "9".repeat(88),
    submission: { attempt_id: sha256Hex(`${unitId}:attempt-1`), attempt_number: 1, outcome: "RPC_ACKNOWLEDGED", blockhash: "11111111111111111111111111111111", blockhash_context_slot: 1, last_valid_block_height: 100, serialized_size_bytes: 240, created_at: "2026-08-25T11:58:00.000Z", submitted_at: "2026-08-25T11:58:01.000Z", response_at: "2026-08-25T11:58:02.000Z" },
    reader_claims: claims,
    quorum_decisions: [{ decision_id: sha256Hex(`${unitId}:confirmed`), decision_type: "CONFIRMED", supporting_claim_ids: claims.map(claim => claim.claim_id), decided_at: "2026-08-25T11:59:01.000Z", quorum_rule_version: "ObservationQuorum@0.1.0" }],
    terminal_state: "CONFIRMED",
    observer_wall_time: "2026-08-25T11:59:02.000Z",
  };
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolveListen); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("could not reserve recovery drill port");
  await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  return address.port;
}

async function listen(server: ReturnType<typeof createCollectorHttpServer>, port: number): Promise<void> {
  await new Promise<void>((resolveListen, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolveListen); });
}

async function closeServer(server: ReturnType<typeof createCollectorHttpServer>): Promise<void> {
  await new Promise<void>(resolveClose => server.close(() => resolveClose()));
}
