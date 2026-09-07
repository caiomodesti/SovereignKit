# Observatory intelligence feed v0.1

## Scope

Sprint 7 generates and consumes versioned polling snapshots. It proves schema, provenance, TTL, rollback/equivocation defense, hysteresis, bounded HTTP polling, developer override, and fail-open behavior. It does not host a public feed, schedule background polling, persist client state across process restarts, aggregate independent observers, or alter the ReactiveRouter.

## Snapshot contract

Every snapshot carries:

- schema and monotonic snapshot versions;
- `generated_at` and `expires_at`;
- each entry's independent source-evidence time in `observed_at`;
- experimental classification policy and generator versions;
- a hash over canonically ordered source summaries;
- route/class intelligence with experiment, observer, window, configuration, source-input hash, sample count, source `observed_at`, evidence strength, and explicit hysteresis thresholds.

The generator sorts with locale-independent lexical comparison. A controlled `ASYMMETRIC` route produces `HEALTHY` control intelligence and `ASYMMETRIC` `PROGRAM_X` intelligence. A `DEGRADED` route applies to both classes.

The v0.1 generator permits only one source summary per route/class in a snapshot. Cross-observer aggregation has no approved policy yet and therefore fails as a duplicate instead of silently pooling evidence.

## Client state machine

For each route/class, the client tracks consecutive avoid and restore versions:

```text
local policy -- 2 avoid versions --> avoid
avoid        -- 3 healthy versions --> local policy
```

The thresholds are carried by every entry and bounded to 1–100. The client also
enforces `sourceMaxAgeMs` (five minutes by default) against every `observed_at`
both when polling and when routing. A newly published snapshot therefore cannot
make old source evidence fresh again. Applications may configure a shorter
positive bound for their risk profile.

Re-polling the same identical version restores feed availability after a transient transport failure but never increments a counter. Same-version different content, rollback, stale publication, stale source evidence, future time, invalid schema, timeout, HTTP error, oversized payload, unknown route/class absence, or neutral evidence returns the disposition to local primary/fallback.

Fail-open affects the current disposition; prior counters remain in process memory so an identical still-fresh version can recover without fabricating an extra vote. Client restart loses those counters and starts from local policy.

## HTTP boundary

`createHttpSnapshotFetcher` performs bounded `GET` polling, requires JSON content, disables caching/redirects, streams with a 512 KiB default cap, and uses the client's abort timeout. Plain HTTP is restricted to loopback; other hosts require HTTPS. The HTTP adapter requires a non-empty publisher allowlist and accepts only an Ed25519-signed envelope whose canonical snapshot hash, publisher identity, key identity, signature, and key-validity interval all verify. Direct custom fetch functions remain an explicit application trust boundary and must not be described as authenticated transport.

## Routing boundary

Sprint 9 consumes the disposition through the bounded contract in
[probe-informed routing](probe-informed-routing.md). The client now exposes a
decision source and repeats TTL/future-time validation at routing time. The
router applies intelligence only for an explicitly declared MVP class and can
reorder, but never remove or add, locally eligible routes.
