import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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

const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-1.5/manual-run");
const fixtureDirectory = process.env.SOVEREIGNKIT_FIXTURE_DIR === undefined
  ? undefined
  : resolve(process.env.SOVEREIGNKIT_FIXTURE_DIR);

describe("Sprint 1.5 real Agave local-validator proof", () => {
  test("derives a healthy finalized lifecycle exclusively from real RPC observations", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const eventLogPath = join(artifactDirectory, "raw-events.jsonl");
    const timelinePath = join(artifactDirectory, "timeline.json");
    const evidencePath = join(artifactDirectory, "evidence.json");
    const timelineTextPath = join(artifactDirectory, "timeline.txt");

    const rpc = createSolanaRpc(endpoint);
    const health = await rpc.getHealth().send();
    expect(health).toBe("ok");

    const [feePayer, recipient] = await Promise.all([
      generateKeyPairSigner(),
      generateKeyPairSigner(),
    ]);

    const airdropSignature = await rpc.requestAirdrop(
      feePayer.address,
      lamports(2_000_000_000n),
      { commitment: "confirmed" },
    ).send();
    await waitForStatus(rpc, airdropSignature, "confirmed");

    const latestBlockhashResponse = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const validity = latestBlockhashResponse.value;
    const transferData = new Uint8Array(12);
    const transferView = new DataView(transferData.buffer);
    transferView.setUint32(0, 2, true);
    transferView.setBigUint64(4, 1_000_000n, true);

    const transactionMessage = pipe(
      createTransactionMessage({ version: "legacy" }),
      message => setTransactionMessageFeePayerSigner(feePayer, message),
      message => setTransactionMessageLifetimeUsingBlockhash(validity, message),
      message => appendTransactionMessageInstruction({
        programAddress: address("11111111111111111111111111111111"),
        accounts: [
          {
            address: feePayer.address,
            role: AccountRole.WRITABLE_SIGNER,
            signer: feePayer,
          },
          {
            address: recipient.address,
            role: AccountRole.WRITABLE,
          },
        ],
        data: transferData,
      }, message),
    );
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const signature = getSignatureFromTransaction(signedTransaction);
    const encodedTransaction = getBase64EncodedWireTransaction(signedTransaction);

    const descriptor: TransactionDescriptor = {
      transactionId: `live-${signature}`,
      attemptId: `live-attempt-${signature}`,
      routeId: "local-agave-4.0.0",
      signature,
      validity: {
        blockhash: validity.blockhash,
        contextSlot: latestBlockhashResponse.context.slot,
        lastValidBlockHeight: validity.lastValidBlockHeight,
        fetchedAt: new Date().toISOString(),
        blockhashCommitment: "confirmed",
      },
      experimentId: "sprint-1.5-live-validator-proof",
      probeId: "healthy-0",
    };

    const store = new JsonlEventStore(eventLogPath);
    const clock = new SystemClock();
    const recorder = new TelemetryRecorder({
      identity: {
        observerId: "local-observer-sprint-1.5",
        keyId: "local-observer-sprint-1.5-key-1",
        publicKey: "not-a-remote-authentication-key",
        validFrom: new Date().toISOString(),
      },
      clockDomainId: `process-${process.pid}`,
      softwareVersion: "0.1.0-sprint-1.5",
      clock,
      store,
    });
    const session = new TransactionTelemetrySession({ descriptor, recorder, store });
    const timeline = await trackTransaction({
      descriptor,
      session,
      submitter: new SolanaKitTransactionSubmitter({
        endpoint,
        encodedTransaction: encodedTransaction as Base64EncodedWireTransaction,
        blockhashContextSlot: latestBlockhashResponse.context.slot,
      }),
      readers: [
        new SolanaKitObservationReader("logical-reader-1", endpoint),
        new SolanaKitObservationReader("logical-reader-2", endpoint),
        new SolanaKitObservationReader("logical-reader-3", endpoint),
      ],
      clock,
      pollIntervalMs: 100,
      observationDeadlineMs: 60_000,
      readerRequestTimeoutMs: 2_000,
      requiredQuorum: 2,
    });

    const rawEvents = await store.readByAttempt(descriptor.attemptId);
    const reconstructed = deriveTimeline(rawEvents);
    const finalStatus = await rpc.getSignatureStatuses([signature]).send();
    const recipientBalance = await rpc.getBalance(recipient.address, { commitment: "finalized" }).send();

    expect(canonicalJson(reconstructed)).toBe(canonicalJson(timeline));
    expect(timeline.signature).toBe(signature);
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
    expect(timeline.quorum.observedSuccessReaderIds.length).toBeGreaterThanOrEqual(2);
    expect(timeline.quorum.confirmedReaderIds.length).toBeGreaterThanOrEqual(2);
    expect(timeline.quorum.finalizedReaderIds.length).toBeGreaterThanOrEqual(2);
    expect(finalStatus.value[0]?.confirmationStatus).toBe("finalized");
    expect(finalStatus.value[0]?.err).toBeNull();
    expect(recipientBalance.value).toBe(lamports(1_000_000n));

    const evidence = {
      evidenceVersion: "sprint-1.5-live-validator-proof-v1",
      generatedAt: new Date().toISOString(),
      endpoint,
      agaveVersion: "4.0.0",
      transactionVersion: "legacy",
      sendConfiguration: {
        encoding: "base64",
        maxRetries: 5,
        minContextSlot: latestBlockhashResponse.context.slot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      },
      observationConfiguration: {
        readerCount: 3,
        requiredQuorum: 2,
        pollIntervalMs: 100,
        observationDeadlineMs: 60_000,
        readerRequestTimeoutMs: 2_000,
        infrastructureIndependence: false,
      },
      transactionSignature: signature,
      airdropSignature,
      blockhash: validity.blockhash,
      blockhashContextSlot: latestBlockhashResponse.context.slot,
      lastValidBlockHeight: validity.lastValidBlockHeight,
      recipient: recipient.address,
      recipientFinalizedBalanceLamports: recipientBalance.value,
      finalRpcStatus: finalStatus.value[0],
      logicalObservationOnly: true,
      rawEventCount: rawEvents.length,
      lifecycle: timeline.lifecycle.map(entry => entry.state),
      quorum: timeline.quorum,
    };

    await Promise.all([
      writeJson(timelinePath, timeline),
      writeJson(evidencePath, evidence),
      writeFile(timelineTextPath, `${formatTimeline(timeline)}\n`, "utf8"),
    ]);

    if (fixtureDirectory !== undefined) {
      await mkdir(fixtureDirectory, { recursive: true });
      await Promise.all([
        copyFile(eventLogPath, join(fixtureDirectory, "raw-events.jsonl")),
        copyFile(timelinePath, join(fixtureDirectory, "timeline.json")),
        copyFile(timelineTextPath, join(fixtureDirectory, "timeline.txt")),
        copyFile(evidencePath, join(fixtureDirectory, "evidence.json")),
      ]);
    }

    const persistedLines = (await readFile(eventLogPath, "utf8")).trim().split(/\r?\n/u);
    expect(persistedLines).toHaveLength(rawEvents.length);
  });
});

type LocalRpc = ReturnType<typeof createSolanaRpc>;

async function waitForStatus(rpc: LocalRpc, signature: Signature, minimum: "confirmed" | "finalized"): Promise<void> {
  const ranks = { processed: 0, confirmed: 1, finalized: 2 } as const;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
    if (status?.err !== null && status?.err !== undefined) {
      throw new Error(`Setup transaction failed: ${JSON.stringify(status.err)}`);
    }
    const confirmationStatus = status?.confirmationStatus;
    if (confirmationStatus !== null && confirmationStatus !== undefined && ranks[confirmationStatus] >= ranks[minimum]) {
      return;
    }
    await new Promise(resolveTimeout => setTimeout(resolveTimeout, 100));
  }
  throw new Error(`Timed out waiting for ${minimum} status for ${signature}`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, bigintReplacer, 2)}\n`, "utf8");
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
