import { randomUUID } from "node:crypto";

import type { Clock } from "./clock.js";
import type { AppendOnlyEventStore } from "./event-store.js";
import type {
  MeasurementEvent,
  ObserverIdentityReference,
  ReaderBlockHeightFact,
  ReaderSignatureFact,
  ReaderUnavailableFact,
  RpcErrorFact,
  TransactionDescriptor,
} from "./types.js";
import { MEASUREMENT_VERSION, SCHEMA_VERSION } from "./types.js";

export interface RecorderOptions {
  readonly identity: ObserverIdentityReference;
  readonly clockDomainId: string;
  readonly softwareVersion: string;
  readonly clock: Clock;
  readonly store: AppendOnlyEventStore;
  readonly idFactory?: () => string;
}

export class TelemetryRecorder {
  readonly #identity: ObserverIdentityReference;
  readonly #clockDomainId: string;
  readonly #softwareVersion: string;
  readonly #clock: Clock;
  readonly #store: AppendOnlyEventStore;
  readonly #idFactory: () => string;
  #sequence = 0;

  constructor(options: RecorderOptions) {
    this.#identity = options.identity;
    this.#clockDomainId = options.clockDomainId;
    this.#softwareVersion = options.softwareVersion;
    this.#clock = options.clock;
    this.#store = options.store;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async transactionCreated(descriptor: TransactionDescriptor): Promise<MeasurementEvent> {
    return this.#append(descriptor, "TRANSACTION_CREATED", descriptor);
  }

  async submissionAttempted(descriptor: TransactionDescriptor): Promise<MeasurementEvent> {
    return this.#append(descriptor, "SUBMISSION_ATTEMPTED_RECORDED", { routeId: descriptor.routeId });
  }

  async rpcAcknowledged(descriptor: TransactionDescriptor, returnedSignature: string): Promise<MeasurementEvent> {
    return this.#append(descriptor, "RPC_RESPONSE_RECEIVED", { outcome: "acknowledged", returnedSignature });
  }

  async rpcRejected(descriptor: TransactionDescriptor, error: RpcErrorFact): Promise<MeasurementEvent> {
    return this.#append(descriptor, "RPC_RESPONSE_RECEIVED", { outcome: "rejected", error });
  }

  async observationStarted(
    descriptor: TransactionDescriptor,
    readerIds: readonly string[],
    requiredQuorum = 2,
  ): Promise<MeasurementEvent> {
    return this.#append(descriptor, "OBSERVATION_CYCLE_STARTED", { readerIds, requiredQuorum });
  }

  async readerSignatureStatus(
    descriptor: TransactionDescriptor,
    fact: ReaderSignatureFact,
  ): Promise<MeasurementEvent> {
    return this.#append(descriptor, "READER_SIGNATURE_STATUS_RECEIVED", fact);
  }

  async readerBlockHeight(
    descriptor: TransactionDescriptor,
    fact: ReaderBlockHeightFact,
  ): Promise<MeasurementEvent> {
    return this.#append(descriptor, "READER_BLOCK_HEIGHT_RECEIVED", fact);
  }

  async readerUnavailable(
    descriptor: TransactionDescriptor,
    fact: ReaderUnavailableFact,
  ): Promise<MeasurementEvent> {
    return this.#append(descriptor, "READER_UNAVAILABLE", fact);
  }

  async observationDeadline(descriptor: TransactionDescriptor, deadlineMs: number): Promise<MeasurementEvent> {
    return this.#append(descriptor, "OBSERVATION_DEADLINE_REACHED", { deadlineMs });
  }

  async #append<Type extends MeasurementEvent["eventType"]>(
    descriptor: TransactionDescriptor,
    eventType: Type,
    data: Extract<MeasurementEvent, { eventType: Type }>["data"],
  ): Promise<MeasurementEvent> {
    const event = {
      schemaVersion: SCHEMA_VERSION,
      measurementVersion: MEASUREMENT_VERSION,
      softwareVersion: this.#softwareVersion,
      eventId: this.#idFactory(),
      eventType,
      attemptId: descriptor.attemptId,
      transactionId: descriptor.transactionId,
      observerId: this.#identity.observerId,
      keyId: this.#identity.keyId,
      clockDomainId: this.#clockDomainId,
      sequence: this.#sequence++,
      wallClock: this.#clock.wallClock(),
      monotonicNs: this.#clock.monotonicNs().toString(),
      data,
    } as Extract<MeasurementEvent, { eventType: Type }>;
    await this.#store.append(event);
    return event;
  }
}
