export const HOSTILE_PROXY_VERSION = "ControlledHostileProxy@0.1.0" as const;

export type ControlledTransactionClass = "MATCHED_CONTROL" | "PROGRAM_X";

export type ProxyMode =
  | { readonly type: "PASS_THROUGH"; readonly scheduleId: string }
  | { readonly type: "REJECT_CLASS"; readonly transactionClass: "PROGRAM_X"; readonly scheduleId: string }
  | { readonly type: "GENERAL_DEGRADATION"; readonly rejectPairNonceHexes: ReadonlySet<string>; readonly scheduleId: string };

export interface HostileProxyLimits {
  readonly maxRequestBytes: number;
  readonly maxResponseBytes: number;
  readonly maxConcurrentRequests: number;
  readonly maxAuditEvents: number;
  readonly upstreamTimeoutMs: number;
}

export interface ControlledHostileProxyConfig {
  readonly bindHost: "127.0.0.1" | "::1";
  readonly bindPort: number;
  readonly upstreamUrl: string;
  readonly allowedUpstreamUrls: readonly string[];
  readonly controlledProgramAddress: string;
  readonly mode: ProxyMode;
  readonly limits: HostileProxyLimits;
  readonly auditHook?: ProxyAuditHook;
}

export interface ControlledClassification {
  readonly classification: ControlledTransactionClass;
  readonly pairNonceHex: string;
}

export type TransactionClassification =
  | { readonly kind: "CONTROLLED"; readonly value: ControlledClassification }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

export interface ProxyAuditEvent {
  readonly proxyVersion: typeof HOSTILE_PROXY_VERSION;
  readonly eventId: string;
  readonly sequence: number;
  readonly receivedAt: string;
  readonly requestMethod: string;
  readonly decision: "PASS_THROUGH" | "REJECTED" | "RESOURCE_LIMIT" | "INVALID_REQUEST" | "UPSTREAM_ERROR";
  readonly modeType: ProxyMode["type"];
  readonly scheduleId: string;
  readonly classification: ControlledTransactionClass | "UNKNOWN";
  readonly pairNonceHash?: string;
  readonly reason: string;
}

export type ProxyAuditHook = (event: ProxyAuditEvent) => void;

export interface RunningControlledHostileProxy {
  readonly url: string;
  readonly auditEvents: readonly Readonly<ProxyAuditEvent>[];
  close(): Promise<void>;
}
