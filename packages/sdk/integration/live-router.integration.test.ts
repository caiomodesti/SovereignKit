import { mkdir, writeFile } from "node:fs/promises";
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
  ReactiveRouter,
  type IndependentObserver,
  type LogicalRoute,
  type RouteSubmitter,
} from "../src/index.js";

const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-3/manual-run");
const fixtureDirectory = process.env.SOVEREIGNKIT_FIXTURE_DIR === undefined
  ? undefined
  : resolve(process.env.SOVEREIGNKIT_FIXTURE_DIR);

describe("Sprint 3 live reactive-router proof", () => {
  test("a controlled primary rejection causes one fallback submission that reaches independent logical quorum", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const rpc = createSolanaRpc(endpoint);
    expect(await rpc.getHealth().send()).toBe("ok");
    const [feePayer, recipient] = await Promise.all([generateKeyPairSigner(), generateKeyPairSigner()]);
    const airdrop = await rpc.requestAirdrop(feePayer.address, lamports(2_000_000_000n), { commitment: "confirmed" }).send();
    await waitForConfirmation(rpc, airdrop);
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
    const submissionCalls: string[] = [];

    const routes: readonly LogicalRoute[] = [
      logicalRoute("controlled-reject-primary", "http://127.0.0.1:18899", "submit-client-primary"),
      logicalRoute("local-agave-fallback", endpoint, "submit-client-fallback"),
    ];
    const submitter: RouteSubmitter = {
      async submit(route, _transaction, abortSignal) {
        submissionCalls.push(route.routeId);
        if (route.routeId === "controlled-reject-primary") {
          return { outcome: "RPC_REJECTED", errorCategory: "RPC", errorCode: "CONTROLLED_SPRINT_3_REJECTION" };
        }
        const fallbackRpc = createSolanaRpc(route.logicalEndpoint);
        const returned = await fallbackRpc.sendTransaction(encoded as Base64EncodedWireTransaction, {
          encoding: "base64",
          maxRetries: 0n,
          minContextSlot: latest.context.slot,
          preflightCommitment: "confirmed",
          skipPreflight: false,
        }).send({ abortSignal });
        return { outcome: "RPC_ACKNOWLEDGED", returnedSignature: returned };
      },
    };
    const observer = createQuorumObserver(endpoint);
    const router = new ReactiveRouter({
      routes,
      submitter,
      observer,
      policy: {
        maxRoutes: 2,
        routeTimeoutMs: 5_000,
        observationTimeoutMs: 60_000,
        overallDeadlineMs: 75_000,
        telemetryHookTimeoutMs: 500,
        requiredObservationQuorum: 2,
      },
    });
    const result = await router.route({
      transactionId: `sprint-3-${signature}`,
      signature,
      wireTransactionBase64: encoded,
    });
    const finalizedBalance = await waitForFinalizedBalance(rpc, recipient.address);

    expect(result.finalState === "CONFIRMED" || result.finalState === "FINALIZED").toBe(true);
    expect(result.confirmationObservedAfterRouteId).toBe("local-agave-fallback");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.submissionOutcome).toBe("RPC_REJECTED");
    expect(result.attempts[1]?.submissionOutcome).toBe("RPC_ACKNOWLEDGED");
    expect(submissionCalls).toEqual(["controlled-reject-primary", "local-agave-fallback"]);
    expect(new Set(result.visitedRouteIds).size).toBe(2);
    expect(finalizedBalance).toBe(lamports(1_000_000n));

    const evidence = {
      evidenceVersion: "sprint-3-live-router-proof@0.1.0",
      generatedAt: new Date().toISOString(),
      agaveVersion: "4.0.0",
      endpoint,
      transactionSignature: signature,
      airdropSignature: airdrop,
      recipient: recipient.address,
      recipientFinalizedBalanceLamports: finalizedBalance.toString(),
      primaryFailureMode: "controlled adapter rejection; Sprint 4 will replace this with a network proxy",
      observationIndependence: "three distinct RPC client instances sharing one local validator",
      result,
    };
    await writeJson(join(artifactDirectory, "router-evidence.json"), evidence);
    if (fixtureDirectory !== undefined) {
      await mkdir(fixtureDirectory, { recursive: true });
      await writeJson(join(fixtureDirectory, "router-evidence.json"), evidence);
    }
  }, 120_000);
});

function logicalRoute(routeId: string, logicalEndpoint: string, submissionClientIdentity: string): LogicalRoute {
  return {
    routeId,
    logicalEndpoint,
    transport: "http_json_rpc",
    observerRegion: "local",
    configurationProfile: "sprint-3-live@0.1.0",
    submissionClientIdentity,
  };
}

function createQuorumObserver(rpcEndpoint: string): IndependentObserver {
  const readers = [
    { readerId: "logical-reader-1", clientIdentity: "reader-client-instance-1", rpc: createSolanaRpc(rpcEndpoint) },
    { readerId: "logical-reader-2", clientIdentity: "reader-client-instance-2", rpc: createSolanaRpc(rpcEndpoint) },
    { readerId: "logical-reader-3", clientIdentity: "reader-client-instance-3", rpc: createSolanaRpc(rpcEndpoint) },
  ] as const;
  return {
    readers: readers.map(({ readerId, clientIdentity }) => ({ readerId, clientIdentity })),
    async observe(transaction, abortSignal) {
      for (let poll = 0; poll < 600; poll += 1) {
        if (abortSignal.aborted) throw new DOMException("aborted", "AbortError");
        const statuses = await Promise.all(readers.map(async reader => ({
          readerId: reader.readerId,
          status: (await reader.rpc.getSignatureStatuses([transaction.signature as Signature]).send({ abortSignal })).value[0],
        })));
        const failed = statuses.filter(item => item.status?.err !== null && item.status?.err !== undefined).map(item => item.readerId);
        if (failed.length >= 2) return { state: "OBSERVED_EXECUTION_FAILED", supportingReaderIds: failed };
        const finalized = statuses.filter(item => item.status?.err === null && item.status.confirmationStatus === "finalized").map(item => item.readerId);
        if (finalized.length >= 2) return { state: "FINALIZED", supportingReaderIds: finalized };
        const confirmed = statuses.filter(item => item.status?.err === null && (item.status.confirmationStatus === "confirmed" || item.status.confirmationStatus === "finalized")).map(item => item.readerId);
        if (confirmed.length >= 2) return { state: "CONFIRMED", supportingReaderIds: confirmed };
        await abortableDelay(100, abortSignal);
      }
      return { state: "OBSERVATION_INCONCLUSIVE", supportingReaderIds: [] };
    },
  };
}

async function waitForConfirmation(rpc: ReturnType<typeof createSolanaRpc>, signature: Signature): Promise<void> {
  for (let poll = 0; poll < 300; poll += 1) {
    const status = (await rpc.getSignatureStatuses([signature]).send()).value[0];
    if (status?.err !== null && status?.err !== undefined) throw new Error(`airdrop failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("airdrop confirmation deadline reached");
}

async function waitForFinalizedBalance(rpc: ReturnType<typeof createSolanaRpc>, recipient: Parameters<typeof rpc.getBalance>[0]): Promise<bigint> {
  for (let poll = 0; poll < 300; poll += 1) {
    const balance = await rpc.getBalance(recipient, { commitment: "finalized" }).send();
    if (balance.value === lamports(1_000_000n)) return balance.value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("finalized recipient balance deadline reached");
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(resolveDelay, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); rejectDelay(new DOMException("aborted", "AbortError")); }, { once: true });
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
