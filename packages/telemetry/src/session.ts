import type { AppendOnlyEventStore } from "./event-store.js";
import type { TelemetryRecorder } from "./recorder.js";
import { deriveTimeline } from "./timeline.js";
import type {
  ReaderBlockHeightFact,
  ReaderSignatureFact,
  ReaderUnavailableFact,
  RpcErrorFact,
  TransactionDescriptor,
  TransactionTimeline,
} from "./types.js";

export class TransactionTelemetrySession {
  readonly #descriptor: TransactionDescriptor;
  readonly #recorder: TelemetryRecorder;
  readonly #store: AppendOnlyEventStore;

  constructor(input: {
    readonly descriptor: TransactionDescriptor;
    readonly recorder: TelemetryRecorder;
    readonly store: AppendOnlyEventStore;
  }) {
    this.#descriptor = input.descriptor;
    this.#recorder = input.recorder;
    this.#store = input.store;
  }

  async created(): Promise<void> {
    await this.#recorder.transactionCreated(this.#descriptor);
  }

  async submissionAttempted(): Promise<void> {
    await this.#recorder.submissionAttempted(this.#descriptor);
  }

  async rpcAcknowledged(returnedSignature = this.#descriptor.signature): Promise<void> {
    await this.#recorder.rpcAcknowledged(this.#descriptor, returnedSignature);
  }

  async rpcRejected(error: RpcErrorFact): Promise<void> {
    await this.#recorder.rpcRejected(this.#descriptor, error);
  }

  async observationStarted(readerIds: readonly string[], requiredQuorum = 2): Promise<void> {
    await this.#recorder.observationStarted(this.#descriptor, readerIds, requiredQuorum);
  }

  async readerSignatureStatus(fact: ReaderSignatureFact): Promise<void> {
    await this.#recorder.readerSignatureStatus(this.#descriptor, fact);
  }

  async readerBlockHeight(fact: ReaderBlockHeightFact): Promise<void> {
    await this.#recorder.readerBlockHeight(this.#descriptor, fact);
  }

  async readerUnavailable(fact: ReaderUnavailableFact): Promise<void> {
    await this.#recorder.readerUnavailable(this.#descriptor, fact);
  }

  async observationDeadline(deadlineMs: number): Promise<void> {
    await this.#recorder.observationDeadline(this.#descriptor, deadlineMs);
  }

  async timeline(): Promise<TransactionTimeline> {
    return deriveTimeline(await this.#store.readByAttempt(this.#descriptor.attemptId));
  }
}
