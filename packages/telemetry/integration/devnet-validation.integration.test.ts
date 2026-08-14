import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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
import { describe, expect, test } from "vitest";

import {
  JsonlEventStore,
  SolanaKitObservationReader,
  SolanaKitTransactionSubmitter,
  SystemClock,
  TelemetryRecorder,
  TransactionTelemetrySession,
  canonicalJson,
  deriveTimeline,
  formatTimeline,
  trackTransaction,
  type TransactionDescriptor,
} from "../src/index.js";

const enabled = process.env.SOVEREIGNKIT_DEVNET === "1";
const submissionEndpoint = process.env.SOVEREIGNKIT_DEVNET_SUBMISSION_ENDPOINT ?? "https://api.devnet.solana.com";
const readerEndpoints = parseReaderEndpoints(
  process.env.SOVEREIGNKIT_DEVNET_READER_ENDPOINTS ?? Array(3).fill(submissionEndpoint).join(","),
);
const artifactDirectory = resolve(
  process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-10/devnet-manual-run",
);

describe.skipIf(!enabled)("Sprint 10 Devnet integration validation", () => {
  test("derives a finalized lifecycle from a real Devnet transaction and logical quorum", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const eventLogPath = join(artifactDirectory, "raw-events.jsonl");
    const timelinePath = join(artifactDirectory, "timeline.json");
    const evidencePath = join(artifactDirectory, "evidence.json");

    const rpc = createSolanaRpc(submissionEndpoint);
    const [health, genesisHash, version, startSlot] = await Promise.all([
      rpc.getHealth().send(),
      rpc.getGenesisHash().send(),
      rpc.getVersion().send(),
      rpc.getSlot({ commitment: "processed" }).send(),
    ]);
    expect(health).toBe("ok");
    await writeJson(join(artifactDirectory, "cluster-metadata.json"), {
      capturedAt: new Date().toISOString(),
      endpointOrigin: endpointOrigin(submissionEndpoint),
      health,
      genesisHash,
      version,
      startProcessedSlot: startSlot,
    });

    const [feePayer, recipient] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    let airdropSignature: Signature;
    try {
      airdropSignature = await requestAirdropWithRetry(() => rpc.requestAirdrop(
        feePayer.address,
        lamports(10_000_000n),
        { commitment: "confirmed" },
      ).send());
    } catch (error) {
      await writeJson(join(artifactDirectory, "setup-failure.json"), {
        capturedAt: new Date().toISOString(),
        stage: "DEVNET_FAUCET",
        endpointOrigin: endpointOrigin(submissionEndpoint),
        classification: "EXTERNAL_SETUP_FAILURE",
        message: errorMessage(error),
        transactionCreated: false,
        methodologicalFinding: null,
      });
      throw error;
    }
    await waitForStatus(rpc, airdropSignature, "confirmed", 120_000);

    const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const transferData = new Uint8Array(12);
    const transferView = new DataView(transferData.buffer);
    transferView.setUint32(0, 2, true);
    transferView.setBigUint64(4, 1_000_000n, true);

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
    const signed = await signTransactionMessageWithSigners(message);
    const signature = getSignatureFromTransaction(signed);
    const encoded = getBase64EncodedWireTransaction(signed);
    const now = new Date().toISOString();
    const descriptor: TransactionDescriptor = {
      transactionId: `devnet-${signature}`,
      attemptId: `devnet-attempt-${signature}`,
      routeId: "devnet-submission-route",
      signature,
      validity: {
        blockhash: latest.value.blockhash,
        contextSlot: latest.context.slot,
        lastValidBlockHeight: latest.value.lastValidBlockHeight,
        fetchedAt: now,
        blockhashCommitment: "confirmed",
      },
      experimentId: "sprint-10-devnet-integration-validation",
      probeId: "devnet-healthy-0",
    };

    const store = new JsonlEventStore(eventLogPath);
    const clock = new SystemClock();
    const recorder = new TelemetryRecorder({
      identity: {
        observerId: "devnet-integration-observer",
        keyId: "ephemeral-in-process",
        publicKey: "integration-harness-not-collector-authentication",
        validFrom: now,
      },
      clockDomainId: `process-${process.pid}`,
      softwareVersion: "0.1.0-sprint-10",
      clock,
      store,
    });
    const session = new TransactionTelemetrySession({ descriptor, recorder, store });
    const timeline = await trackTransaction({
      descriptor,
      session,
      submitter: new SolanaKitTransactionSubmitter({
        endpoint: submissionEndpoint,
        encodedTransaction: encoded as Base64EncodedWireTransaction,
        blockhashContextSlot: latest.context.slot,
      }),
      readers: readerEndpoints.map((endpoint, index) =>
        new SolanaKitObservationReader(`devnet-logical-reader-${index + 1}`, endpoint)),
      clock,
      pollIntervalMs: 500,
      observationDeadlineMs: 180_000,
      readerRequestTimeoutMs: 10_000,
      requiredQuorum: 2,
    });

    const rawEvents = await store.readByAttempt(descriptor.attemptId);
    const reconstructed = deriveTimeline(rawEvents);
    const finalStatus = await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send();
    const finalizedBalance = await rpc.getBalance(recipient.address, { commitment: "finalized" }).send();
    const endSlot = await rpc.getSlot({ commitment: "finalized" }).send();

    expect(canonicalJson(reconstructed)).toBe(canonicalJson(timeline));
    expect(timeline.derivedState).toBe("FINALIZED");
    expect(timeline.executionOutcome).toBe("success");
    expect(timeline.lifecycle.map(entry => entry.state)).toEqual([
      "CREATED",
      "SUBMISSION_ATTEMPTED",
      "RPC_ACKNOWLEDGED",
      "OBSERVATION_PENDING",
      "OBSERVED_EXECUTION_SUCCESS",
      "CONFIRMED",
      "FINALIZED",
    ]);
    expect(timeline.quorum.finalizedReaderIds.length).toBeGreaterThanOrEqual(2);
    expect(finalStatus.value[0]?.confirmationStatus).toBe("finalized");
    expect(finalStatus.value[0]?.err).toBeNull();
    expect(finalizedBalance.value).toBe(lamports(1_000_000n));

    const evidence = {
      evidenceVersion: "sprint-10-devnet-validation@0.1.0",
      generatedAt: new Date().toISOString(),
      scope: "integration validation only; not controlled statistical proof or Mainnet proxy",
      cluster: {
        genesisHash,
        version,
        startProcessedSlot: startSlot,
        endFinalizedSlot: endSlot,
      },
      route: {
        routeId: descriptor.routeId,
        logicalEndpointOrigin: endpointOrigin(submissionEndpoint),
        transport: "https_json_rpc",
        observerRegion: "operator-local",
        configurationProfile: "devnet-integration-v1",
        providerLabel: "Solana public Devnet RPC unless overridden",
      },
      commitments: {
        airdrop: "confirmed",
        blockhash: "confirmed",
        preflight: "confirmed",
        blockHeightObservation: "confirmed",
        finalBalance: "finalized",
      },
      sendConfiguration: {
        encoding: "base64",
        maxRetries: 5,
        minContextSlot: latest.context.slot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      },
      observationQuorum: {
        logicalReaderCount: 3,
        required: 2,
        endpointOrigins: readerEndpoints.map(endpointOrigin),
        operationalIndependence: "not established by this test",
      },
      ephemeralKeypairs: true,
      transactionSignature: signature,
      airdropSignature,
      blockhash: latest.value.blockhash,
      lastValidBlockHeight: latest.value.lastValidBlockHeight,
      recipient: recipient.address,
      recipientFinalizedBalanceLamports: finalizedBalance.value,
      finalRpcStatus: finalStatus.value[0],
      rawEventCount: rawEvents.length,
      lifecycle: timeline.lifecycle.map(entry => entry.state),
      quorum: timeline.quorum,
    };

    await Promise.all([
      writeJson(timelinePath, timeline),
      writeJson(evidencePath, evidence),
      writeFile(join(artifactDirectory, "timeline.txt"), `${formatTimeline(timeline)}\n`, "utf8"),
    ]);
    const persistedLines = (await readFile(eventLogPath, "utf8")).trim().split(/\r?\n/u);
    expect(persistedLines).toHaveLength(rawEvents.length);
  }, 300_000);
});

type DevnetRpc = ReturnType<typeof createSolanaRpc>;

async function waitForStatus(
  rpc: DevnetRpc,
  signature: Signature,
  minimum: "confirmed" | "finalized",
  deadlineMs: number,
): Promise<void> {
  const ranks = { processed: 0, confirmed: 1, finalized: 2 } as const;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const status = (await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send()).value[0];
    if (status?.err !== null && status?.err !== undefined) {
      throw new Error(`Setup transaction failed: ${JSON.stringify(status.err)}`);
    }
    const observed = status?.confirmationStatus;
    if (observed !== null && observed !== undefined && ranks[observed] >= ranks[minimum]) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Timed out waiting for ${minimum} status for ${signature}`);
}

async function requestAirdropWithRetry(
  request: () => Promise<Signature>,
): Promise<Signature> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 2_000));
    }
  }
  throw new Error("Devnet faucet failed after 5 bounded attempts", { cause: lastError });
}

function parseReaderEndpoints(value: string): readonly [string, string, string] {
  const endpoints = value.split(",").map(endpoint => endpoint.trim()).filter(Boolean);
  if (endpoints.length !== 3) {
    throw new Error("SOVEREIGNKIT_DEVNET_READER_ENDPOINTS must contain exactly three comma-separated URLs");
  }
  return [endpoints[0]!, endpoints[1]!, endpoints[2]!];
}

function endpointOrigin(value: string): string {
  const url = new URL(value);
  return url.origin;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, bigintReplacer, 2)}\n`, "utf8");
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `; cause: ${error.cause.message}` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return "Non-Error value thrown";
}
