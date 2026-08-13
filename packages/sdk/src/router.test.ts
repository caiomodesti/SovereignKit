import { describe, expect, test } from "vitest";

import {
  ReactiveRouter,
  type IndependentObserver,
  type LogicalRoute,
  type ReactiveRouterPolicy,
  type RouteSubmissionResult,
  type RouteSubmitter,
  type SignedTransactionRequest,
} from "./index.js";

const routes: readonly LogicalRoute[] = [
  route("primary", "http://127.0.0.1:8899"),
  route("fallback-a", "http://127.0.0.1:8898"),
  route("fallback-b", "http://127.0.0.1:8897"),
];
const transaction: SignedTransactionRequest = {
  transactionId: "transaction-1",
  signature: "signature-1",
  wireTransactionBase64: "AQID",
};
const policy: ReactiveRouterPolicy = {
  maxRoutes: 3,
  routeTimeoutMs: 50,
  observationTimeoutMs: 50,
  overallDeadlineMs: 1_000,
  telemetryHookTimeoutMs: 20,
  requiredObservationQuorum: 2,
};

describe("ReactiveRouter", () => {
  test("fails over from a rejected primary and succeeds only after independent confirmation", async () => {
    const submissions: string[] = [];
    const submitter = scriptedSubmitter(routeId => {
      submissions.push(routeId);
      return routeId === "primary"
        ? { outcome: "RPC_REJECTED", errorCategory: "RPC", errorCode: -32000 }
        : { outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature };
    });
    const observer = scriptedObserver([
      { state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] },
    ]);
    const result = await new ReactiveRouter({ routes, policy, submitter, observer }).route(transaction);

    expect(result.finalState).toBe("CONFIRMED");
    expect(result.confirmationObservedAfterRouteId).toBe("fallback-a");
    expect(submissions).toEqual(["primary", "fallback-a"]);
    expect(result.visitedRouteIds).toEqual(["primary", "fallback-a"]);
    expect(new Set(result.visitedRouteIds).size).toBe(result.visitedRouteIds.length);
    expect(result.attempts).toEqual([
      { attemptNumber: 1, routeId: "primary", submissionOutcome: "RPC_REJECTED" },
      { attemptNumber: 2, routeId: "fallback-a", submissionOutcome: "RPC_ACKNOWLEDGED", observationState: "CONFIRMED" },
    ]);
    expect(result.events.some(event => event.eventType === "FALLBACK_SELECTED")).toBe(true);
    expect(result.events.find(event => event.eventType === "ROUTE_RPC_ACKNOWLEDGED")?.data).toMatchObject({ landing: false });
    expect(result.events.at(-1)?.eventType).toBe("ROUTING_CONFIRMED");
  });

  test("does not treat an acknowledged primary as landing and falls back after inconclusive observation", async () => {
    const observer = scriptedObserver([
      { state: "OBSERVATION_INCONCLUSIVE", supportingReaderIds: ["reader-1", "reader-2"] },
      { state: "FINALIZED", supportingReaderIds: ["reader-2", "reader-3"] },
    ]);
    const result = await new ReactiveRouter({
      routes,
      policy,
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer,
    }).route(transaction);

    expect(result.finalState).toBe("FINALIZED");
    expect(result.confirmationObservedAfterRouteId).toBe("fallback-a");
    expect(result.attempts).toHaveLength(2);
    expect(result.events.filter(event => event.eventType === "ROUTE_RPC_ACKNOWLEDGED")).toHaveLength(2);
  });

  test("rejects false quorum and exhausts its bounded route set", async () => {
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, maxRoutes: 2 },
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer: scriptedObserver([
        { state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-1"] },
        { state: "CONFIRMED", supportingReaderIds: ["reader-1", "unknown-reader"] },
      ]),
    }).route(transaction);

    expect(result.finalState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(result.attempts).toHaveLength(2);
    expect(result.visitedRouteIds).toEqual(["primary", "fallback-a"]);
    expect(result.events.at(-1)?.eventType).toBe("ROUTING_EXHAUSTED");
    expect(result.events.filter(event => event.data.anomaly !== undefined)).toHaveLength(2);
  });

  test("times out a hanging primary, aborts it, and uses the fallback", async () => {
    let primaryAborted = false;
    const submitter: RouteSubmitter = {
      submit(routeValue, _transactionValue, signal) {
        if (routeValue.routeId !== "primary") {
          return Promise.resolve({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature });
        }
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            primaryAborted = true;
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
        });
      },
    };
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, routeTimeoutMs: 10 },
      submitter,
      observer: scriptedObserver([{ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }]),
    }).route(transaction);

    expect(primaryAborted).toBe(true);
    expect(result.finalState).toBe("CONFIRMED");
    expect(result.attempts[0]?.submissionOutcome).toBe("TIMED_OUT");
    expect(result.confirmationObservedAfterRouteId).toBe("fallback-a");
  });

  test("falls back when independent observation times out without converting timeout to expiry", async () => {
    let calls = 0;
    const observer: IndependentObserver = {
      readers: [
        { readerId: "reader-1", clientIdentity: "reader-client-1" },
        { readerId: "reader-2", clientIdentity: "reader-client-2" },
        { readerId: "reader-3", clientIdentity: "reader-client-3" },
      ],
      observe(_transactionValue, signal) {
        calls += 1;
        if (calls === 2) return Promise.resolve({ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] });
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      },
    };
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, observationTimeoutMs: 5 },
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer,
    }).route(transaction);
    expect(result.finalState).toBe("CONFIRMED");
    expect(result.attempts[0]?.observationState).toBe("TIMED_OUT");
    expect(result.attempts[1]?.observationState).toBe("CONFIRMED");
    expect(result.events.some(event => event.eventType === "INDEPENDENT_OBSERVATION_TIMED_OUT")).toBe(true);
    expect(result.events.some(event => event.data.state === "EXPIRED")).toBe(false);
  });

  test("stops on independently observed execution failure instead of futile rebroadcast", async () => {
    const result = await new ReactiveRouter({
      routes,
      policy,
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer: scriptedObserver([{ state: "OBSERVED_EXECUTION_FAILED", supportingReaderIds: ["reader-1", "reader-3"] }]),
    }).route(transaction);
    expect(result.finalState).toBe("OBSERVED_EXECUTION_FAILED");
    expect(result.attempts).toHaveLength(1);
    expect(result.confirmationObservedAfterRouteId).toBeUndefined();
    expect(result.events.at(-1)?.eventType).toBe("ROUTING_TERMINAL_FAILURE");
  });

  test("does not let telemetry-hook failure prevent confirmed routing", async () => {
    const result = await new ReactiveRouter({
      routes,
      policy,
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer: scriptedObserver([{ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }]),
      telemetryHook: () => { throw new Error("sink unavailable"); },
    }).route(transaction);
    expect(result.finalState).toBe("CONFIRMED");
    expect(result.telemetryHookErrors.length).toBe(result.events.length);
    expect(new Set(result.telemetryHookErrors)).toEqual(new Set(["Error"]));
  });

  test("bounds a telemetry hook that ignores cancellation", async () => {
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, telemetryHookTimeoutMs: 2 },
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer: scriptedObserver([{ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }]),
      telemetryHook: () => new Promise(() => undefined),
    }).route(transaction);
    expect(result.finalState).toBe("CONFIRMED");
    expect(result.telemetryHookErrors).toContain("TimeoutError");
  });

  test("contains a synchronous submitter exception and fails over", async () => {
    const submitter: RouteSubmitter = {
      submit(routeValue) {
        if (routeValue.routeId === "primary") throw new TypeError("broken adapter");
        return Promise.resolve({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature });
      },
    };
    const result = await new ReactiveRouter({
      routes,
      policy,
      submitter,
      observer: scriptedObserver([{ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }]),
    }).route(transaction);
    expect(result.finalState).toBe("CONFIRMED");
    expect(result.attempts.map(attempt => attempt.routeId)).toEqual(["primary", "fallback-a"]);
    expect(result.events.find(event => event.eventType === "ROUTE_RPC_REJECTED")?.data).toMatchObject({ errorCategory: "TypeError" });
  });

  test("rejects duplicate routes and invalid bounds before sending", () => {
    const submitter = scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature }));
    const observer = scriptedObserver([]);
    expect(() => new ReactiveRouter({ routes: [routes[0]!, routes[0]!], policy: { ...policy, maxRoutes: 2 }, submitter, observer })).toThrow(/unique/);
    expect(() => new ReactiveRouter({ routes, policy: { ...policy, maxRoutes: 4 }, submitter, observer })).toThrow(/maxRoutes/);
    expect(() => new ReactiveRouter({
      routes,
      policy,
      submitter,
      observer: { ...observer, readers: [{ readerId: "reader-1", clientIdentity: "submit-client-primary" }, ...observer.readers.slice(1)] },
    })).toThrow(/cannot reuse/);
  });

  test("rejects a mismatched RPC signature and never reports confirmation from acknowledgment alone", async () => {
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, maxRoutes: 1 },
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: "different-signature" })),
      observer: scriptedObserver([]),
    }).route(transaction);
    expect(result.finalState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(result.attempts).toEqual([{ attemptNumber: 1, routeId: "primary", submissionOutcome: "RPC_REJECTED" }]);
    expect(result.events.some(event => event.eventType === "ROUTING_CONFIRMED")).toBe(false);
  });

  test("enforces the overall deadline before visiting another route", async () => {
    let monotonic = 0;
    const result = await new ReactiveRouter({
      routes,
      policy: { ...policy, overallDeadlineMs: 6 },
      submitter: scriptedSubmitter(() => ({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature })),
      observer: scriptedObserver([]),
      monotonicClockMs: () => { const value = monotonic; monotonic += 5; return value; },
    }).route(transaction);
    expect(result.finalState).toBe("OBSERVATION_INCONCLUSIVE");
    expect(result.visitedRouteIds).toEqual([]);
    expect(result.events.at(-1)?.eventType).toBe("ROUTING_DEADLINE_REACHED");
  });
});

function route(routeId: string, logicalEndpoint: string): LogicalRoute {
  return {
    routeId,
    logicalEndpoint,
    transport: "http_json_rpc",
    observerRegion: "local",
    configurationProfile: "sprint-3-local-v1",
    submissionClientIdentity: `submit-client-${routeId}`,
  };
}

function scriptedSubmitter(resolve: (routeId: string) => RouteSubmissionResult): RouteSubmitter {
  return { submit: routeValue => Promise.resolve(resolve(routeValue.routeId)) };
}

function scriptedObserver(observations: Array<Awaited<ReturnType<IndependentObserver["observe"]>>>): IndependentObserver {
  return {
    readers: [
      { readerId: "reader-1", clientIdentity: "reader-client-1" },
      { readerId: "reader-2", clientIdentity: "reader-client-2" },
      { readerId: "reader-3", clientIdentity: "reader-client-3" },
    ],
    async observe() {
      const next = observations.shift();
      if (next === undefined) throw new Error("unexpected observation call");
      return next;
    },
  };
}
