import { open, type FileHandle } from "node:fs/promises";

import type { ObservationReader, SignatureStatusResult } from "@sovereignkit/telemetry";
import type { ProbeResultUnit, ProbeSubmission, ReaderClaim, UnsignedProbeResult } from "@sovereignkit/probes";
import { deriveIdempotencyKey, sha256Hex } from "@sovereignkit/probes";

import {
  verifyObservationAssignment,
  type AssignmentAuthorityAllowlistEntry,
  type SignedObservationAssignment,
} from "./observation-assignment.js";

export const OBSERVATION_JOB_VERSION = "ObservationJob@0.1.0" as const;

export interface ObservationJob {
  readonly schemaVersion: typeof OBSERVATION_JOB_VERSION;
  readonly resultId: string;
  readonly observerId: string;
  readonly observerKeyId: string;
  readonly observerSequence: number;
  readonly unit: ProbeResultUnit;
  readonly experimentDefinitionHash: string;
  readonly signature: string;
  readonly submission: ProbeSubmission;
  readonly pollIntervalMs: number;
  readonly observationDeadlineMs: number;
  readonly readerRequestTimeoutMs: number;
}

export interface RawObservationPoll {
  readonly schema_version: "RawObservationPoll@0.2.0";
  readonly assignment_id: string;
  readonly assignment_payload_hash: string;
  readonly poll_index: number;
  readonly observed_at: string;
  readonly observer_id: string;
  readonly signature: string;
  readonly claims: readonly ReaderClaim[];
}

export async function executeObservationAssignment(input: {
  readonly assignment: SignedObservationAssignment;
  readonly authority: AssignmentAuthorityAllowlistEntry;
  readonly readers: readonly ObservationReader[];
  readonly rawLogPath: string;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}): Promise<UnsignedProbeResult> {
  const now = input.now ?? (() => new Date());
  verifyObservationAssignment(input.assignment, input.authority, now());
  const job = input.assignment.job;
  validateObservationJob(job, input.readers);
  const sleep = input.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const rawHandle = await open(input.rawLogPath, "wx", 0o600);
  const startedAt = Date.now();
  let pollIndex = 0;
  let latestClaims: readonly ReaderClaim[] = [];
  let terminal: UnsignedProbeResult["terminal_state"] | undefined;
  let supportingClaims: readonly ReaderClaim[] = [];
  try {
    while (terminal === undefined) {
      const observedAt = now().toISOString();
      latestClaims = await Promise.all(input.readers.map(async reader => observeReader(reader, job, pollIndex, observedAt)));
      const poll: RawObservationPoll = {
        schema_version: "RawObservationPoll@0.2.0",
        assignment_id: input.assignment.assignmentId,
        assignment_payload_hash: input.assignment.payloadHash,
        poll_index: pollIndex,
        observed_at: observedAt,
        observer_id: job.observerId,
        signature: job.signature,
        claims: latestClaims,
      };
      await appendAndSync(rawHandle, poll);
      const decision = decide(latestClaims, job.submission.last_valid_block_height);
      terminal = decision.terminal;
      supportingClaims = decision.supportingClaims;
      if (terminal !== undefined) break;
      if (Date.now() - startedAt >= job.observationDeadlineMs) {
        const confirmed = latestClaims.filter(claim =>
          (claim.signature_status === "confirmed" || claim.signature_status === "finalized") && claim.execution_error === undefined,
        );
        terminal = confirmed.length >= 2 ? "CONFIRMED" : "OBSERVATION_INCONCLUSIVE";
        supportingClaims = (confirmed.length >= 2 ? confirmed : latestClaims).slice(0, 2);
        break;
      }
      pollIndex += 1;
      await sleep(job.pollIntervalMs);
    }
  } finally {
    await rawHandle.close();
  }
  if (terminal === undefined || supportingClaims.length < 2 || latestClaims.length !== 3) {
    throw new Error("observation worker could not form a schema-valid terminal decision");
  }
  const decidedAt = now().toISOString();
  return {
    schema_version: "0.1.0",
    result_id: job.resultId,
    idempotency_key: deriveIdempotencyKey(job.observerId, job.unit.unit_id),
    observer_id: job.observerId,
    observer_key_id: job.observerKeyId,
    observer_sequence: job.observerSequence,
    unit: job.unit,
    experiment_definition_hash: job.experimentDefinitionHash,
    signature: job.signature,
    submission: job.submission,
    reader_claims: latestClaims,
    quorum_decisions: [{
      decision_id: sha256Hex(`${job.unit.unit_id}:${terminal}:${decidedAt}`),
      decision_type: terminal,
      supporting_claim_ids: supportingClaims.map(claim => claim.claim_id),
      decided_at: decidedAt,
      quorum_rule_version: "ObservationQuorum@0.1.0",
    }],
    terminal_state: terminal,
    observer_wall_time: decidedAt,
  };
}

export function validateObservationJob(job: ObservationJob, readers: readonly ObservationReader[]): void {
  if (job.schemaVersion !== OBSERVATION_JOB_VERSION) throw new Error("unsupported observation job version");
  if (job.observerId.length === 0 || job.observerKeyId.length === 0 || job.unit.observer_id !== job.observerId) throw new Error("observation job observer identity is invalid");
  if (!Number.isSafeInteger(job.observerSequence) || job.observerSequence < 0) throw new Error("observerSequence must be a non-negative safe integer");
  if (!/^[a-f0-9]{64}$/u.test(job.experimentDefinitionHash)) throw new Error("experimentDefinitionHash must be a lowercase SHA-256 hex value");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(job.resultId)) throw new Error("resultId must be a UUID");
  if (job.signature.length < 80 || job.signature.length > 90) throw new Error("transaction signature length is invalid");
  if (job.submission.attempt_number !== 1) throw new Error("only one submission attempt is permitted");
  if (!Number.isSafeInteger(job.pollIntervalMs) || job.pollIntervalMs < 100 || job.pollIntervalMs > 30_000) throw new Error("pollIntervalMs must be an integer from 100 to 30000");
  if (!Number.isSafeInteger(job.observationDeadlineMs) || job.observationDeadlineMs < job.pollIntervalMs || job.observationDeadlineMs > 300_000) throw new Error("observationDeadlineMs is invalid");
  if (!Number.isSafeInteger(job.readerRequestTimeoutMs) || job.readerRequestTimeoutMs < 100 || job.readerRequestTimeoutMs > 30_000) throw new Error("readerRequestTimeoutMs must be an integer from 100 to 30000");
  const readerIds = new Set(readers.map(reader => reader.readerId));
  if (readers.length !== 3 || readerIds.size !== 3) throw new Error("observation worker requires three unique logical readers");
}

async function observeReader(reader: ObservationReader, job: ObservationJob, pollIndex: number, observedAt: string): Promise<ReaderClaim> {
  const [status, height] = await Promise.all([
    capture(signal => reader.getSignatureStatus(job.signature, signal), job.readerRequestTimeoutMs),
    capture(signal => reader.getBlockHeight(signal), job.readerRequestTimeoutMs),
  ]);
  const statusValue = status.ok ? status.value : undefined;
  return {
    claim_id: `${job.unit.unit_id}:poll-${pollIndex}:${reader.readerId}`,
    reader_id: reader.readerId,
    observed_at: observedAt,
    signature_status: statusValue?.status ?? null,
    ...(statusValue?.rpcContextSlot === undefined ? {} : { rpc_context_slot: Number(statusValue.rpcContextSlot) }),
    ...(statusValue?.slot === undefined ? {} : { transaction_slot: Number(statusValue.slot) }),
    ...(statusValue?.executionError === undefined ? {} : { execution_error: statusValue.executionError }),
    ...(height.ok ? { observed_block_height: Number(height.value) } : {}),
    ...(!status.ok || !height.ok ? { reader_error: [status.ok ? undefined : status.error, height.ok ? undefined : height.error].filter(Boolean).join("+") } : {}),
  };
}

function decide(claims: readonly ReaderClaim[], lastValidBlockHeight: number): {
  readonly terminal?: UnsignedProbeResult["terminal_state"];
  readonly supportingClaims: readonly ReaderClaim[];
} {
  const failed = claims.filter(claim => claim.signature_status !== null && claim.execution_error !== undefined);
  if (failed.length >= 2) return { terminal: "OBSERVED_EXECUTION_FAILED", supportingClaims: failed.slice(0, 2) };
  const finalized = claims.filter(claim => claim.signature_status === "finalized" && claim.execution_error === undefined);
  if (finalized.length >= 2) return { terminal: "FINALIZED", supportingClaims: finalized.slice(0, 2) };
  const hasLedgerObservation = claims.some(claim => claim.signature_status !== null);
  const expired = claims.filter(claim => claim.observed_block_height !== undefined && claim.observed_block_height > lastValidBlockHeight);
  if (!hasLedgerObservation && expired.length >= 2) return { terminal: "EXPIRED", supportingClaims: expired.slice(0, 2) };
  return { supportingClaims: [] };
}

type CaptureResult<Value> = { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: string };

async function capture<Value>(operation: (signal: AbortSignal) => Promise<Value>, timeoutMs: number): Promise<CaptureResult<Value>> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      operation(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`reader request timed out after ${timeoutMs}ms`);
          error.name = "AbortError";
          controller.abort(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /timeout/iu.test(error.message))) return { ok: false, error: "TIMEOUT" };
    if (error instanceof TypeError) return { ok: false, error: "TRANSPORT" };
    if (error instanceof Error) return { ok: false, error: "RPC" };
    return { ok: false, error: "UNKNOWN" };
  } finally {
    controller.abort();
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function appendAndSync(handle: FileHandle, value: unknown): Promise<void> {
  await handle.appendFile(`${JSON.stringify(value)}\n`, "utf8");
  await handle.sync();
}

export type { SignatureStatusResult };
