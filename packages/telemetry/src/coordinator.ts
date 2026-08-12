import type { Clock } from "./clock.js";
import type { TransactionTelemetrySession } from "./session.js";
import type { RpcErrorFact, SignatureStatus, TransactionDescriptor, TransactionTimeline } from "./types.js";

export type SubmissionResult =
  | { readonly outcome: "acknowledged"; readonly returnedSignature: string }
  | { readonly outcome: "rejected"; readonly error: RpcErrorFact };

export interface TransactionSubmitter {
  submit(): Promise<SubmissionResult>;
}

export interface SignatureStatusResult {
  readonly status: SignatureStatus | null;
  readonly slot?: bigint;
  readonly executionError?: unknown;
  readonly rpcContextSlot?: bigint;
}

export interface ObservationReader {
  readonly readerId: string;
  getSignatureStatus(signature: string, abortSignal?: AbortSignal): Promise<SignatureStatusResult>;
  getBlockHeight(abortSignal?: AbortSignal): Promise<bigint>;
}

export interface ObservationCoordinatorOptions {
  readonly descriptor: TransactionDescriptor;
  readonly session: TransactionTelemetrySession;
  readonly submitter: TransactionSubmitter;
  readonly readers: readonly ObservationReader[];
  readonly clock: Clock;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly observationDeadlineMs?: number;
  readonly readerRequestTimeoutMs?: number;
  readonly requiredQuorum?: number;
}

export async function trackTransaction(options: ObservationCoordinatorOptions): Promise<TransactionTimeline> {
  const pollIntervalMs = options.pollIntervalMs ?? 200;
  const observationDeadlineMs = options.observationDeadlineMs ?? 120_000;
  const readerRequestTimeoutMs = options.readerRequestTimeoutMs ?? 2_000;
  const requiredQuorum = options.requiredQuorum ?? 2;
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  validateCoordinatorOptions(options.readers, pollIntervalMs, observationDeadlineMs, readerRequestTimeoutMs, requiredQuorum);

  await options.session.created();
  await options.session.submissionAttempted();
  const submission = await options.submitter.submit();
  if (submission.outcome === "acknowledged") {
    await options.session.rpcAcknowledged(submission.returnedSignature);
  } else {
    await options.session.rpcRejected(submission.error);
    if (!submission.error.mayHaveBeenForwarded) {
      return options.session.timeline();
    }
  }

  await options.session.observationStarted(
    options.readers.map(reader => reader.readerId),
    requiredQuorum,
  );
  const startedAt = options.clock.monotonicNs();
  let pollIndex = 0;

  while (true) {
    const results = await Promise.all(
      options.readers.map(async reader => pollReader(reader, options.descriptor.signature, readerRequestTimeoutMs)),
    );
    for (const result of results) {
      const prefix = `${options.descriptor.attemptId}:${pollIndex}:${result.readerId}`;
      if (result.status.ok) {
        await options.session.readerSignatureStatus({
          observationId: `${prefix}:status`,
          readerId: result.readerId,
          ...result.status.value,
        });
      } else {
        await options.session.readerUnavailable({
          observationId: `${prefix}:status-error`,
          readerId: result.readerId,
          operation: "signature_status",
          errorCategory: result.status.error,
        });
      }

      if (result.height.ok) {
        await options.session.readerBlockHeight({
          observationId: `${prefix}:height`,
          readerId: result.readerId,
          blockHeight: result.height.value,
          commitment: "confirmed",
        });
      } else {
        await options.session.readerUnavailable({
          observationId: `${prefix}:height-error`,
          readerId: result.readerId,
          operation: "block_height",
          errorCategory: result.height.error,
        });
      }
    }

    const timeline = await options.session.timeline();
    if (timeline.derivedState === "FINALIZED" || timeline.derivedState === "EXPIRED") {
      return timeline;
    }

    const elapsedMs = Number(options.clock.monotonicNs() - startedAt) / 1_000_000;
    if (elapsedMs >= observationDeadlineMs) {
      await options.session.observationDeadline(observationDeadlineMs);
      return options.session.timeline();
    }
    pollIndex += 1;
    await sleep(pollIntervalMs);
  }
}

type ReaderOperationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: "TRANSPORT" | "TIMEOUT" | "RPC" | "UNKNOWN" };

async function pollReader(reader: ObservationReader, signature: string, timeoutMs: number): Promise<{
  readonly readerId: string;
  readonly status: ReaderOperationResult<SignatureStatusResult>;
  readonly height: ReaderOperationResult<bigint>;
}> {
  const [status, height] = await Promise.all([
    capture(abortSignal => reader.getSignatureStatus(signature, abortSignal), timeoutMs),
    capture(abortSignal => reader.getBlockHeight(abortSignal), timeoutMs),
  ]);
  return { readerId: reader.readerId, status, height };
}

async function capture<Value>(
  operation: (abortSignal: AbortSignal) => Promise<Value>,
  timeoutMs: number,
): Promise<ReaderOperationResult<Value>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abortController = new AbortController();
  try {
    const value = await Promise.race([
      operation(abortController.signal),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`Reader request timed out after ${timeoutMs}ms`);
          error.name = "AbortError";
          abortController.abort(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: categorizeError(error) };
  } finally {
    abortController.abort();
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function categorizeError(error: unknown): "TRANSPORT" | "TIMEOUT" | "RPC" | "UNKNOWN" {
  if (error instanceof Error && (error.name === "AbortError" || /timeout/iu.test(error.message))) {
    return "TIMEOUT";
  }
  if (error instanceof TypeError) {
    return "TRANSPORT";
  }
  if (error instanceof Error) {
    return "RPC";
  }
  return "UNKNOWN";
}

function validateCoordinatorOptions(
  readers: readonly ObservationReader[],
  pollIntervalMs: number,
  observationDeadlineMs: number,
  readerRequestTimeoutMs: number,
  requiredQuorum: number,
): void {
  const uniqueReaderIds = new Set(readers.map(reader => reader.readerId));
  if (readers.length !== 3 || uniqueReaderIds.size !== 3 || requiredQuorum !== 2) {
    throw new Error("Telemetry v0.1 requires three unique logical readers and quorum 2/3");
  }
  if (pollIntervalMs <= 0 || observationDeadlineMs <= 0 || readerRequestTimeoutMs <= 0) {
    throw new Error("Polling interval, reader timeout, and observation deadline must be positive");
  }
}
