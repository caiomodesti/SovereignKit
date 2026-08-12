import {
  InMemoryEventStore,
  TelemetryRecorder,
  TransactionTelemetrySession,
  formatTimeline,
} from "../packages/telemetry/dist/index.js";

const identity = {
  observerId: "observer-local",
  keyId: "observer-local-key-1",
  publicKey: "example-public-ed25519-key",
  validFrom: "2026-08-11T00:00:00.000Z",
};

async function healthy() {
  const context = createContext("healthy");
  await beginAcknowledged(context);
  context.clock.advanceMs(355);
  await statusPair(context, "processed");
  context.clock.advanceMs(206);
  await statusPair(context, "confirmed");
  context.clock.advanceMs(525);
  await statusPair(context, "finalized");
  return context.session.timeline();
}

async function rejected() {
  const context = createContext("rejected");
  await context.session.created();
  context.clock.advanceMs(41);
  await context.session.submissionAttempted();
  context.clock.advanceMs(91);
  await context.session.rpcRejected({
    category: "PRE_FLIGHT",
    messageClass: "SimulationFailure",
    mayHaveBeenForwarded: false,
  });
  return context.session.timeline();
}

async function executionFailed() {
  const context = createContext("execution-failed");
  await beginAcknowledged(context);
  const executionError = { InstructionError: [0, "Custom"] };
  context.clock.advanceMs(355);
  await statusPair(context, "processed", executionError);
  context.clock.advanceMs(206);
  await statusPair(context, "confirmed", executionError);
  return context.session.timeline();
}

async function expired() {
  const context = createContext("expired");
  await beginAcknowledged(context);
  context.clock.advanceMs(70_000);
  await context.session.readerBlockHeight({
    observationId: "expired-reader-a",
    readerId: "reader-a",
    blockHeight: 101n,
    commitment: "confirmed",
  });
  await context.session.readerBlockHeight({
    observationId: "expired-reader-b",
    readerId: "reader-b",
    blockHeight: 101n,
    commitment: "confirmed",
  });
  return context.session.timeline();
}

async function inconclusive() {
  const context = createContext("inconclusive");
  await beginAcknowledged(context);
  context.clock.advanceMs(500);
  await context.session.readerSignatureStatus({
    observationId: "only-reader-a",
    readerId: "reader-a",
    status: "confirmed",
    slot: 50n,
  });
  context.clock.advanceMs(500);
  await context.session.observationDeadline(1_000);
  return context.session.timeline();
}

async function beginAcknowledged(context) {
  await context.session.created();
  context.clock.advanceMs(41);
  await context.session.submissionAttempted();
  context.clock.advanceMs(91);
  await context.session.rpcAcknowledged();
  await context.session.observationStarted(["reader-a", "reader-b", "reader-c"]);
}

async function statusPair(context, status, executionError) {
  for (const readerId of ["reader-a", "reader-b"]) {
    await context.session.readerSignatureStatus({
      observationId: `${context.descriptor.attemptId}:${readerId}:${status}`,
      readerId,
      status,
      slot: 50n,
      ...(executionError === undefined ? {} : { executionError }),
    });
  }
}

function createContext(name) {
  const clock = new ExampleClock();
  const store = new InMemoryEventStore();
  const descriptor = {
    transactionId: `tx-${name}`,
    attemptId: `attempt-${name}`,
    routeId: "route-a",
    signature: `8Ax-${name}-public-correlatable-signature`,
    validity: {
      blockhash: "example-blockhash",
      fetchedAt: "2026-08-11T00:00:00.000Z",
      contextSlot: 10n,
      lastValidBlockHeight: 100n,
      blockhashCommitment: "confirmed",
    },
  };
  let eventIndex = 0;
  const recorder = new TelemetryRecorder({
    identity,
    clockDomainId: "example-local-clock",
    softwareVersion: "sprint-1-example",
    clock,
    store,
    idFactory: () => `${name}-event-${eventIndex++}`,
  });
  return {
    clock,
    descriptor,
    session: new TransactionTelemetrySession({ descriptor, recorder, store }),
  };
}

class ExampleClock {
  #milliseconds = 0;

  wallClock() {
    return new Date(Date.UTC(2026, 7, 11) + this.#milliseconds).toISOString();
  }

  monotonicNs() {
    return BigInt(this.#milliseconds) * 1_000_000n;
  }

  advanceMs(milliseconds) {
    this.#milliseconds += milliseconds;
  }
}

for (const scenario of [healthy, rejected, executionFailed, expired, inconclusive]) {
  const timeline = await scenario();
  console.log(`\n=== ${scenario.name} ===`);
  console.log(formatTimeline(timeline));
}
