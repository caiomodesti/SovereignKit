# Probe-informed routing v0.2

## Scope

Sprint 9 connects the versioned intelligence client to `ReactiveRouter`. It
changes only the attempt order inside the locally allowed route window. It does
not host the feed, poll in the background, classify generic transactions,
remove local fallbacks, or validate behavior on Devnet/Mainnet.

## Caller contract

The caller may pass a `ProbeInformedRoutingContext` containing exactly one
declared `transactionClass`: `MATCHED_CONTROL` or `PROGRAM_X`. Omitting the
context preserves the legacy configured primary/fallback order and does not
consult intelligence.

This is intentionally compatible with the MVP decision that transaction class
comes from `ProbeDefinition`/Probe Builder. The SDK performs no semantic
inspection of arbitrary real transactions.

## Ordering algorithm

```text
configured routes
      |
      v
slice by local maxRoutes
      |
      v
evaluate one decision per eligible route at routing-start time
      |
      v
stable local-policy routes ++ stable AVOID routes
      |
      v
existing bounded submission + independent observation loop
```

The algorithm never expands the eligible route set. An avoided route is moved,
not deleted. If every route is avoided, their local order is unchanged. The
existing no-revisit, timeout, overall deadline, acknowledgment, quorum, and
terminal-state semantics remain intact.

## Decision safety

`IntelligenceSnapshotClient.decision` returns the disposition and its source:

- `SNAPSHOT`, with snapshot version;
- `DEVELOPER_OVERRIDE`;
- `FAIL_OPEN`, with a bounded reason.

The client checks `generated_at <= routing_time < expires_at` again when the
router requests a decision. This closes the gap where a snapshot was fresh at
poll time but expired before a later transaction. Clock rollback, missing
route/class entries, unavailable feed, invalid adapters, and exceptions return
to local policy.

## Audit trace

Every result records configured route IDs, selected route IDs, routing mode,
declared class, and per-route intelligence decisions. The
`PROBE_INFORMED_ORDER_SELECTED` event records the same order selection before
the first submission attempt. `confirmationObservedAfterRouteId` remains a
temporal observation, not causal attribution.

## Controlled evidence

The retained Sprint 9 fixture regenerates the accepted asymmetric Sprint 5
summary into two fresh snapshot versions. It proves:

- fresh `PROGRAM_X`: route A moves behind B/C;
- fresh `MATCHED_CONTROL`: A/B/C local order remains;
- `maxRoutes=2`: only local A/B are eligible, reordered B/A;
- stale `PROGRAM_X`: A/B/C local order is restored;
- no declared class: legacy local routing remains.

All cases reach `CONFIRMED` through the existing logical 2/3 observer contract.
The submitter in this fixture is deterministic; the underlying real local
submission/failover path remains the previously accepted Sprint 3/4 proof.
