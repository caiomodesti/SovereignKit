import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { IntelligenceRoutingDecision, IntelligenceTransactionClass } from "./intelligence.js";

import {
  ROUTER_VERSION,
  type IndependentObservation,
  type IndependentObserver,
  type IntelligenceRouteDecisionTrace,
  type LogicalRoute,
  type ReactiveRouterPolicy,
  type ReactiveRoutingResult,
  type RouteAttemptTrace,
  type RouterEvent,
  type RouterEventType,
  type RouterTelemetryHook,
  type RouteSubmitter,
  type SignedTransactionRequest,
} from "./types.js";

export interface ReactiveRouterOptions {
  readonly routes: readonly LogicalRoute[];
  readonly policy: ReactiveRouterPolicy;
  readonly submitter: RouteSubmitter;
  readonly observer: IndependentObserver;
  readonly intelligenceSource?: RouteIntelligenceDecisionSource;
  readonly telemetryHook?: RouterTelemetryHook;
  readonly wallClock?: () => Date;
  readonly monotonicClockMs?: () => number;
}

export interface RouteIntelligenceDecisionSource {
  decision(routeId: string, transactionClass: IntelligenceTransactionClass, now?: Date): IntelligenceRoutingDecision;
}

export interface ProbeInformedRoutingContext {
  readonly transactionClass: IntelligenceTransactionClass;
}

export class ReactiveRouter {
  readonly #routes: readonly LogicalRoute[];
  readonly #policy: ReactiveRouterPolicy;
  readonly #submitter: RouteSubmitter;
  readonly #observer: IndependentObserver;
  readonly #intelligenceSource: RouteIntelligenceDecisionSource | undefined;
  readonly #telemetryHook: RouterTelemetryHook | undefined;
  readonly #wallClock: () => Date;
  readonly #monotonicClockMs: () => number;

  constructor(options: ReactiveRouterOptions) {
    validateOptions(options);
    this.#routes = [...options.routes];
    this.#policy = options.policy;
    this.#submitter = options.submitter;
    this.#observer = options.observer;
    this.#intelligenceSource = options.intelligenceSource;
    this.#telemetryHook = options.telemetryHook;
    this.#wallClock = options.wallClock ?? (() => new Date());
    this.#monotonicClockMs = options.monotonicClockMs ?? (() => performance.now());
  }

  async route(transaction: SignedTransactionRequest, context?: ProbeInformedRoutingContext): Promise<ReactiveRoutingResult> {
    validateTransaction(transaction);
    validateRoutingContext(context);
    const startedAt = this.#monotonicClockMs();
    const events: RouterEvent[] = [];
    const hookErrors: string[] = [];
    const attempts: RouteAttemptTrace[] = [];
    const visited = new Set<string>();
    const configuredRoutes = this.#routes.slice(0, this.#policy.maxRoutes);
    const selection = selectRoutes(configuredRoutes, context, this.#intelligenceSource, this.#wallClock());
    const selectedRoutes = selection.routes;
    let sequence = 0;

    const emit = async (
      eventType: RouterEventType,
      data: Readonly<Record<string, unknown>> = {},
      routeId?: string,
      attemptNumber?: number,
    ): Promise<void> => {
      const event: RouterEvent = {
        routerVersion: ROUTER_VERSION,
        eventId: randomUUID(),
        sequence: sequence++,
        eventType,
        transactionId: transaction.transactionId,
        signature: transaction.signature,
        wallClock: this.#wallClock().toISOString(),
        monotonicOffsetMs: this.#monotonicClockMs() - startedAt,
        ...(routeId === undefined ? {} : { routeId }),
        ...(attemptNumber === undefined ? {} : { attemptNumber }),
        data,
      };
      events.push(event);
      if (this.#telemetryHook !== undefined) {
        const hookTimeout = Math.min(
          this.#policy.telemetryHookTimeoutMs,
          remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs),
        );
        const hookResult = await runBounded(async () => this.#telemetryHook!(event), hookTimeout);
        if (hookResult.status === "FAILED") hookErrors.push(errorClass(hookResult.error));
        if (hookResult.status === "TIMED_OUT") hookErrors.push("TimeoutError");
      }
    };

    const finish = (
      finalState: ReactiveRoutingResult["finalState"],
      confirmationObservedAfterRouteId?: string,
    ): ReactiveRoutingResult => ({
      routerVersion: ROUTER_VERSION,
      routingMode: selection.routingMode,
      configuredRouteIds: configuredRoutes.map(route => route.routeId),
      selectedRouteIds: selectedRoutes.map(route => route.routeId),
      intelligenceDecisions: selection.decisions,
      ...(context === undefined ? {} : { declaredTransactionClass: context.transactionClass }),
      finalState,
      ...(confirmationObservedAfterRouteId === undefined ? {} : { confirmationObservedAfterRouteId }),
      attempts,
      visitedRouteIds: [...visited],
      events,
      telemetryHookErrors: hookErrors,
    });

    await emit("ROUTING_STARTED", {
      maxRoutes: this.#policy.maxRoutes,
      overallDeadlineMs: this.#policy.overallDeadlineMs,
      routingMode: selection.routingMode,
    });
    if (context !== undefined) {
      await emit("PROBE_INFORMED_ORDER_SELECTED", {
        transactionClass: context.transactionClass,
        configuredRouteIds: configuredRoutes.map(route => route.routeId),
        selectedRouteIds: selectedRoutes.map(route => route.routeId),
        decisions: selection.decisions,
      });
    }

    for (let index = 0; index < selectedRoutes.length; index += 1) {
      const route = selectedRoutes[index]!;
      const attemptNumber = index + 1;
      if (remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs) <= 0) {
        await emit("ROUTING_DEADLINE_REACHED", {}, route.routeId, attemptNumber);
        return finish("OBSERVATION_INCONCLUSIVE");
      }
      if (visited.has(route.routeId)) throw new Error(`route ${route.routeId} would be revisited`);
      visited.add(route.routeId);
      await emit("ROUTE_ATTEMPT_STARTED", {}, route.routeId, attemptNumber);

      const submissionTimeout = Math.min(
        this.#policy.routeTimeoutMs,
        remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs),
      );
      const submission = await runBounded(
        signal => this.#submitter.submit(route, transaction, signal),
        submissionTimeout,
      );

      if (submission.status === "TIMED_OUT") {
        attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "TIMED_OUT" });
        await emit("ROUTE_ATTEMPT_TIMED_OUT", { timeoutMs: submissionTimeout }, route.routeId, attemptNumber);
      } else if (submission.status === "FAILED") {
        attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_REJECTED" });
        await emit("ROUTE_RPC_REJECTED", { errorCategory: errorClass(submission.error) }, route.routeId, attemptNumber);
      } else if (submission.value.outcome === "RPC_REJECTED") {
        attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_REJECTED" });
        await emit("ROUTE_RPC_REJECTED", {
          errorCategory: submission.value.errorCategory,
          ...(submission.value.errorCode === undefined ? {} : { errorCode: submission.value.errorCode }),
        }, route.routeId, attemptNumber);
      } else {
        if (submission.value.returnedSignature !== transaction.signature) {
          attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_REJECTED" });
          await emit("ROUTE_RPC_REJECTED", { errorCategory: "SIGNATURE_MISMATCH" }, route.routeId, attemptNumber);
        } else {
          await emit("ROUTE_RPC_ACKNOWLEDGED", { landing: false }, route.routeId, attemptNumber);
          await emit("INDEPENDENT_OBSERVATION_STARTED", { readerIds: this.#observer.readers.map(reader => reader.readerId) }, route.routeId, attemptNumber);
          const observationTimeout = Math.min(
            this.#policy.observationTimeoutMs,
            remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs),
          );
          const observation = await runBounded(
            signal => this.#observer.observe(transaction, signal),
            observationTimeout,
          );
          if (observation.status === "COMPLETED") {
            const quorumError = validateObservation(observation.value, this.#observer.readers.map(reader => reader.readerId), this.#policy.requiredObservationQuorum);
            if (quorumError !== undefined) {
              attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_ACKNOWLEDGED", observationState: "OBSERVATION_INCONCLUSIVE" });
              await emit("INDEPENDENT_OBSERVATION_RECORDED", { state: "OBSERVATION_INCONCLUSIVE", anomaly: quorumError }, route.routeId, attemptNumber);
            } else {
              attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_ACKNOWLEDGED", observationState: observation.value.state });
              await emit("INDEPENDENT_OBSERVATION_RECORDED", observation.value, route.routeId, attemptNumber);
              if (observation.value.state === "CONFIRMED" || observation.value.state === "FINALIZED") {
                await emit("ROUTING_CONFIRMED", { state: observation.value.state, rpcAcknowledgementWasLandingEvidence: false }, route.routeId, attemptNumber);
                return finish(observation.value.state, route.routeId);
              }
              if (observation.value.state === "OBSERVED_EXECUTION_FAILED" || observation.value.state === "EXPIRED") {
                await emit("ROUTING_TERMINAL_FAILURE", { state: observation.value.state }, route.routeId, attemptNumber);
                return finish(observation.value.state);
              }
            }
          } else {
            attempts.push({ attemptNumber, routeId: route.routeId, submissionOutcome: "RPC_ACKNOWLEDGED", observationState: "TIMED_OUT" });
            await emit("INDEPENDENT_OBSERVATION_TIMED_OUT", {
              timeoutMs: observationTimeout,
              reason: observation.status === "FAILED" ? errorClass(observation.error) : "TimeoutError",
            }, route.routeId, attemptNumber);
          }
        }
      }

      const next = selectedRoutes[index + 1];
      if (next !== undefined && remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs) > 0) {
        await emit("FALLBACK_SELECTED", { fromRouteId: route.routeId, toRouteId: next.routeId }, next.routeId, attemptNumber + 1);
      }
    }

    if (remainingMs(startedAt, this.#policy.overallDeadlineMs, this.#monotonicClockMs) <= 0) {
      await emit("ROUTING_DEADLINE_REACHED");
    } else {
      await emit("ROUTING_EXHAUSTED", { visitedRouteIds: [...visited] });
    }
    return finish("OBSERVATION_INCONCLUSIVE");
  }
}

function selectRoutes(
  routes: readonly LogicalRoute[],
  context: ProbeInformedRoutingContext | undefined,
  source: RouteIntelligenceDecisionSource | undefined,
  now: Date,
): {
  readonly routes: readonly LogicalRoute[];
  readonly routingMode: "LOCAL_PRIMARY_FALLBACK" | "PROBE_INFORMED";
  readonly decisions: readonly IntelligenceRouteDecisionTrace[];
} {
  if (context === undefined) return { routes, routingMode: "LOCAL_PRIMARY_FALLBACK", decisions: [] };
  const decisions = routes.map(route => {
    if (source === undefined) {
      return {
        routeId: route.routeId,
        disposition: "LOCAL_PRIMARY_FALLBACK",
        source: "FAIL_OPEN",
        reason: "intelligence source is not configured",
      } satisfies IntelligenceRouteDecisionTrace;
    }
    try {
      return normalizeIntelligenceDecision(route.routeId, source.decision(route.routeId, context.transactionClass, now));
    } catch {
      return {
        routeId: route.routeId,
        disposition: "LOCAL_PRIMARY_FALLBACK",
        source: "FAIL_OPEN",
        reason: "intelligence source threw",
      } satisfies IntelligenceRouteDecisionTrace;
    }
  });
  const dispositionByRoute = new Map(decisions.map(decision => [decision.routeId, decision.disposition]));
  const locallyPreferred = routes.filter(route => dispositionByRoute.get(route.routeId) !== "AVOID");
  const avoidedLastResort = routes.filter(route => dispositionByRoute.get(route.routeId) === "AVOID");
  return { routes: [...locallyPreferred, ...avoidedLastResort], routingMode: "PROBE_INFORMED", decisions };
}

function normalizeIntelligenceDecision(routeId: string, decision: IntelligenceRoutingDecision): IntelligenceRouteDecisionTrace {
  const invalidStructure = (decision.disposition !== "AVOID" && decision.disposition !== "LOCAL_PRIMARY_FALLBACK") ||
      (decision.source !== "SNAPSHOT" && decision.source !== "DEVELOPER_OVERRIDE" && decision.source !== "FAIL_OPEN") ||
      (decision.snapshotVersion !== undefined && (!Number.isSafeInteger(decision.snapshotVersion) || decision.snapshotVersion < 1)) ||
      (decision.reason !== undefined && typeof decision.reason !== "string");
  const invalidSemantics = (decision.source === "FAIL_OPEN" && decision.disposition !== "LOCAL_PRIMARY_FALLBACK") ||
    (decision.source === "SNAPSHOT" ? decision.snapshotVersion === undefined : decision.snapshotVersion !== undefined);
  if (invalidStructure || invalidSemantics) {
    return { routeId, disposition: "LOCAL_PRIMARY_FALLBACK", source: "FAIL_OPEN", reason: "intelligence source returned an invalid decision" };
  }
  return { routeId, ...decision };
}

type BoundedResult<T> =
  | { readonly status: "COMPLETED"; readonly value: T }
  | { readonly status: "FAILED"; readonly error: unknown }
  | { readonly status: "TIMED_OUT" };

async function runBounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<BoundedResult<T>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { status: "TIMED_OUT" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operationResult = Promise.resolve()
    .then(() => operation(controller.signal))
    .then(value => ({ status: "COMPLETED", value }) as const)
    .catch(error => ({ status: "FAILED", error }) as const);
  const timeoutResult = new Promise<{ readonly status: "TIMED_OUT" }>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ status: "TIMED_OUT" }); }, timeoutMs);
  });
  const result = await Promise.race([operationResult, timeoutResult]);
  if (timer !== undefined) clearTimeout(timer);
  return result;
}

function remainingMs(startedAt: number, deadlineMs: number, now: () => number): number {
  return Math.max(0, deadlineMs - (now() - startedAt));
}

function validateObservation(
  observation: IndependentObservation,
  configuredReaderIds: readonly string[],
  required: number,
): string | undefined {
  const distinct = new Set(observation.supportingReaderIds);
  if (distinct.size < required) return "insufficient distinct reader support";
  if ([...distinct].some(readerId => !configuredReaderIds.includes(readerId))) return "unknown reader support";
  return undefined;
}

function validateOptions(options: ReactiveRouterOptions): void {
  if (options.routes.length === 0) throw new Error("at least one route is required");
  if (new Set(options.routes.map(route => route.routeId)).size !== options.routes.length) throw new Error("route IDs must be unique");
  if (new Set(options.routes.map(route => route.submissionClientIdentity)).size !== options.routes.length) throw new Error("submission client identities must be unique");
  const readerIds = options.observer.readers.map(reader => reader.readerId);
  const readerClients = options.observer.readers.map(reader => reader.clientIdentity);
  if (new Set(readerIds).size !== readerIds.length || readerIds.length !== 3 || new Set(readerClients).size !== readerClients.length) {
    throw new Error("Sprint 3 independent observer requires exactly three distinct logical readers");
  }
  if (options.routes.some(route => readerClients.includes(route.submissionClientIdentity))) {
    throw new Error("observation readers cannot reuse a route submission client instance");
  }
  const { maxRoutes, routeTimeoutMs, observationTimeoutMs, overallDeadlineMs, telemetryHookTimeoutMs, requiredObservationQuorum } = options.policy;
  if (!Number.isSafeInteger(maxRoutes) || maxRoutes < 1 || maxRoutes > options.routes.length) throw new Error("maxRoutes must be within configured routes");
  if (![routeTimeoutMs, observationTimeoutMs, overallDeadlineMs, telemetryHookTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("timeouts and deadline must be positive safe integers");
  }
  if (requiredObservationQuorum !== 2) throw new Error("Sprint 3 requires observation quorum 2");
}

function validateTransaction(transaction: SignedTransactionRequest): void {
  if (transaction.transactionId.length === 0 || transaction.signature.length === 0 || transaction.wireTransactionBase64.length === 0) {
    throw new Error("signed transaction identifiers and bytes are required");
  }
}

function validateRoutingContext(context: ProbeInformedRoutingContext | undefined): void {
  if (context !== undefined && context.transactionClass !== "MATCHED_CONTROL" && context.transactionClass !== "PROGRAM_X") {
    throw new Error("probe-informed routing requires an explicitly declared supported transaction class");
  }
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownThrownValue";
}
