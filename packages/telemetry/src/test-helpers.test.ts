import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Clock } from "./clock.js";
import type {
  ObservationReader,
  SignatureStatusResult,
  SubmissionResult,
  TransactionSubmitter,
} from "./coordinator.js";
import { trackTransaction } from "./coordinator.js";
import { InMemoryEventStore, JsonlEventStore } from "./event-store.js";
import { formatTimeline } from "./format.js";
import { TelemetryRecorder } from "./recorder.js";
import { TransactionTelemetrySession } from "./session.js";
import { deriveTimeline } from "./timeline.js";
import type { ObserverIdentityReference, TransactionDescriptor, TransactionTimeline } from "./types.js";

const identity: ObserverIdentityReference = {
  observerId: "observer-local",
  keyId: "observer-local-key-1",
  publicKey: "public-ed25519-key-placeholder-for-tests",
  validFrom: "2026-08-10T00:00:00.000Z",
};

describe("Telemetry Core lifecycle", () => {
  it("reconstructs the healthy lifecycle through a logical 2/3 quorum", async () => {
    const clock = new FakeClock();
    const readers = [
      scriptedReader("reader-a", [status("processed"), status("confirmed"), status("finalized")], [90n, 91n, 92n]),
      scriptedReader("reader-b", [status("processed"), status("confirmed"), status("finalized")], [90n, 91n, 92n]),
      scriptedReader("reader-c", [status(null), status(null), status("finalized")], [90n, 91n, 92n]),
    ];
    const timeline = await runScenario({ clock, readers, submitter: acknowledgingSubmitter(clock), deadlineMs: 2_000 });

    expect(timeline.lifecycle.map(entry => entry.state)).toEqual([
      "CREATED",
      "SUBMISSION_ATTEMPTED",
      "RPC_ACKNOWLEDGED",
      "OBSERVATION_PENDING",
      "OBSERVED_EXECUTION_SUCCESS",
      "CONFIRMED",
      "FINALIZED",
    ]);
    expect(timeline.derivedState).toBe("FINALIZED");
    expect(timeline.executionOutcome).toBe("success");
    expect(timeline.quorum.confirmedReaderIds).toEqual(["reader-a", "reader-b", "reader-c"]);
    expect(timeline.durations.rpcResponseMs).toBe(132);
    expect(formatTimeline(timeline)).toContain("RPC_ACKNOWLEDGED");
  });

  it("stops an explicit non-forwarded RPC rejection without claiming ledger failure", async () => {
    const clock = new FakeClock();
    const timeline = await runScenario({
      clock,
      readers: throwingReaders(),
      submitter: {
        async submit(): Promise<SubmissionResult> {
          clock.advanceMs(40);
          return {
            outcome: "rejected",
            error: { category: "PRE_FLIGHT", mayHaveBeenForwarded: false, messageClass: "SimulationFailure" },
          };
        },
      },
    });

    expect(timeline.lifecycle.map(entry => entry.state)).toEqual([
      "CREATED",
      "SUBMISSION_ATTEMPTED",
      "RPC_REJECTED",
    ]);
    expect(timeline.executionOutcome).toBe("not_observed");
  });

  it("records an on-ledger execution failure separately from RPC rejection", async () => {
    const clock = new FakeClock();
    const failure = { InstructionError: [0, "Custom"] };
    const readers = [
      scriptedReader("reader-a", [status("processed", failure), status("finalized", failure)], [90n, 91n]),
      scriptedReader("reader-b", [status("processed", failure), status("finalized", failure)], [90n, 91n]),
      scriptedReader("reader-c", [status(null), status(null)], [90n, 91n]),
    ];
    const timeline = await runScenario({ clock, readers, submitter: acknowledgingSubmitter(clock) });

    expect(timeline.lifecycle.map(entry => entry.state)).toContain("OBSERVED_EXECUTION_FAILED");
    expect(timeline.lifecycle.map(entry => entry.state)).not.toContain("RPC_REJECTED");
    expect(timeline.executionOutcome).toBe("failed");
    expect(timeline.derivedState).toBe("FINALIZED");
  });

  it("derives expiration only after a 2/3 confirmed block-height quorum exceeds lifetime", async () => {
    const clock = new FakeClock();
    const readers = [
      scriptedReader("reader-a", [status(null), status(null)], [100n, 101n]),
      scriptedReader("reader-b", [status(null), status(null)], [100n, 101n]),
      scriptedReader("reader-c", [status(null), status(null)], [100n, 100n]),
    ];
    const timeline = await runScenario({ clock, readers, submitter: acknowledgingSubmitter(clock) });

    expect(timeline.derivedState).toBe("EXPIRED");
    expect(timeline.lifecycle.map(entry => entry.state)).toContain("EXPIRED");
    expect(timeline.quorum.expiredHeightReaderIds).toEqual(["reader-a", "reader-b"]);
  });

  it("turns observation deadline into inconclusive, never expired, when lifetime is not exceeded", async () => {
    const clock = new FakeClock();
    const readers = [
      scriptedReader("reader-a", [status("confirmed"), status("confirmed")], [90n, 91n]),
      scriptedReader("reader-b", [status(null), status(null)], [90n, 91n]),
      scriptedReader("reader-c", [status(null), status(null)], [90n, 91n]),
    ];
    const timeline = await runScenario({
      clock,
      readers,
      submitter: acknowledgingSubmitter(clock),
      deadlineMs: 200,
      pollIntervalMs: 200,
    });

    expect(timeline.derivedState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(timeline.lifecycle.map(entry => entry.state)).not.toContain("EXPIRED");
    expect(timeline.quorum.confirmedReaderIds).toEqual([]);
  });

  it("tolerates one unavailable reader when the other two establish quorum", async () => {
    const clock = new FakeClock();
    const readers = [
      scriptedReader("reader-a", [status("finalized")], [90n]),
      scriptedReader("reader-b", [status("finalized")], [90n]),
      unavailableReader("reader-c"),
    ];
    const timeline = await runScenario({ clock, readers, submitter: acknowledgingSubmitter(clock) });

    expect(timeline.derivedState).toBe("FINALIZED");
    expect(timeline.quorum.finalizedReaderIds).toEqual(["reader-a", "reader-b"]);
  });

  it("bounds a hanging reader request without blocking a 2/3 quorum", async () => {
    const clock = new FakeClock();
    const readers = [
      scriptedReader("reader-a", [status("finalized")], [90n]),
      scriptedReader("reader-b", [status("finalized")], [90n]),
      hangingReader("reader-c"),
    ];
    const { session, descriptor } = createSession(clock);
    const timeline = await trackTransaction({
      descriptor,
      session,
      submitter: acknowledgingSubmitter(clock),
      readers,
      clock,
      readerRequestTimeoutMs: 5,
      observationDeadlineMs: 2_000,
      sleep: async milliseconds => clock.advanceMs(milliseconds),
    });

    expect(timeline.derivedState).toBe("FINALIZED");
    expect(timeline.quorum.finalizedReaderIds).toEqual(["reader-a", "reader-b"]);
  });

  it("deduplicates repeated observations without inventing a second outcome", async () => {
    const clock = new FakeClock();
    const { session, store, descriptor } = createSession(clock);
    await session.created();
    await session.submissionAttempted();
    await session.rpcAcknowledged();
    await session.observationStarted(["reader-a", "reader-b", "reader-c"]);
    const duplicate = {
      observationId: "same-observation",
      readerId: "reader-a",
      status: "confirmed" as const,
      slot: 50n,
    };
    await session.readerSignatureStatus(duplicate);
    await session.readerSignatureStatus(duplicate);
    await session.observationDeadline(500);
    const events = await store.readByAttempt(descriptor.attemptId);
    const timeline = deriveTimeline(events);

    expect(timeline.rawEventCount).toBe(7);
    expect(timeline.effectiveObservationCount).toBe(1);
    expect(timeline.derivedState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(timeline.anomalies).toEqual([]);
  });

  it("quarantines conflicting duplicate observation IDs", async () => {
    const clock = new FakeClock();
    const { session } = createSession(clock);
    await session.created();
    await session.submissionAttempted();
    await session.rpcAcknowledged();
    await session.observationStarted(["reader-a", "reader-b", "reader-c"]);
    await session.readerSignatureStatus({
      observationId: "conflicting-observation",
      readerId: "reader-a",
      status: "confirmed",
      slot: 50n,
    });
    await session.readerSignatureStatus({
      observationId: "conflicting-observation",
      readerId: "reader-a",
      status: null,
    });
    await session.observationDeadline(500);
    const timeline = await session.timeline();

    expect(timeline.effectiveObservationCount).toBe(0);
    expect(timeline.derivedState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(timeline.anomalies).toEqual(["Conflicting duplicate observationId: conflicting-observation"]);
  });

  it("reconstructs the same timeline from append-only JSONL events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-telemetry-"));
    const path = join(directory, "events.jsonl");
    try {
      const clock = new FakeClock();
      const store = new JsonlEventStore(path);
      const descriptor = createDescriptor();
      const recorder = new TelemetryRecorder({
        identity,
        clockDomainId: "clock-local-1",
        softwareVersion: "test-build",
        clock,
        store,
        idFactory: sequentialIds(),
      });
      const session = new TransactionTelemetrySession({ descriptor, recorder, store });
      await session.created();
      await session.submissionAttempted();
      await session.rpcRejected({ category: "RPC", mayHaveBeenForwarded: false });

      const first = await session.timeline();
      const second = deriveTimeline(await new JsonlEventStore(path).readByAttempt(descriptor.attemptId));
      const rawLines = (await readFile(path, "utf8")).trim().split(/\r?\n/u);

      expect(second).toEqual(first);
      expect(rawLines).toHaveLength(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects an invalid payload before it contaminates the append-only JSONL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sovereignkit-invalid-event-"));
    const path = join(directory, "events.jsonl");
    try {
      const store = new JsonlEventStore(path);
      const invalidEvent = {
        schemaVersion: "1",
        measurementVersion: "sovereign-telemetry-v0.1",
        softwareVersion: "test-build",
        eventId: "invalid-event",
        eventType: "OBSERVATION_CYCLE_STARTED",
        attemptId: "attempt-test-1",
        transactionId: "tx-test-1",
        observerId: "observer-local",
        keyId: "observer-local-key-1",
        clockDomainId: "clock-local-1",
        sequence: 0,
        wallClock: "2026-08-10T00:00:00.000Z",
        monotonicNs: "0",
        data: { readerIds: ["reader-a"], requiredQuorum: 2 },
      };

      await expect(store.append(invalidEvent as never)).rejects.toThrow("Invalid SovereignKit measurement event");
      await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

async function runScenario(input: {
  readonly clock: FakeClock;
  readonly readers: readonly ObservationReader[];
  readonly submitter: TransactionSubmitter;
  readonly deadlineMs?: number;
  readonly pollIntervalMs?: number;
}): Promise<TransactionTimeline> {
  const { session, descriptor } = createSession(input.clock);
  return trackTransaction({
    descriptor,
    session,
    submitter: input.submitter,
    readers: input.readers,
    clock: input.clock,
    pollIntervalMs: input.pollIntervalMs ?? 200,
    observationDeadlineMs: input.deadlineMs ?? 2_000,
    sleep: async milliseconds => input.clock.advanceMs(milliseconds),
  });
}

function createSession(clock: FakeClock): {
  readonly session: TransactionTelemetrySession;
  readonly store: InMemoryEventStore;
  readonly descriptor: TransactionDescriptor;
} {
  const store = new InMemoryEventStore();
  const descriptor = createDescriptor();
  const recorder = new TelemetryRecorder({
    identity,
    clockDomainId: "clock-local-1",
    softwareVersion: "test-build",
    clock,
    store,
    idFactory: sequentialIds(),
  });
  return { session: new TransactionTelemetrySession({ descriptor, recorder, store }), store, descriptor };
}

function createDescriptor(): TransactionDescriptor {
  return {
    transactionId: "tx-test-1",
    attemptId: "attempt-test-1",
    routeId: "route-a",
    signature: "8AxTestSignaturePublicAndCorrelatable111111111111111111111111111111111111111111111",
    validity: {
      blockhash: "test-blockhash",
      fetchedAt: "2026-08-10T00:00:00.000Z",
      contextSlot: 10n,
      lastValidBlockHeight: 100n,
      blockhashCommitment: "confirmed",
    },
  };
}

function acknowledgingSubmitter(clock: FakeClock): TransactionSubmitter {
  return {
    async submit(): Promise<SubmissionResult> {
      clock.advanceMs(132);
      return { outcome: "acknowledged", returnedSignature: createDescriptor().signature };
    },
  };
}

function status(value: "processed" | "confirmed" | "finalized" | null, executionError?: unknown): SignatureStatusResult {
  return {
    status: value,
    ...(value === null ? {} : { slot: 50n }),
    ...(executionError === undefined ? {} : { executionError }),
  };
}

function scriptedReader(
  readerId: string,
  statuses: readonly SignatureStatusResult[],
  heights: readonly bigint[],
): ObservationReader {
  let statusIndex = 0;
  let heightIndex = 0;
  return {
    readerId,
    async getSignatureStatus(): Promise<SignatureStatusResult> {
      return statuses[Math.min(statusIndex++, statuses.length - 1)] ?? { status: null };
    },
    async getBlockHeight(): Promise<bigint> {
      return heights[Math.min(heightIndex++, heights.length - 1)] ?? 0n;
    },
  };
}

function unavailableReader(readerId: string): ObservationReader {
  return {
    readerId,
    async getSignatureStatus(): Promise<SignatureStatusResult> {
      throw new TypeError("reader unavailable");
    },
    async getBlockHeight(): Promise<bigint> {
      throw new TypeError("reader unavailable");
    },
  };
}

function hangingReader(readerId: string): ObservationReader {
  const never = new Promise<never>(() => undefined);
  return {
    readerId,
    async getSignatureStatus(): Promise<SignatureStatusResult> {
      return never;
    },
    async getBlockHeight(): Promise<bigint> {
      return never;
    },
  };
}

function throwingReaders(): readonly ObservationReader[] {
  return [unavailableReader("reader-a"), unavailableReader("reader-b"), unavailableReader("reader-c")];
}

function sequentialIds(): () => string {
  let index = 0;
  return () => `event-${index++}`;
}

class FakeClock implements Clock {
  #milliseconds = 0;

  wallClock(): string {
    return new Date(Date.UTC(2026, 7, 10) + this.#milliseconds).toISOString();
  }

  monotonicNs(): bigint {
    return BigInt(this.#milliseconds) * 1_000_000n;
  }

  advanceMs(milliseconds: number): void {
    this.#milliseconds += milliseconds;
  }
}
