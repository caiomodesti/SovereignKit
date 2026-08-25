import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";
import { SolanaKitObservationReader } from "@sovereignkit/telemetry";
import {
  deriveUnitId,
  exportObserverPrivateKey,
  generateObserverKeyPair,
  sha256Hex,
  type ObserverAllowlistEntry,
} from "@sovereignkit/probes";
import { describe, expect, test } from "vitest";

import { DurableProbeResultCollector } from "../src/durable-collector.js";
import { createCollectorHttpServer } from "../src/http.js";
import { executeObservationJob, type ObservationJob } from "../src/observation-worker.js";
import {
  createObserverHealthServer,
  ObserverDeliveryRuntime,
  type ObserverRuntimeConfig,
} from "../src/observer-runtime.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const enabled = process.env.SOVEREIGNKIT_RUN_GRANT_M1_LOCAL_READINESS === "1";
const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/grant-m1/local-readiness/manual-run");
const runtimeCommit = process.env.SOVEREIGNKIT_RUNTIME_COMMIT ?? "0000000000000000000000000000000000000000";

describe.skipIf(!enabled)("Grant Milestone 1 retained local readiness proof", () => {
  test("retains a real Solana observation from job through signed durable collection", async () => {
    expect(runtimeCommit).toMatch(/^[a-f0-9]{40}$/u);
    await mkdir(artifactDirectory, { recursive: true });
    const secretDirectory = await mkdtemp(join(tmpdir(), "sovereignkit-grant-m1-local-secret-"));
    try {
      const rpc = createSolanaRpc(endpoint);
      expect(await rpc.getHealth().send()).toBe("ok");

      const [feePayer, recipient] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
      const airdropSignature = await rpc.requestAirdrop(
        feePayer.address,
        lamports(2_000_000_000n),
        { commitment: "confirmed" },
      ).send();
      await waitForStatus(rpc, airdropSignature, "confirmed");

      const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const transferData = new Uint8Array(12);
      const view = new DataView(transferData.buffer);
      view.setUint32(0, 2, true);
      view.setBigUint64(4, 1_000_000n, true);
      const message = pipe(
        createTransactionMessage({ version: "legacy" }),
        value => setTransactionMessageFeePayerSigner(feePayer, value),
        value => setTransactionMessageLifetimeUsingBlockhash(latest.value, value),
        value => appendTransactionMessageInstruction({
          programAddress: address("11111111111111111111111111111111"),
          accounts: [
            { address: feePayer.address, role: AccountRole.WRITABLE_SIGNER, signer: feePayer },
            { address: recipient.address, role: AccountRole.WRITABLE },
          ],
          data: transferData,
        }, value),
      );
      const signedTransaction = await signTransactionMessageWithSigners(message);
      const signature = getSignatureFromTransaction(signedTransaction);
      const encoded = getBase64EncodedWireTransaction(signedTransaction);
      const createdAt = new Date().toISOString();
      const submittedAt = new Date().toISOString();
      const returnedSignature = await rpc.sendTransaction(encoded as Base64EncodedWireTransaction, {
        encoding: "base64",
        maxRetries: 5n,
        minContextSlot: latest.context.slot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }).send();
      const responseAt = new Date().toISOString();
      expect(returnedSignature).toBe(signature);

      const observerId = "observer-local-readiness";
      const keyId = `local-${Date.now()}`;
      const keyPair = generateObserverKeyPair(observerId, keyId);
      const privateKeyPath = join(secretDirectory, "observer-private.json");
      await writeFile(privateKeyPath, `${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, { encoding: "utf8", mode: 0o600 });
      const validFrom = new Date(Date.now() - 60_000).toISOString();
      const validUntil = new Date(Date.now() + 86_400_000).toISOString();
      const allowlist: ObserverAllowlistEntry[] = [{
        observerId,
        keyId,
        publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
        validFrom,
        validUntil,
      }];
      await writeJson(join(artifactDirectory, "allowlist-public.json"), allowlist);

      const unitId = deriveUnitId({
        experimentId: "grant-m1-local-readiness",
        experimentVersion: "1",
        phase: "healthy",
        observerId,
        routeId: "local-agave-direct",
        transactionClass: "MATCHED_CONTROL",
        probeIndex: 0,
      });
      const job: ObservationJob = {
        schemaVersion: "ObservationJob@0.1.0",
        resultId: randomUUID(),
        observerId,
        observerKeyId: keyId,
        observerSequence: 0,
        unit: {
          experiment_id: "grant-m1-local-readiness",
          experiment_version: "1",
          phase: "healthy",
          observer_id: observerId,
          route_id: "local-agave-direct",
          transaction_class: "MATCHED_CONTROL",
          probe_index: 0,
          unit_id: unitId,
        },
        experimentDefinitionHash: sha256Hex("grant-m1-local-readiness-v1"),
        signature,
        submission: {
          attempt_id: sha256Hex(`${unitId}:attempt-1`),
          attempt_number: 1,
          outcome: "RPC_ACKNOWLEDGED",
          blockhash: latest.value.blockhash,
          blockhash_context_slot: Number(latest.context.slot),
          last_valid_block_height: Number(latest.value.lastValidBlockHeight),
          serialized_size_bytes: Buffer.from(encoded, "base64").byteLength,
          created_at: createdAt,
          submitted_at: submittedAt,
          response_at: responseAt,
        },
        pollIntervalMs: 100,
        observationDeadlineMs: 60_000,
        readerRequestTimeoutMs: 2_000,
      };
      const readerRegistry = {
        schemaVersion: "ObservationReaderRegistry@0.1.0",
        readers: [
          { readerId: "logical-reader-1", endpoint },
          { readerId: "logical-reader-2", endpoint },
          { readerId: "logical-reader-3", endpoint },
        ],
        independence: "LOGICAL_REDUNDANCY_ONLY",
        limitation: "All three reader clients share one project-controlled local Agave validator.",
      };
      await Promise.all([
        writeJson(join(artifactDirectory, "observation-job.json"), job),
        writeJson(join(artifactDirectory, "reader-registry.json"), readerRegistry),
      ]);

      const rawLogPath = join(artifactDirectory, "raw-observations.jsonl");
      const readers = readerRegistry.readers.map(value => new SolanaKitObservationReader(value.readerId, value.endpoint));
      const unsigned = await executeObservationJob({ job, readers, rawLogPath });
      expect(unsigned.terminal_state).toBe("FINALIZED");
      const spool = join(artifactDirectory, "spool");
      await mkdir(spool);
      const unsignedPath = join(spool, "000000.json");
      await writeJson(unsignedPath, unsigned);

      const schema = JSON.parse(await readFile(join(repositoryRoot, "spec", "probe-result.schema.json"), "utf8")) as object;
      const acceptedLogPath = join(artifactDirectory, "collector-accepted.jsonl");
      const collector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
      const collectorServer = createCollectorHttpServer(collector);
      await listen(collectorServer);
      const collectorAddress = collectorServer.address();
      if (collectorAddress === null || typeof collectorAddress === "string") throw new Error("collector did not bind a TCP port");

      const config: ObserverRuntimeConfig = {
        schemaVersion: "ObserverRuntimeConfig@0.1.0",
        privateKeyPath,
        spoolDirectory: spool,
        deliveryLogPath: join(artifactDirectory, "observer-delivery.jsonl"),
        collectorUrl: `http://127.0.0.1:${collectorAddress.port}`,
        pollIntervalMs: 250,
        requestTimeoutMs: 2_000,
        heartbeatIntervalMs: 1_000,
        healthHost: "127.0.0.1",
        healthPort: 0,
      };
      const runtime = await ObserverDeliveryRuntime.open(config);
      const healthServer = createObserverHealthServer(runtime);
      await listen(healthServer);
      const healthAddress = healthServer.address();
      if (healthAddress === null || typeof healthAddress === "string") throw new Error("health server did not bind a TCP port");
      await runtime.scanOnce();
      runtime.heartbeat();
      const [healthResponse, readyResponse, collectorHealthResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${healthAddress.port}/health`),
        fetch(`http://127.0.0.1:${healthAddress.port}/ready`),
        fetch(`http://127.0.0.1:${collectorAddress.port}/health`),
      ]);
      expect([healthResponse.status, readyResponse.status, collectorHealthResponse.status]).toEqual([200, 200, 200]);
      await writeJson(join(artifactDirectory, "health-snapshots.json"), {
        observer_health: await healthResponse.json(),
        observer_ready: await readyResponse.json(),
        collector_health: await collectorHealthResponse.json(),
      });
      expect(runtime.snapshot()).toMatchObject({ status: "ready", deliveredCount: 1, queuedCount: 0 });
      expect(collector.storedCount()).toBe(1);
      await runtime.close();
      await closeServer(healthServer);
      await closeServer(collectorServer);
      await collector.close();

      const reopened = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
      expect(reopened.storedCount()).toBe(1);
      await writeJson(join(artifactDirectory, "collector-restart-evidence.json"), {
        reopened_at: new Date().toISOString(),
        recovered_records: reopened.storedCount(),
        status: "PASS",
      });
      await reopened.close();

      const finalStatus = (await rpc.getSignatureStatuses([signature]).send()).value[0];
      const recipientBalance = await rpc.getBalance(recipient.address, { commitment: "finalized" }).send();
      expect(finalStatus?.confirmationStatus).toBe("finalized");
      expect(finalStatus?.err).toBeNull();
      expect(recipientBalance.value).toBe(lamports(1_000_000n));
      await writeJson(join(artifactDirectory, "run-metadata.json"), {
        schema_version: "GrantM1LocalReadinessRun@0.1.0",
        generated_at: new Date().toISOString(),
        runtime_commit: runtimeCommit,
        endpoint,
        transaction_signature: signature,
        airdrop_signature: airdropSignature,
        terminal_state: unsigned.terminal_state,
        final_rpc_status: finalStatus,
        recipient_finalized_balance_lamports: recipientBalance.value,
        observer_id: observerId,
        observer_key_id: keyId,
        collector_recovered_records: 1,
        infrastructure_independence: false,
        evidence_scope: "LOCAL_SOFTWARE_READINESS_ONLY",
        limitation: "Three logical readers and all processes share one machine and one local Agave validator; this run cannot satisfy Grant Milestone 1 external acceptance.",
        private_key_retained: false,
      });
    } finally {
      await rm(secretDirectory, { recursive: true, force: true });
    }
  }, 120_000);
});

type LocalRpc = ReturnType<typeof createSolanaRpc>;

async function waitForStatus(rpc: LocalRpc, signature: Signature, minimum: "confirmed" | "finalized"): Promise<void> {
  const ranks = { processed: 0, confirmed: 1, finalized: 2 } as const;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
    if (status?.err !== null && status?.err !== undefined) throw new Error(`setup transaction failed: ${JSON.stringify(status.err)}`);
    const confirmationStatus = status?.confirmationStatus;
    if (confirmationStatus !== null && confirmationStatus !== undefined && ranks[confirmationStatus] >= ranks[minimum]) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`timed out waiting for ${minimum} status for ${signature}`);
}

async function listen(server: import("node:http").Server): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
}

async function closeServer(server: import("node:http").Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, bigintReplacer, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
