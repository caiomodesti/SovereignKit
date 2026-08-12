import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  createSolanaRpc,
  generateKeyPairSigner,
  lamports,
  type Base64EncodedWireTransaction,
  type Signature,
} from "@solana/kit";
import { describe, expect, test } from "vitest";

import { buildSignedProbe, declareProbeUnits, type BuiltProbe, type ProbeDefinition } from "../../probes/src/index.js";
import { ReactiveRouter, type IndependentObserver, type LogicalRoute, type RouteSubmitter } from "../../sdk/src/index.js";
import { startControlledHostileProxy, type RunningControlledHostileProxy } from "../src/index.js";

const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-4/manual-run");
const fixtureDirectory = process.env.SOVEREIGNKIT_FIXTURE_DIR === undefined ? undefined : resolve(process.env.SOVEREIGNKIT_FIXTURE_DIR);
const memoProgram = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

describe("Sprint 4 live controlled-hostile-proxy proof", () => {
  test("selective network rejection triggers real router failover while control passes", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const rpc = createSolanaRpc(endpoint);
    expect(await rpc.getHealth().send()).toBe("ok");
    const feePayer = await generateKeyPairSigner();
    const airdrop = await rpc.requestAirdrop(feePayer.address, lamports(2_000_000_000n), { commitment: "confirmed" }).send();
    await waitForConfirmation(rpc, airdrop);
    const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const definition = probeDefinition();
    const probes = await Promise.all(declareProbeUnits(definition).map(unit => buildSignedProbe(definition, unit, {
      feePayer,
      lifetime: { blockhash: latest.value.blockhash, lastValidBlockHeight: latest.value.lastValidBlockHeight, contextSlot: latest.context.slot },
    })));
    const indexZero = probes.filter(probe => probe.unit.probeIndex === 0);
    const control = getProbe(indexZero, "MATCHED_CONTROL");
    const programX = getProbe(indexZero, "PROGRAM_X");
    let selectiveProxy: RunningControlledHostileProxy | undefined;
    let generalProxy: RunningControlledHostileProxy | undefined;
    try {
      selectiveProxy = await startControlledHostileProxy(proxyConfig({
        type: "REJECT_CLASS",
        transactionClass: "PROGRAM_X",
        scheduleId: "sprint-4-selective-program-x-v1",
      }));

      const controlRpc = createSolanaRpc(selectiveProxy.url);
      const controlReturnedSignature = await controlRpc.sendTransaction(control.wireTransactionBase64 as Base64EncodedWireTransaction, {
        encoding: "base64",
        maxRetries: 0n,
        minContextSlot: latest.context.slot,
        preflightCommitment: "confirmed",
        skipPreflight: false,
      }).send();
      expect(controlReturnedSignature).toBe(control.signature);
      await waitForConfirmation(rpc, control.signature);

      const router = new ReactiveRouter({
        routes: [
          logicalRoute("selective-proxy-primary", selectiveProxy.url, "proxy-submit-client"),
          logicalRoute("direct-agave-fallback", endpoint, "fallback-submit-client"),
        ],
        submitter: createSubmitter(latest.context.slot),
        observer: createQuorumObserver(endpoint),
        policy: {
          maxRoutes: 2,
          routeTimeoutMs: 5_000,
          observationTimeoutMs: 60_000,
          overallDeadlineMs: 75_000,
          telemetryHookTimeoutMs: 500,
          requiredObservationQuorum: 2,
        },
      });
      const routingResult = await router.route({
        transactionId: programX.unit.unitId,
        signature: programX.signature,
        wireTransactionBase64: programX.wireTransactionBase64,
      });
      expect(routingResult.finalState === "CONFIRMED" || routingResult.finalState === "FINALIZED").toBe(true);
      expect(routingResult.confirmationObservedAfterRouteId).toBe("direct-agave-fallback");
      expect(routingResult.attempts.map(attempt => attempt.submissionOutcome)).toEqual(["RPC_REJECTED", "RPC_ACKNOWLEDGED"]);
      expect(routingResult.visitedRouteIds).toEqual(["selective-proxy-primary", "direct-agave-fallback"]);
      await waitForConfirmation(rpc, programX.signature);

      const indexOne = probes.filter(probe => probe.unit.probeIndex === 1);
      generalProxy = await startControlledHostileProxy(proxyConfig({
        type: "GENERAL_DEGRADATION",
        rejectPairNonceHexes: new Set([indexOne[0]!.pairNonceHex]),
        scheduleId: "sprint-4-general-index-1-v1",
      }));
      const generalResponses = await Promise.all(indexOne.map(probe => sendRaw(generalProxy!.url, probe)));
      expect(generalResponses.every(response => response.error?.code === -32098)).toBe(true);
      expect(generalProxy.auditEvents.filter(event => event.decision === "REJECTED").map(event => event.classification).sort()).toEqual(["MATCHED_CONTROL", "PROGRAM_X"]);

      const evidence = {
        evidenceVersion: "sprint-4-live-hostile-proxy-proof@0.1.0",
        generatedAt: new Date().toISOString(),
        agaveVersion: "4.0.0",
        endpoint,
        executableFixtureProgram: memoProgram,
        fixtureProgramLimitation: "Memo is used only for network-path proof; the statistical experiment still requires the project-owned matched program",
        airdropSignature: airdrop,
        controlSignature: control.signature,
        programXSignature: programX.signature,
        selectiveProxyAudit: selectiveProxy.auditEvents,
        generalProxyAudit: generalProxy.auditEvents,
        routingResult,
      };
      await writeJson(join(artifactDirectory, "hostile-proxy-evidence.json"), evidence);
      if (fixtureDirectory !== undefined) {
        await mkdir(fixtureDirectory, { recursive: true });
        await writeJson(join(fixtureDirectory, "hostile-proxy-evidence.json"), evidence);
      }
    } finally {
      await generalProxy?.close();
      await selectiveProxy?.close();
    }
  }, 120_000);
});

function probeDefinition(): ProbeDefinition {
  return {
    experimentId: "sprint-4-live-proxy",
    experimentVersion: "1",
    phase: "asymmetric",
    observerId: "observer-local",
    routeIds: ["route-a"],
    transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
    probeIndices: [0, 1],
    randomizationSeed: "sprint-4-live-proxy-seed",
    pairingWindowMs: 5_000,
    programAddress: memoProgram,
    computeUnitLimit: 20_000,
    computeUnitPriceMicroLamports: 0n,
    expectedComputeUnits: { MATCHED_CONTROL: 1_000, PROGRAM_X: 1_000 },
    feePayerPolicy: "one-funded-payer-live-fixture",
    blockhashCommitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
    maxRetries: 0,
  };
}

function proxyConfig(mode: Parameters<typeof startControlledHostileProxy>[0]["mode"]): Parameters<typeof startControlledHostileProxy>[0] {
  return {
    bindHost: "127.0.0.1",
    bindPort: 0,
    upstreamUrl: endpoint,
    allowedUpstreamUrls: [endpoint],
    controlledProgramAddress: memoProgram,
    mode,
    limits: { maxRequestBytes: 256_000, maxResponseBytes: 256_000, maxConcurrentRequests: 8, maxAuditEvents: 10_000, upstreamTimeoutMs: 5_000 },
  };
}

function logicalRoute(routeId: string, logicalEndpoint: string, submissionClientIdentity: string): LogicalRoute {
  return { routeId, logicalEndpoint, transport: "http_json_rpc", observerRegion: "local", configurationProfile: "sprint-4-live@0.1.0", submissionClientIdentity };
}

function createSubmitter(minContextSlot: bigint): RouteSubmitter {
  return {
    async submit(route, transaction, abortSignal) {
      try {
        const routeRpc = createSolanaRpc(route.logicalEndpoint);
        const returnedSignature = await routeRpc.sendTransaction(transaction.wireTransactionBase64 as Base64EncodedWireTransaction, {
          encoding: "base64",
          maxRetries: 0n,
          minContextSlot,
          preflightCommitment: "confirmed",
          skipPreflight: false,
        }).send({ abortSignal });
        return { outcome: "RPC_ACKNOWLEDGED", returnedSignature };
      } catch {
        return { outcome: "RPC_REJECTED", errorCategory: "RPC", errorCode: "CONTROLLED_PROXY_OR_RPC_REJECTION" };
      }
    },
  };
}

function createQuorumObserver(rpcEndpoint: string): IndependentObserver {
  const readers = [
    { readerId: "logical-reader-1", clientIdentity: "reader-client-1", rpc: createSolanaRpc(rpcEndpoint) },
    { readerId: "logical-reader-2", clientIdentity: "reader-client-2", rpc: createSolanaRpc(rpcEndpoint) },
    { readerId: "logical-reader-3", clientIdentity: "reader-client-3", rpc: createSolanaRpc(rpcEndpoint) },
  ] as const;
  return {
    readers: readers.map(({ readerId, clientIdentity }) => ({ readerId, clientIdentity })),
    async observe(transaction, abortSignal) {
      for (let poll = 0; poll < 600; poll += 1) {
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
    if (status?.err !== null && status?.err !== undefined) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error("confirmation deadline reached");
}

async function sendRaw(url: string, probe: BuiltProbe): Promise<{ error?: { code?: number } }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: probe.discriminator, method: "sendTransaction", params: [probe.wireTransactionBase64, { encoding: "base64" }] }),
  });
  return await response.json() as { error?: { code?: number } };
}

function getProbe(probes: readonly BuiltProbe[], transactionClass: BuiltProbe["unit"]["transactionClass"]): BuiltProbe {
  const probe = probes.find(value => value.unit.transactionClass === transactionClass);
  if (probe === undefined) throw new Error(`missing ${transactionClass} probe`);
  return probe;
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
