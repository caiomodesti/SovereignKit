import type {
  QuorumSupport,
  ReaderBlockHeightEvent,
  ReaderSignatureStatusEvent,
  SignatureStatus,
} from "./types.js";
import { OBSERVATION_QUORUM_VERSION } from "./types.js";

const STATUS_RANK: Readonly<Record<SignatureStatus, number>> = {
  processed: 1,
  confirmed: 2,
  finalized: 3,
};

export interface QuorumEvaluation {
  readonly support: QuorumSupport;
  readonly observedSuccessAt?: ReaderSignatureStatusEvent;
  readonly observedFailureAt?: ReaderSignatureStatusEvent;
  readonly confirmedAt?: ReaderSignatureStatusEvent;
  readonly finalizedAt?: ReaderSignatureStatusEvent;
  readonly expiredAt?: ReaderBlockHeightEvent;
}

export function evaluateObservationQuorum(input: {
  readonly signatureEvents: readonly ReaderSignatureStatusEvent[];
  readonly blockHeightEvents: readonly ReaderBlockHeightEvent[];
  readonly lastValidBlockHeight: bigint;
  readonly required?: number;
}): QuorumEvaluation {
  const required = input.required ?? 2;
  const statusEvents = [...input.signatureEvents].sort(compareEvents);
  const latestStatusByReader = new Map<string, ReaderSignatureStatusEvent>();
  let observedSuccessAt: ReaderSignatureStatusEvent | undefined;
  let observedFailureAt: ReaderSignatureStatusEvent | undefined;
  let confirmedAt: ReaderSignatureStatusEvent | undefined;
  let finalizedAt: ReaderSignatureStatusEvent | undefined;

  for (const event of statusEvents) {
    latestStatusByReader.set(event.data.readerId, event);
    const snapshot = statusSnapshot(latestStatusByReader, required);
    if (observedSuccessAt === undefined && snapshot.observedSuccess.length >= required) {
      observedSuccessAt = event;
    }
    if (observedFailureAt === undefined && snapshot.observedFailure.length >= required) {
      observedFailureAt = event;
    }
    if (confirmedAt === undefined && snapshot.confirmed.length >= required) {
      confirmedAt = event;
    }
    if (finalizedAt === undefined && snapshot.finalized.length >= required) {
      finalizedAt = event;
    }
  }

  const finalStatus = statusSnapshot(latestStatusByReader, required);
  const latestHeightByReader = latestByReader(input.blockHeightEvents);
  const hasAnyLedgerObservation = statusEvents.some(event => event.data.status !== null);
  const expiredHeights = hasAnyLedgerObservation
    ? []
    : [...latestHeightByReader.values()].filter(
        event => BigInt(event.data.blockHeight) > input.lastValidBlockHeight,
      );
  const expiredAt = findExpirationEvent(input.blockHeightEvents, input.lastValidBlockHeight, required, hasAnyLedgerObservation);

  return {
    support: {
      version: OBSERVATION_QUORUM_VERSION,
      required,
      observedSuccessReaderIds: readerIds(finalStatus.observedSuccess),
      observedFailureReaderIds: readerIds(finalStatus.observedFailure),
      confirmedReaderIds: readerIds(finalStatus.confirmed),
      finalizedReaderIds: readerIds(finalStatus.finalized),
      expiredHeightReaderIds: readerIds(expiredHeights),
      hasAnyLedgerObservation,
      inconsistentExecutionClaims: finalStatus.observedSuccess.length > 0 && finalStatus.observedFailure.length > 0,
    },
    ...(observedSuccessAt === undefined ? {} : { observedSuccessAt }),
    ...(observedFailureAt === undefined ? {} : { observedFailureAt }),
    ...(confirmedAt === undefined ? {} : { confirmedAt }),
    ...(finalizedAt === undefined ? {} : { finalizedAt }),
    ...(expiredAt === undefined ? {} : { expiredAt }),
  };
}

function statusSnapshot(latest: ReadonlyMap<string, ReaderSignatureStatusEvent>, required: number): {
  readonly observedSuccess: ReaderSignatureStatusEvent[];
  readonly observedFailure: ReaderSignatureStatusEvent[];
  readonly confirmed: ReaderSignatureStatusEvent[];
  readonly finalized: ReaderSignatureStatusEvent[];
} {
  const observedSuccess = [...latest.values()].filter(
    event => event.data.status !== null && event.data.executionError === undefined,
  );
  const observedFailure = [...latest.values()].filter(
    event => event.data.status !== null && event.data.executionError !== undefined,
  );
  const winning = observedFailure.length >= required
    ? observedFailure
    : observedSuccess.length >= required
      ? observedSuccess
      : [];
  return {
    observedSuccess,
    observedFailure,
    confirmed: winning.filter(
      event => event.data.status !== null && STATUS_RANK[event.data.status] >= STATUS_RANK.confirmed,
    ),
    finalized: winning.filter(
      event => event.data.status !== null && STATUS_RANK[event.data.status] >= STATUS_RANK.finalized,
    ),
  };
}

function findExpirationEvent(
  events: readonly ReaderBlockHeightEvent[],
  lastValidBlockHeight: bigint,
  required: number,
  hasAnyLedgerObservation: boolean,
): ReaderBlockHeightEvent | undefined {
  if (hasAnyLedgerObservation) {
    return undefined;
  }
  const latest = new Map<string, ReaderBlockHeightEvent>();
  for (const event of [...events].sort(compareEvents)) {
    latest.set(event.data.readerId, event);
    const expired = [...latest.values()].filter(item => BigInt(item.data.blockHeight) > lastValidBlockHeight);
    if (expired.length >= required) {
      return event;
    }
  }
  return undefined;
}

function latestByReader<Event extends ReaderSignatureStatusEvent | ReaderBlockHeightEvent>(
  events: readonly Event[],
): Map<string, Event> {
  const latest = new Map<string, Event>();
  for (const event of events) {
    const existing = latest.get(event.data.readerId);
    if (existing === undefined || compareEvents(existing, event) < 0) {
      latest.set(event.data.readerId, event);
    }
  }
  return latest;
}

function readerIds(events: readonly (ReaderSignatureStatusEvent | ReaderBlockHeightEvent)[]): string[] {
  return events.map(event => event.data.readerId).sort();
}

function compareEvents(left: ReaderSignatureStatusEvent | ReaderBlockHeightEvent, right: ReaderSignatureStatusEvent | ReaderBlockHeightEvent): number {
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
}
