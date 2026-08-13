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

import { startControlledHostileProxy, type ProxyMode, type RunningControlledHostileProxy } from "../../hostile-proxy/src/index.js";
import {
  assertUniqueComparativeSignatures,
  buildSignedProbe,
  canonicalJson as probeCanonicalJson,
  declareProbeUnits,
  deriveIdempotencyKey,
  generateObserverKeyPair,
  randomizeProbeUnits,
  sha256Hex,
  signProbeResult,
  validateMatchedPair,
  type BuiltProbe,
  type ExperimentPhase,
  type ProbeDefinition,
  type ReaderClaim,
  type SignedProbeResult,
  type UnsignedProbeResult,
} from "../../probes/src/index.js";
import { analyzeWindow, renderSummary, type AnalysisMeasurement, type AnalysisWindowDefinition } from "../src/index.js";

const endpoint = process.env.SOVEREIGNKIT_RPC_ENDPOINT ?? "http://127.0.0.1:8899";
const programAddress = process.env.SOVEREIGNKIT_MATCHED_PROGRAM_ADDRESS ?? "4Ywfurzjdhh83CUhTp1A3yaJuos4bSeYBtAZiJUnvq8h";
const artifactDirectory = resolve(process.env.SOVEREIGNKIT_ARTIFACT_DIR ?? "artifacts/sprint-5/manual-controlled-experiment");
const fixtureDirectory = process.env.SOVEREIGNKIT_FIXTURE_DIR === undefined ? undefined : resolve(process.env.SOVEREIGNKIT_FIXTURE_DIR);
const routeIds = ["route-a", "route-b", "route-c"] as const;
const scenarios = [
  { phase: "healthy", probeCount: 30, expected: ["HEALTHY", "HEALTHY", "HEALTHY"] },
  { phase: "degraded", probeCount: 30, expected: ["DEGRADED", "HEALTHY", "HEALTHY"] },
  { phase: "asymmetric", probeCount: 30, expected: ["ASYMMETRIC", "HEALTHY", "HEALTHY"] },
  { phase: "insufficient_data", probeCount: 10, expected: ["INSUFFICIENT_DATA", "INSUFFICIENT_DATA", "INSUFFICIENT_DATA"] },
] as const;

describe("Sprint 5 live controlled experiment", () => {
  test("derives all required classifications from signed real-validator measurements", async () => {
    await mkdir(artifactDirectory, { recursive: true });
    const rpc = createSolanaRpc(endpoint);
    expect(await rpc.getHealth().send()).toBe("ok");
    const feePayer = await generateKeyPairSigner();
    const airdrop = await rpc.requestAirdrop(feePayer.address, lamports(5_000_000_000n), { commitment: "confirmed" }).send();
    await waitForSignature(rpc, airdrop);
    const observerKey = generateObserverKeyPair("observer-local", "observer-local-key-v1");
    const runResults: Record<string, unknown> = {};

    for (const [scenarioOrdinal, scenario] of scenarios.entries()) {
      const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const definition = probeDefinition(scenario.phase, scenario.probeCount);
      const probes = await Promise.all(declareProbeUnits(definition).map(unit => buildSignedProbe(definition, unit, {
        feePayer,
        lifetime: {
          blockhash: latest.value.blockhash,
          lastValidBlockHeight: latest.value.lastValidBlockHeight,
          contextSlot: latest.context.slot,
        },
      })));
      assertUniqueComparativeSignatures(probes);
      const matchingByUnit = validateAllPairs(probes);
      expect([...matchingByUnit.values()].every(Boolean)).toBe(true);

      if (scenario.phase === "degraded" || scenario.phase === "asymmetric") {
        await waitUntilNearExpiry(rpc, latest.value.lastValidBlockHeight, 35n);
      }

      const proxies = await startScenarioProxies(scenario.phase, probes);
      try {
        const submissions = await submitInPairedGroups(probes, proxies, definition.randomizationSeed);
        const acknowledged = submissions.filter(value => value.outcome === "RPC_ACKNOWLEDGED");
        const rejected = submissions.filter(value => value.outcome === "RPC_REJECTED");
        await waitForAllConfirmed(rpc, acknowledged.map(value => value.probe.signature));
        if (rejected.length > 0) await waitForBlockhashExpiry(rpc, latest.value.lastValidBlockHeight);
        const readerStatuses = await collectReaderStatuses(acknowledged.map(value => value.probe.signature));
        const observedAt = new Date().toISOString();
        const signedResults = submissions.map((submission, index) => buildSignedResult({
          submission,
          definition,
          definitionHash: sha256Hex(probeCanonicalJson(jsonSafeDefinition(definition))),
          matchingValid: matchingByUnit.get(submission.probe.unit.unitId) ?? false,
          readerStatuses,
          observerKey,
          observerSequence: scenarioOrdinal * 1_000 + index,
          observedAt,
        }));
        const measurements = toAnalysisMeasurements(signedResults, matchingByUnit, submissions);
        const windowDefinition = analysisDefinition(definition);
        const summary = analyzeWindow(windowDefinition, measurements);
        expect(summary.classifications.map(value => value.classification)).toEqual(scenario.expected);
        expect(summary.duplicateSignatures).toEqual([]);
        expect(summary.invalidUnitIds).toEqual([]);
        const rendered = renderSummary(summary);
        const scenarioDirectory = join(artifactDirectory, scenario.phase);
        await writeScenarioArtifacts(scenarioDirectory, windowDefinition, signedResults, measurements, submissions, summary, rendered);
        if (fixtureDirectory !== undefined) {
          await writeScenarioArtifacts(join(fixtureDirectory, scenario.phase), windowDefinition, signedResults, measurements, submissions, summary, rendered);
        }
        runResults[scenario.phase] = {
          expected: scenario.expected,
          actual: summary.classifications.map(value => value.classification),
          inputHash: summary.inputHash,
          signedResultCount: signedResults.length,
          acknowledgedCount: acknowledged.length,
          rejectedCount: rejected.length,
          proxyAuditCounts: Object.fromEntries(routeIds.map(routeId => [routeId, proxies.get(routeId)!.auditEvents.length])),
        };
      } finally {
        await Promise.all([...proxies.values()].map(proxy => proxy.close()));
      }
    }

    const manifest = {
      evidenceVersion: "sprint-5-live-controlled-experiment@0.1.0",
      generatedAt: new Date().toISOString(),
      agaveVersion: "4.0.0",
      programAddress,
      observationLimitation: "three logical readers share one local validator; this is logical redundancy, not infrastructure independence",
      observerAllowlist: [{
        observerId: observerKey.observerId,
        keyId: observerKey.keyId,
        publicKeySpkiBase64: observerKey.publicKeySpkiBase64,
      }],
      scenarios: runResults,
    };
    await writeJson(join(artifactDirectory, "experiment-manifest.json"), manifest);
    if (fixtureDirectory !== undefined) await writeJson(join(fixtureDirectory, "experiment-manifest.json"), manifest);
  }, 360_000);
});

interface SubmissionRecord {
  readonly probe: BuiltProbe;
  readonly outcome: "RPC_ACKNOWLEDGED" | "RPC_REJECTED";
  readonly submittedAt: string;
  readonly responseAt: string;
  readonly executionOrdinal: number;
  readonly rpcErrorCode?: number | string;
}

interface StatusValue {
  readonly slot: bigint;
  readonly confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  readonly err: unknown;
}

function probeDefinition(phase: ExperimentPhase, probeCount: number): ProbeDefinition {
  return {
    experimentId: "sprint-5-live-controlled",
    experimentVersion: "1",
    phase,
    observerId: "observer-local",
    routeIds,
    transactionClasses: ["MATCHED_CONTROL", "PROGRAM_X"],
    probeIndices: Array.from({ length: probeCount }, (_, index) => index),
    randomizationSeed: `sprint-5-${phase}-seed-v1`,
    pairingWindowMs: 5_000,
    programAddress,
    computeUnitLimit: 20_000,
    computeUnitPriceMicroLamports: 0n,
    expectedComputeUnits: { MATCHED_CONTROL: 510, PROGRAM_X: 510 },
    feePayerPolicy: "one-funded-payer-controlled-run",
    blockhashCommitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
    maxRetries: 0,
  };
}

function analysisDefinition(definition: ProbeDefinition): AnalysisWindowDefinition {
  return {
    experimentId: definition.experimentId,
    experimentVersion: definition.experimentVersion,
    configurationHash: sha256Hex(probeCanonicalJson(jsonSafeDefinition(definition))),
    windowId: `${definition.experimentId}:${definition.phase}:observer-local`,
    windowVersion: "1",
    phase: definition.phase,
    observerId: definition.observerId,
    routeIds: definition.routeIds,
    probeIndices: definition.probeIndices,
  };
}

function validateAllPairs(probes: readonly BuiltProbe[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const routeId of routeIds) {
    for (const probeIndex of [...new Set(probes.map(value => value.unit.probeIndex))]) {
      const pair = probes.filter(value => value.unit.routeId === routeId && value.unit.probeIndex === probeIndex);
      const validation = validateMatchedPair(pair[0]!, pair[1]!);
      for (const probe of pair) result.set(probe.unit.unitId, validation.valid);
    }
  }
  return result;
}

async function startScenarioProxies(phase: ExperimentPhase, probes: readonly BuiltProbe[]): Promise<Map<string, RunningControlledHostileProxy>> {
  const values = await Promise.all(routeIds.map(async routeId => {
    let mode: ProxyMode = { type: "PASS_THROUGH", scheduleId: `${phase}-${routeId}-pass-v1` };
    if (routeId === "route-a" && phase === "asymmetric") {
      mode = { type: "REJECT_CLASS", transactionClass: "PROGRAM_X", scheduleId: "asymmetric-route-a-program-x-v1" };
    }
    if (routeId === "route-a" && phase === "degraded") {
      const rejected = probes.filter(value => value.unit.routeId === routeId && value.unit.probeIndex < 24).map(value => value.pairNonceHex);
      mode = { type: "GENERAL_DEGRADATION", rejectPairNonceHexes: new Set(rejected), scheduleId: "degraded-route-a-first-24-v1" };
    }
    const proxy = await startControlledHostileProxy({
      bindHost: "127.0.0.1",
      bindPort: 0,
      upstreamUrl: endpoint,
      allowedUpstreamUrls: [endpoint],
      controlledProgramAddress: programAddress,
      mode,
      limits: { maxRequestBytes: 256_000, maxResponseBytes: 256_000, maxConcurrentRequests: 16, maxAuditEvents: 2_000, upstreamTimeoutMs: 10_000 },
    });
    return [routeId, proxy] as const;
  }));
  return new Map(values);
}

async function submitInPairedGroups(
  probes: readonly BuiltProbe[],
  proxies: ReadonlyMap<string, RunningControlledHostileProxy>,
  randomizationSeed: string,
): Promise<SubmissionRecord[]> {
  const records: SubmissionRecord[] = [];
  const byUnitId = new Map(probes.map(probe => [probe.unit.unitId, probe]));
  const plan = randomizeProbeUnits(probes.map(probe => probe.unit), randomizationSeed);
  for (const probeIndex of [...new Set(plan.map(value => value.probeIndex))]) {
    const group = plan.filter(value => value.probeIndex === probeIndex);
    records.push(...await Promise.all(group.map(async plannedUnit => {
      const probe = byUnitId.get(plannedUnit.unitId);
      if (probe === undefined) throw new Error(`randomized plan references unknown unit ${plannedUnit.unitId}`);
      const submittedAt = new Date().toISOString();
      const response = await fetch(proxies.get(probe.unit.routeId)!.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: probe.unit.unitId,
          method: "sendTransaction",
          params: [probe.wireTransactionBase64 as Base64EncodedWireTransaction, { encoding: "base64", maxRetries: 0, preflightCommitment: "confirmed", skipPreflight: false }],
        }),
      });
      const payload = await response.json() as { result?: string; error?: { code?: number | string } };
      const responseAt = new Date().toISOString();
      return payload.result === probe.signature
        ? { probe, outcome: "RPC_ACKNOWLEDGED" as const, submittedAt, responseAt, executionOrdinal: plannedUnit.executionOrdinal }
        : { probe, outcome: "RPC_REJECTED" as const, submittedAt, responseAt, executionOrdinal: plannedUnit.executionOrdinal, rpcErrorCode: payload.error?.code ?? "UNKNOWN" };
    })));
  }
  return records;
}

async function waitForAllConfirmed(rpc: ReturnType<typeof createSolanaRpc>, signatures: readonly Signature[]): Promise<void> {
  for (const chunk of chunks(signatures, 200)) {
    for (let poll = 0; poll < 300; poll += 1) {
      const statuses = (await rpc.getSignatureStatuses(chunk).send()).value;
      const failed = statuses.find(value => value !== null && value?.err !== null && value?.err !== undefined);
      if (failed !== undefined && failed !== null) throw new Error(`acknowledged transaction failed: ${JSON.stringify(failed.err)}`);
      if (statuses.every(value => value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized")) break;
      if (poll === 299) throw new Error("confirmation deadline reached");
      await delay(100);
    }
  }
}

async function collectReaderStatuses(signatures: readonly Signature[]): Promise<readonly Map<string, StatusValue | null>[]> {
  return await Promise.all([1, 2, 3].map(async () => {
    const rpc = createSolanaRpc(endpoint);
    const result = new Map<string, StatusValue | null>();
    for (const chunk of chunks(signatures, 200)) {
      const statuses = (await rpc.getSignatureStatuses(chunk).send()).value;
      chunk.forEach((signature, index) => result.set(signature, statuses[index] ?? null));
    }
    return result;
  }));
}

function buildSignedResult(input: {
  readonly submission: SubmissionRecord;
  readonly definition: ProbeDefinition;
  readonly definitionHash: string;
  readonly matchingValid: boolean;
  readonly readerStatuses: readonly Map<string, StatusValue | null>[];
  readonly observerKey: ReturnType<typeof generateObserverKeyPair>;
  readonly observerSequence: number;
  readonly observedAt: string;
}): SignedProbeResult {
  const { probe } = input.submission;
  const success = input.submission.outcome === "RPC_ACKNOWLEDGED";
  const claims: ReaderClaim[] = [0, 1, 2].map(index => {
    const status = input.readerStatuses[index]?.get(probe.signature) ?? null;
    return {
      claim_id: `${probe.unit.unitId}:reader-${index + 1}`,
      reader_id: `logical-reader-${index + 1}`,
      observed_at: input.observedAt,
      signature_status: success ? (status?.confirmationStatus ?? "confirmed") : null,
      ...(status === null ? {} : { rpc_context_slot: Number(status.slot), transaction_slot: Number(status.slot) }),
    };
  });
  const terminalState = success ? "CONFIRMED" as const : "EXPIRED" as const;
  const unsigned: UnsignedProbeResult = {
    schema_version: "0.1.0",
    result_id: uuidFromHash(probe.unit.unitId),
    idempotency_key: deriveIdempotencyKey(input.definition.observerId, probe.unit.unitId),
    observer_id: input.definition.observerId,
    observer_key_id: input.observerKey.keyId,
    observer_sequence: input.observerSequence,
    unit: {
      experiment_id: probe.unit.experimentId,
      experiment_version: probe.unit.experimentVersion,
      phase: probe.unit.phase,
      observer_id: probe.unit.observerId,
      route_id: probe.unit.routeId,
      transaction_class: probe.unit.transactionClass,
      probe_index: probe.unit.probeIndex,
      unit_id: probe.unit.unitId,
    },
    experiment_definition_hash: input.definitionHash,
    signature: probe.signature,
    submission: {
      attempt_id: sha256Hex(`${probe.unit.unitId}:attempt-1`),
      attempt_number: 1,
      outcome: input.submission.outcome,
      blockhash: probe.blockhash,
      blockhash_context_slot: Number(probe.blockhashContextSlot),
      last_valid_block_height: Number(probe.lastValidBlockHeight),
      serialized_size_bytes: probe.fingerprint.serializedSizeBytes,
      created_at: input.submission.submittedAt,
      submitted_at: input.submission.submittedAt,
      response_at: input.submission.responseAt,
      ...(input.submission.rpcErrorCode === undefined ? {} : { rpc_error_code: input.submission.rpcErrorCode, rpc_error_category: "CONTROLLED_PROXY" }),
    },
    reader_claims: claims,
    quorum_decisions: [{
      decision_id: sha256Hex(`${probe.unit.unitId}:${terminalState}`),
      decision_type: terminalState,
      supporting_claim_ids: claims.slice(0, 2).map(value => value.claim_id),
      decided_at: input.observedAt,
      quorum_rule_version: "ObservationQuorum@0.1.0",
    }],
    terminal_state: terminalState,
    observer_wall_time: input.observedAt,
  };
  if (!input.matchingValid) throw new Error(`refusing to sign mismatched unit ${probe.unit.unitId}`);
  return signProbeResult(unsigned, input.observerKey);
}

function toAnalysisMeasurements(
  results: readonly SignedProbeResult[],
  matchingByUnit: ReadonlyMap<string, boolean>,
  submissions: readonly SubmissionRecord[],
): AnalysisMeasurement[] {
  const pairingByIndex = new Map<number, boolean>();
  for (const probeIndex of [...new Set(submissions.map(value => value.probe.unit.probeIndex))]) {
    const timestamps = submissions.filter(value => value.probe.unit.probeIndex === probeIndex).map(value => Date.parse(value.submittedAt));
    pairingByIndex.set(probeIndex, Math.max(...timestamps) - Math.min(...timestamps) > 5_000);
  }
  return results.map(result => ({
    experimentId: result.unit.experiment_id,
    experimentVersion: result.unit.experiment_version,
    configurationHash: result.experiment_definition_hash,
    phase: result.unit.phase,
    observerId: result.unit.observer_id,
    routeId: result.unit.route_id,
    transactionClass: result.unit.transaction_class,
    probeIndex: result.unit.probe_index,
    unitId: result.unit.unit_id,
    signature: result.signature,
    outcome: result.terminal_state === "CONFIRMED" ? "CONFIRMED_EXECUTION_SUCCESS" : "RPC_REJECTED_EXPIRED",
    matchingValid: matchingByUnit.get(result.unit.unit_id) ?? false,
    pairingWindowBreached: pairingByIndex.get(result.unit.probe_index) ?? true,
  }));
}

async function writeScenarioArtifacts(
  directory: string,
  definition: AnalysisWindowDefinition,
  signedResults: readonly SignedProbeResult[],
  measurements: readonly AnalysisMeasurement[],
  submissions: readonly SubmissionRecord[],
  summary: ReturnType<typeof analyzeWindow>,
  rendered: ReturnType<typeof renderSummary>,
): Promise<void> {
  await mkdir(join(directory, "raw"), { recursive: true });
  await mkdir(join(directory, "derived"), { recursive: true });
  await mkdir(join(directory, "summary"), { recursive: true });
  await writeJson(join(directory, "experiment-definition.json"), definition);
  await writeFile(join(directory, "raw", "probe-results.jsonl"), signedResults.map(value => JSON.stringify(value)).join("\n") + "\n", "utf8");
  await writeFile(join(directory, "raw", "reader-claims.jsonl"), signedResults.flatMap(value => value.reader_claims).map(value => JSON.stringify(value)).join("\n") + "\n", "utf8");
  await writeJson(join(directory, "derived", "measurements.json"), measurements);
  await writeJson(join(directory, "derived", "execution-plan.json"), submissions.map(value => ({
    unitId: value.probe.unit.unitId,
    probeIndex: value.probe.unit.probeIndex,
    routeId: value.probe.unit.routeId,
    transactionClass: value.probe.unit.transactionClass,
    executionOrdinal: value.executionOrdinal,
    submittedAt: value.submittedAt,
    responseAt: value.responseAt,
    outcome: value.outcome,
  })).sort((left, right) => left.executionOrdinal - right.executionOrdinal));
  await writeJson(join(directory, "derived", "classifications.json"), summary);
  await writeFile(join(directory, "summary", "experiment-summary.md"), rendered.markdown, "utf8");
  await writeFile(join(directory, "summary", "experiment-summary.json"), rendered.json, "utf8");
  await writeFile(join(directory, "summary", "experiment-summary.csv"), rendered.csv, "utf8");
}

async function waitForSignature(rpc: ReturnType<typeof createSolanaRpc>, signature: Signature): Promise<void> {
  await waitForAllConfirmed(rpc, [signature]);
}

async function waitForBlockhashExpiry(rpc: ReturnType<typeof createSolanaRpc>, lastValidBlockHeight: bigint): Promise<void> {
  for (let poll = 0; poll < 1_200; poll += 1) {
    if (await rpc.getBlockHeight({ commitment: "confirmed" }).send() > lastValidBlockHeight) return;
    await delay(200);
  }
  throw new Error("blockhash did not expire before deadline");
}

async function waitUntilNearExpiry(
  rpc: ReturnType<typeof createSolanaRpc>,
  lastValidBlockHeight: bigint,
  remainingBlocks: bigint,
): Promise<void> {
  const target = lastValidBlockHeight - remainingBlocks;
  for (let poll = 0; poll < 1_200; poll += 1) {
    if (await rpc.getBlockHeight({ commitment: "confirmed" }).send() >= target) return;
    await delay(200);
  }
  throw new Error("block height did not reach the precommitted near-expiry submission window");
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function uuidFromHash(hash: string): string {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function jsonSafeDefinition(definition: ProbeDefinition): unknown {
  return { ...definition, computeUnitPriceMicroLamports: definition.computeUnitPriceMicroLamports.toString() };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function delay(ms: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, ms));
}
