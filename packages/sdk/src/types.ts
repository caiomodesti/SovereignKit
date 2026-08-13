export const ROUTER_VERSION = "ReactiveRouter@0.1.0" as const;

export interface LogicalRoute {
  readonly routeId: string;
  readonly logicalEndpoint: string;
  readonly transport: "http_json_rpc" | "https_json_rpc";
  readonly observerRegion: string;
  readonly configurationProfile: string;
  readonly submissionClientIdentity: string;
  readonly providerLabel?: string;
}

export interface SignedTransactionRequest {
  readonly transactionId: string;
  readonly signature: string;
  readonly wireTransactionBase64: string;
}

export interface RouteSubmissionAcknowledged {
  readonly outcome: "RPC_ACKNOWLEDGED";
  readonly returnedSignature: string;
}

export interface RouteSubmissionRejected {
  readonly outcome: "RPC_REJECTED";
  readonly errorCategory: "PRE_FLIGHT" | "RPC" | "TRANSPORT" | "TIMEOUT" | "UNKNOWN";
  readonly errorCode?: number | string;
}

export type RouteSubmissionResult = RouteSubmissionAcknowledged | RouteSubmissionRejected;

export interface RouteSubmitter {
  submit(
    route: LogicalRoute,
    transaction: SignedTransactionRequest,
    abortSignal: AbortSignal,
  ): Promise<RouteSubmissionResult>;
}

export type IndependentObservation =
  | { readonly state: "CONFIRMED" | "FINALIZED"; readonly supportingReaderIds: readonly string[] }
  | { readonly state: "OBSERVED_EXECUTION_FAILED"; readonly supportingReaderIds: readonly string[] }
  | { readonly state: "EXPIRED"; readonly supportingReaderIds: readonly string[] }
  | { readonly state: "OBSERVATION_INCONCLUSIVE"; readonly supportingReaderIds: readonly string[] };

export interface IndependentObserver {
  readonly readers: readonly {
    readonly readerId: string;
    readonly clientIdentity: string;
  }[];
  observe(transaction: SignedTransactionRequest, abortSignal: AbortSignal): Promise<IndependentObservation>;
}

export interface ReactiveRouterPolicy {
  readonly maxRoutes: number;
  readonly routeTimeoutMs: number;
  readonly observationTimeoutMs: number;
  readonly overallDeadlineMs: number;
  readonly telemetryHookTimeoutMs: number;
  readonly requiredObservationQuorum: 2;
}

export type RouterEventType =
  | "ROUTING_STARTED"
  | "ROUTE_ATTEMPT_STARTED"
  | "ROUTE_RPC_ACKNOWLEDGED"
  | "ROUTE_RPC_REJECTED"
  | "ROUTE_ATTEMPT_TIMED_OUT"
  | "INDEPENDENT_OBSERVATION_STARTED"
  | "INDEPENDENT_OBSERVATION_RECORDED"
  | "INDEPENDENT_OBSERVATION_TIMED_OUT"
  | "FALLBACK_SELECTED"
  | "ROUTING_CONFIRMED"
  | "ROUTING_TERMINAL_FAILURE"
  | "ROUTING_EXHAUSTED"
  | "ROUTING_DEADLINE_REACHED";

export interface RouterEvent {
  readonly routerVersion: typeof ROUTER_VERSION;
  readonly eventId: string;
  readonly sequence: number;
  readonly eventType: RouterEventType;
  readonly transactionId: string;
  readonly signature: string;
  readonly wallClock: string;
  readonly monotonicOffsetMs: number;
  readonly routeId?: string;
  readonly attemptNumber?: number;
  readonly data: Readonly<Record<string, unknown>>;
}

export type RouterTelemetryHook = (event: RouterEvent) => void | Promise<void>;

export interface RouteAttemptTrace {
  readonly attemptNumber: number;
  readonly routeId: string;
  readonly submissionOutcome: "RPC_ACKNOWLEDGED" | "RPC_REJECTED" | "TIMED_OUT";
  readonly observationState?: IndependentObservation["state"] | "TIMED_OUT";
}

export type RouterFinalState =
  | "CONFIRMED"
  | "FINALIZED"
  | "OBSERVED_EXECUTION_FAILED"
  | "EXPIRED"
  | "OBSERVATION_INCONCLUSIVE";

export interface ReactiveRoutingResult {
  readonly routerVersion: typeof ROUTER_VERSION;
  readonly finalState: RouterFinalState;
  readonly confirmationObservedAfterRouteId?: string;
  readonly attempts: readonly RouteAttemptTrace[];
  readonly visitedRouteIds: readonly string[];
  readonly events: readonly RouterEvent[];
  readonly telemetryHookErrors: readonly string[];
}
