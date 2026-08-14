import { describe, expect, test, vi } from "vitest";

import {
  IntelligenceSnapshotClient,
  ReactiveRouter,
  buildIntelligenceSnapshot,
  type IndependentObserver,
  type IntelligenceClassification,
  type IntelligenceSummaryInput,
  type LogicalRoute,
  type ReactiveRouterPolicy,
  type RouteIntelligenceDecisionSource,
  type RouteSubmitter,
  type SignedTransactionRequest,
} from "./index.js";

const generatedAt = new Date("2026-08-14T00:00:00.000Z");
const routingNow = new Date("2026-08-14T00:00:01.000Z");
const routes: readonly LogicalRoute[] = [route("primary"), route("fallback-a"), route("fallback-b")];
const transaction: SignedTransactionRequest = { transactionId: "probe-informed-1", signature: "signature-1", wireTransactionBase64: "AQID" };
const policy: ReactiveRouterPolicy = {
  maxRoutes: 3,
  routeTimeoutMs: 50,
  observationTimeoutMs: 50,
  overallDeadlineMs: 1_000,
  telemetryHookTimeoutMs: 20,
  requiredObservationQuorum: 2,
};

describe("probe-informed ReactiveRouter", () => {
  test("moves a fresh avoided PROGRAM_X route behind locally configured fallbacks", async () => {
    const client = await avoidedPrimaryClient();
    const submissions: string[] = [];
    const result = await router({
      intelligenceSource: client,
      submitter: acknowledgingSubmitter(submissions),
    }).route(transaction, { transactionClass: "PROGRAM_X" });

    expect(result.routerVersion).toBe("ReactiveRouter@0.2.0");
    expect(result.routingMode).toBe("PROBE_INFORMED");
    expect(result.configuredRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(result.selectedRouteIds).toEqual(["fallback-a", "fallback-b", "primary"]);
    expect(result.visitedRouteIds).toEqual(["fallback-a"]);
    expect(submissions).toEqual(["fallback-a"]);
    expect(result.declaredTransactionClass).toBe("PROGRAM_X");
    expect(result.intelligenceDecisions[0]).toMatchObject({ routeId: "primary", disposition: "AVOID", source: "SNAPSHOT", snapshotVersion: 2 });
    expect(result.events.find(event => event.eventType === "PROBE_INFORMED_ORDER_SELECTED")?.data).toMatchObject({
      transactionClass: "PROGRAM_X",
      selectedRouteIds: ["fallback-a", "fallback-b", "primary"],
    });
  });

  test("does not avoid MATCHED_CONTROL under asymmetric class intelligence", async () => {
    const client = await avoidedPrimaryClient();
    const result = await router({ intelligenceSource: client }).route(transaction, { transactionClass: "MATCHED_CONTROL" });
    expect(result.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(result.visitedRouteIds).toEqual(["primary"]);
    expect(result.intelligenceDecisions[0]).toMatchObject({ routeId: "primary", disposition: "LOCAL_PRIMARY_FALLBACK", source: "SNAPSHOT" });
  });

  test("fails open when a loaded snapshot expires before route selection", async () => {
    const client = await avoidedPrimaryClient();
    const staleNow = new Date("2026-08-14T00:01:00.000Z");
    const result = await router({ intelligenceSource: client, wallClock: () => staleNow }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(result.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(result.visitedRouteIds).toEqual(["primary"]);
    expect(result.intelligenceDecisions[0]).toMatchObject({
      routeId: "primary",
      disposition: "LOCAL_PRIMARY_FALLBACK",
      source: "FAIL_OPEN",
      reason: "snapshot became stale before routing decision",
    });
  });

  test("contains an unavailable or throwing intelligence source", async () => {
    const unavailable = await router().route(transaction, { transactionClass: "PROGRAM_X" });
    expect(unavailable.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(unavailable.intelligenceDecisions.every(value => value.source === "FAIL_OPEN")).toBe(true);

    const throwingSource: RouteIntelligenceDecisionSource = { decision: () => { throw new Error("bad adapter"); } };
    const throwing = await router({ intelligenceSource: throwingSource }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(throwing.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(throwing.intelligenceDecisions[0]?.reason).toBe("intelligence source threw");

    const invalidSource: RouteIntelligenceDecisionSource = {
      decision: () => ({ disposition: "AVOID", source: "UNSUPPORTED" }) as never,
    };
    const invalid = await router({ intelligenceSource: invalidSource }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(invalid.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(invalid.intelligenceDecisions[0]?.reason).toBe("intelligence source returned an invalid decision");

    const contradictorySource: RouteIntelligenceDecisionSource = {
      decision: () => ({ disposition: "AVOID", source: "FAIL_OPEN", reason: "contradictory" }),
    };
    const contradictory = await router({ intelligenceSource: contradictorySource }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(contradictory.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(contradictory.intelligenceDecisions[0]?.reason).toBe("intelligence source returned an invalid decision");
  });

  test("never expands the locally permitted maxRoutes window", async () => {
    const client = await avoidedPrimaryClient();
    const submissions: string[] = [];
    const result = await router({
      intelligenceSource: client,
      policy: { ...policy, maxRoutes: 2 },
      submitter: acknowledgingSubmitter(submissions),
    }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(result.configuredRouteIds).toEqual(["primary", "fallback-a"]);
    expect(result.selectedRouteIds).toEqual(["fallback-a", "primary"]);
    expect(result.selectedRouteIds).not.toContain("fallback-b");
    expect(submissions).toEqual(["fallback-a"]);
  });

  test("keeps local order when every eligible route is avoided", async () => {
    const allAvoid: RouteIntelligenceDecisionSource = {
      decision: () => ({ disposition: "AVOID", source: "DEVELOPER_OVERRIDE" }),
    };
    const result = await router({ intelligenceSource: allAvoid }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(result.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(result.visitedRouteIds).toEqual(["primary"]);
  });

  test("gives explicit developer override precedence over an unavailable feed", async () => {
    const client = new IntelligenceSnapshotClient({
      pollTimeoutMs: 10,
      fetchSnapshot: async () => { throw new Error("offline"); },
      developerOverride: routeId => routeId === "primary" ? "AVOID" : undefined,
    });
    await client.poll(routingNow);
    const result = await router({ intelligenceSource: client }).route(transaction, { transactionClass: "PROGRAM_X" });
    expect(result.selectedRouteIds).toEqual(["fallback-a", "fallback-b", "primary"]);
    expect(result.intelligenceDecisions[0]).toMatchObject({ routeId: "primary", disposition: "AVOID", source: "DEVELOPER_OVERRIDE" });
  });

  test("preserves legacy local routing unless a class is explicitly declared", async () => {
    const source: RouteIntelligenceDecisionSource = { decision: vi.fn(() => ({ disposition: "AVOID", source: "SNAPSHOT", snapshotVersion: 1 })) };
    const result = await router({ intelligenceSource: source }).route(transaction);
    expect(result.routingMode).toBe("LOCAL_PRIMARY_FALLBACK");
    expect(result.selectedRouteIds).toEqual(["primary", "fallback-a", "fallback-b"]);
    expect(result.intelligenceDecisions).toEqual([]);
    expect(source.decision).not.toHaveBeenCalled();
  });

  test("rejects undeclared generic transaction classes", async () => {
    await expect(router().route(transaction, { transactionClass: "SEMANTIC_GUESS" as never })).rejects.toThrow(/explicitly declared supported/);
  });
});

async function avoidedPrimaryClient(): Promise<IntelligenceSnapshotClient> {
  const snapshots = [snapshot(1), snapshot(2)];
  let index = 0;
  const client = new IntelligenceSnapshotClient({
    pollTimeoutMs: 50,
    fetchSnapshot: async () => snapshots[index++] ?? (() => { throw new Error("snapshot queue exhausted"); })(),
  });
  await client.poll(routingNow);
  await client.poll(routingNow);
  return client;
}

function snapshot(version: number) {
  return buildIntelligenceSnapshot({
    version,
    generatedAt,
    ttlMs: 60_000,
    summaries: [summary("ASYMMETRIC")],
  });
}

function summary(classification: IntelligenceClassification): IntelligenceSummaryInput {
  return {
    policyVersion: "ClassificationPolicyV0Experimental",
    inputHash: "a".repeat(64),
    observedAt: "2026-08-13T23:59:00.000Z",
    definition: {
      experimentId: "experiment-sprint-9",
      experimentVersion: "1",
      configurationHash: "b".repeat(64),
      windowId: "window-sprint-9",
      observerId: "observer-local",
    },
    cells: [
      { routeId: "primary", transactionClass: "MATCHED_CONTROL", completeCount: 30 },
      { routeId: "primary", transactionClass: "PROGRAM_X", completeCount: 30 },
    ],
    classifications: [{ routeId: "primary", classification, evidenceStrength: "LIMITED" }],
  };
}

function router(options: {
  readonly intelligenceSource?: RouteIntelligenceDecisionSource;
  readonly policy?: ReactiveRouterPolicy;
  readonly submitter?: RouteSubmitter;
  readonly wallClock?: () => Date;
} = {}): ReactiveRouter {
  return new ReactiveRouter({
    routes,
    policy: options.policy ?? policy,
    submitter: options.submitter ?? acknowledgingSubmitter(),
    observer: confirmingObserver(),
    intelligenceSource: options.intelligenceSource,
    wallClock: options.wallClock ?? (() => routingNow),
  });
}

function route(routeId: string): LogicalRoute {
  return {
    routeId,
    logicalEndpoint: `http://127.0.0.1/${routeId}`,
    transport: "http_json_rpc",
    observerRegion: "local",
    configurationProfile: "sprint-9-controlled-v1",
    submissionClientIdentity: `submit-${routeId}`,
  };
}

function acknowledgingSubmitter(submissions: string[] = []): RouteSubmitter {
  return {
    submit(routeValue) {
      submissions.push(routeValue.routeId);
      return Promise.resolve({ outcome: "RPC_ACKNOWLEDGED", returnedSignature: transaction.signature });
    },
  };
}

function confirmingObserver(): IndependentObserver {
  return {
    readers: [
      { readerId: "reader-1", clientIdentity: "reader-client-1" },
      { readerId: "reader-2", clientIdentity: "reader-client-2" },
      { readerId: "reader-3", clientIdentity: "reader-client-3" },
    ],
    observe: async () => ({ state: "CONFIRMED", supportingReaderIds: ["reader-1", "reader-2"] }),
  };
}
