import { canonicalJson } from "./canonical-json.js";
import { evaluateObservationQuorum } from "./quorum.js";
import type {
  LifecycleEntry,
  LifecycleState,
  MeasurementEvent,
  ReaderBlockHeightEvent,
  ReaderSignatureStatusEvent,
  TransactionCreatedEvent,
  TransactionTimeline,
} from "./types.js";

export function deriveTimeline(rawEvents: readonly MeasurementEvent[]): TransactionTimeline {
  const events = [...rawEvents].sort(compareEvents);
  const created = events.find((event): event is TransactionCreatedEvent => event.eventType === "TRANSACTION_CREATED");
  if (created === undefined) {
    throw new Error("Cannot derive a transaction timeline without TRANSACTION_CREATED");
  }

  assertSingleAttempt(events, created.attemptId);
  const anomalies: string[] = [];
  const signatureEvents = deduplicateObservations(
    events.filter((event): event is ReaderSignatureStatusEvent => event.eventType === "READER_SIGNATURE_STATUS_RECEIVED"),
    anomalies,
  );
  const blockHeightEvents = deduplicateObservations(
    events.filter((event): event is ReaderBlockHeightEvent => event.eventType === "READER_BLOCK_HEIGHT_RECEIVED"),
    anomalies,
  );
  const observationStarted = events.find(event => event.eventType === "OBSERVATION_CYCLE_STARTED");
  const requiredQuorum = observationStarted?.eventType === "OBSERVATION_CYCLE_STARTED"
    ? observationStarted.data.requiredQuorum
    : 2;
  const quorum = evaluateObservationQuorum({
    signatureEvents,
    blockHeightEvents,
    lastValidBlockHeight: BigInt(created.data.validity.lastValidBlockHeight),
    required: requiredQuorum,
  });
  const lifecycle: LifecycleEntry[] = [entry("CREATED", created)];
  const attempted = events.find(event => event.eventType === "SUBMISSION_ATTEMPTED_RECORDED");
  if (attempted !== undefined) {
    lifecycle.push(entry("SUBMISSION_ATTEMPTED", attempted));
  }

  const response = events.find(event => event.eventType === "RPC_RESPONSE_RECEIVED");
  if (response?.eventType === "RPC_RESPONSE_RECEIVED") {
    lifecycle.push(entry(response.data.outcome === "acknowledged" ? "RPC_ACKNOWLEDGED" : "RPC_REJECTED", response));
    if (response.data.outcome === "acknowledged" && response.data.returnedSignature !== created.data.signature) {
      anomalies.push("RPC returned a signature that does not match the signed transaction descriptor");
    }
  }
  if (observationStarted !== undefined) {
    lifecycle.push(entry("OBSERVATION_PENDING", observationStarted));
  }

  if (quorum.observedFailureAt !== undefined) {
    lifecycle.push(quorumEntry("OBSERVED_EXECUTION_FAILED", quorum.observedFailureAt, signatureEvents, "failed", requiredQuorum));
  } else if (quorum.observedSuccessAt !== undefined) {
    lifecycle.push(quorumEntry("OBSERVED_EXECUTION_SUCCESS", quorum.observedSuccessAt, signatureEvents, "success", requiredQuorum));
  }
  if (quorum.confirmedAt !== undefined) {
    lifecycle.push(quorumStatusEntry("CONFIRMED", quorum.confirmedAt, signatureEvents, requiredQuorum, "confirmed"));
  }
  if (quorum.finalizedAt !== undefined) {
    lifecycle.push(quorumStatusEntry("FINALIZED", quorum.finalizedAt, signatureEvents, requiredQuorum, "finalized"));
  }
  if (quorum.expiredAt !== undefined) {
    lifecycle.push(quorumHeightEntry("EXPIRED", quorum.expiredAt, blockHeightEvents, requiredQuorum, created.data.validity.lastValidBlockHeight));
  }

  const deadline = [...events].reverse().find(event => event.eventType === "OBSERVATION_DEADLINE_REACHED");
  const hasTerminalObservation = lifecycle.some(item =>
    item.state === "FINALIZED" || item.state === "EXPIRED" || item.state === "CONFIRMED",
  );
  if (deadline !== undefined && !hasTerminalObservation) {
    lifecycle.push(entry("OBSERVATION_INCONCLUSIVE", deadline));
  }

  lifecycle.sort((left, right) => {
    const leftEvent = eventForEntry(left, events);
    const rightEvent = eventForEntry(right, events);
    return compareEvents(leftEvent, rightEvent) || lifecycleRank(left.state) - lifecycleRank(right.state);
  });

  const executionOutcome = quorum.observedFailureAt !== undefined
    ? "failed"
    : quorum.observedSuccessAt !== undefined
      ? "success"
      : "not_observed";
  const descriptor = created.data;

  return {
    transactionId: descriptor.transactionId,
    attemptId: descriptor.attemptId,
    ...(descriptor.experimentId === undefined ? {} : { experimentId: descriptor.experimentId }),
    ...(descriptor.probeId === undefined ? {} : { probeId: descriptor.probeId }),
    routeId: descriptor.routeId,
    signature: descriptor.signature,
    validity: descriptor.validity,
    lifecycle,
    derivedState: lifecycle.at(-1)?.state ?? "CREATED",
    executionOutcome,
    quorum: quorum.support,
    durations: deriveDurations(created, lifecycle, events),
    rawEventCount: events.length,
    effectiveObservationCount: signatureEvents.length + blockHeightEvents.length,
    anomalies,
  };
}

function deduplicateObservations<Event extends ReaderSignatureStatusEvent | ReaderBlockHeightEvent>(
  events: readonly Event[],
  anomalies: string[],
): Event[] {
  const byObservationId = new Map<string, Event>();
  const conflicted = new Set<string>();
  for (const event of events) {
    const id = event.data.observationId;
    const existing = byObservationId.get(id);
    if (existing === undefined) {
      byObservationId.set(id, event);
      continue;
    }
    if (canonicalJson(existing.data) !== canonicalJson(event.data)) {
      conflicted.add(id);
      anomalies.push(`Conflicting duplicate observationId: ${id}`);
    }
  }
  return [...byObservationId.entries()]
    .filter(([id]) => !conflicted.has(id))
    .map(([, event]) => event);
}

function quorumEntry(
  state: "OBSERVED_EXECUTION_SUCCESS" | "OBSERVED_EXECUTION_FAILED",
  establishingEvent: ReaderSignatureStatusEvent,
  events: readonly ReaderSignatureStatusEvent[],
  outcome: "success" | "failed",
  required: number,
): LifecycleEntry {
  const supporting = latestSignatureEvents(events.filter(event => compareEvents(event, establishingEvent) <= 0)).filter(event =>
    event.data.status !== null && (event.data.executionError === undefined ? "success" : "failed") === outcome,
  );
  return entryFromSupport(state, establishingEvent, supporting, required);
}

function quorumStatusEntry(
  state: "CONFIRMED" | "FINALIZED",
  establishingEvent: ReaderSignatureStatusEvent,
  events: readonly ReaderSignatureStatusEvent[],
  required: number,
  minimumStatus: "confirmed" | "finalized",
): LifecycleEntry {
  const ranks = { processed: 1, confirmed: 2, finalized: 3 } as const;
  const wantedOutcome = establishingEvent.data.executionError === undefined ? "success" : "failed";
  const supporting = latestSignatureEvents(events.filter(event => compareEvents(event, establishingEvent) <= 0)).filter(event =>
    event.data.status !== null &&
    ranks[event.data.status] >= ranks[minimumStatus] &&
    (event.data.executionError === undefined ? "success" : "failed") === wantedOutcome,
  );
  return entryFromSupport(state, establishingEvent, supporting, required);
}

function quorumHeightEntry(
  state: "EXPIRED",
  establishingEvent: ReaderBlockHeightEvent,
  events: readonly ReaderBlockHeightEvent[],
  required: number,
  lastValidBlockHeight: bigint,
): LifecycleEntry {
  const supporting = latestReaderEvents(events.filter(event => compareEvents(event, establishingEvent) <= 0))
    .filter(event => BigInt(event.data.blockHeight) > lastValidBlockHeight);
  return entryFromSupport(state, establishingEvent, supporting, required);
}

function entryFromSupport(
  state: LifecycleState,
  establishingEvent: MeasurementEvent,
  supporting: readonly MeasurementEvent[],
  required: number,
): LifecycleEntry {
  const sourceEventIds = [...supporting]
    .sort(compareEvents)
    .slice(0, Math.max(required, 1))
    .map(event => event.eventId);
  return {
    state,
    sourceEventIds,
    wallClock: establishingEvent.wallClock,
    monotonicNs: establishingEvent.monotonicNs,
  };
}

function latestSignatureEvents(events: readonly ReaderSignatureStatusEvent[]): ReaderSignatureStatusEvent[] {
  return latestReaderEvents(events);
}

function latestReaderEvents<Event extends ReaderSignatureStatusEvent | ReaderBlockHeightEvent>(events: readonly Event[]): Event[] {
  const latest = new Map<string, Event>();
  for (const event of events) {
    const existing = latest.get(event.data.readerId);
    if (existing === undefined || compareEvents(existing, event) < 0) {
      latest.set(event.data.readerId, event);
    }
  }
  return [...latest.values()];
}

function entry(state: LifecycleState, event: MeasurementEvent): LifecycleEntry {
  return {
    state,
    sourceEventIds: [event.eventId],
    wallClock: event.wallClock,
    monotonicNs: event.monotonicNs,
  };
}

function deriveDurations(
  created: TransactionCreatedEvent,
  lifecycle: readonly LifecycleEntry[],
  events: readonly MeasurementEvent[],
): TransactionTimeline["durations"] {
  const attempted = lifecycle.find(item => item.state === "SUBMISSION_ATTEMPTED");
  const response = lifecycle.find(item => item.state === "RPC_ACKNOWLEDGED" || item.state === "RPC_REJECTED");
  const observed = lifecycle.find(item => item.state === "OBSERVED_EXECUTION_SUCCESS" || item.state === "OBSERVED_EXECUTION_FAILED");
  const confirmed = lifecycle.find(item => item.state === "CONFIRMED");
  const finalized = lifecycle.find(item => item.state === "FINALIZED");
  const expired = lifecycle.find(item => item.state === "EXPIRED");
  const duration = (start: LifecycleEntry | undefined, end: LifecycleEntry | undefined): number | undefined => {
    if (start === undefined || end === undefined) {
      return undefined;
    }
    const startEvent = eventForEntry(start, events);
    const endEvent = eventForEntry(end, events);
    if (startEvent.clockDomainId !== endEvent.clockDomainId) {
      return undefined;
    }
    return Number(BigInt(end.monotonicNs) - BigInt(start.monotonicNs)) / 1_000_000;
  };
  const createdEntry = entry("CREATED", created);
  const rpcResponseMs = duration(attempted, response);
  const observedMs = duration(createdEntry, observed);
  const confirmedMs = duration(createdEntry, confirmed);
  const finalizedMs = duration(createdEntry, finalized);
  const expiredMs = duration(createdEntry, expired);
  return {
    ...(rpcResponseMs === undefined ? {} : { rpcResponseMs }),
    ...(observedMs === undefined ? {} : { observedMs }),
    ...(confirmedMs === undefined ? {} : { confirmedMs }),
    ...(finalizedMs === undefined ? {} : { finalizedMs }),
    ...(expiredMs === undefined ? {} : { expiredMs }),
  };
}

function eventForEntry(entryValue: LifecycleEntry, events: readonly MeasurementEvent[]): MeasurementEvent {
  const event = events.find(candidate => candidate.eventId === entryValue.sourceEventIds.at(-1));
  if (event === undefined) {
    throw new Error(`Timeline entry references missing event: ${entryValue.sourceEventIds.at(-1) ?? "none"}`);
  }
  return event;
}

function assertSingleAttempt(events: readonly MeasurementEvent[], attemptId: string): void {
  if (events.some(event => event.attemptId !== attemptId)) {
    throw new Error("Cannot derive a timeline from multiple attempt IDs");
  }
}

function compareEvents(left: MeasurementEvent, right: MeasurementEvent): number {
  return left.sequence - right.sequence || left.eventId.localeCompare(right.eventId);
}

function lifecycleRank(state: LifecycleState): number {
  return [
    "CREATED",
    "SUBMISSION_ATTEMPTED",
    "RPC_ACKNOWLEDGED",
    "RPC_REJECTED",
    "OBSERVATION_PENDING",
    "OBSERVED_EXECUTION_SUCCESS",
    "OBSERVED_EXECUTION_FAILED",
    "CONFIRMED",
    "FINALIZED",
    "EXPIRED",
    "OBSERVATION_INCONCLUSIVE",
  ].indexOf(state);
}
