# ADR-019: Fail-open probe-informed route ordering

- Status: Accepted
- Date: 2026-08-14

## Decision

`ReactiveRouter@0.2.0` may consume an `IntelligenceSnapshotClient` decision only
when the caller explicitly declares `MATCHED_CONTROL` or `PROGRAM_X`. The SDK
does not infer a transaction class from arbitrary transaction bytes.

The local policy remains the authority:

1. form the eligible route set by applying local order and `maxRoutes`;
2. evaluate intelligence once at routing start with one wall-clock instant;
3. stable-partition eligible routes into local-policy routes followed by
   `AVOID` routes;
4. retain avoided routes as last-resort fallbacks and never add a route outside
   the eligible local set;
5. preserve local order when no class is declared, intelligence fails open, or
   every eligible route is avoided.

Snapshot TTL and future-dated checks are repeated at decision time. A stale,
unavailable, missing, invalid, throwing, or runtime-malformed source returns
`LOCAL_PRIMARY_FALLBACK`. Developer override retains priority but is subject to
runtime value validation and cannot expand the local route set.

The selected order and per-route decision source are retained in the routing
result and `PROBE_INFORMED_ORDER_SELECTED` telemetry event. Order is fixed for
that transaction after selection; it is not mutated mid-attempt.

## Consequences

- Observatory failure cannot remove local routing capacity.
- Fresh selective intelligence can move one declared class away from a route
  while leaving its matched control order unchanged.
- A route marked `AVOID` remains reachable if every locally preferred route
  fails.
- Intelligence close to expiry can affect one transaction selected while it
  was fresh; the router does not reorder an in-flight transaction.
- The route-order proof is controlled and does not establish production
  accuracy or authorize generic semantic classification.
