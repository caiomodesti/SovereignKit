# ADR-010: Versioned polling intelligence feed

- Status: Accepted
- Date: 2026-08-10

## Decision

The initial Observatory intelligence feed is a polled snapshot with `version`, `generated_at`, `expires_at`, and route intelligence. Proactive routing includes TTL validation, hysteresis, developer override, and provenance.

The SDK fails open: stale, unavailable, invalid, or unsupported intelligence returns routing to local primary/fallback policy.

## Consequences

Observatory outages do not become transaction outages. Intelligence takes effect less quickly than push delivery and requires careful stale-state telemetry.

## Sprint 7 concrete policy

- Snapshot versions are positive and monotonically increasing per feed. Repeating identical content at the same version is not a new hysteresis vote; different content at the same version is equivocation and fails open.
- `generated_at` is feed generation time. Each entry's `observed_at` is explicit source-evidence time and must not be replaced by generation time.
- A snapshot is fresh only while `generated_at <= now < expires_at`.
- Default hysteresis is two distinct avoid snapshots and three distinct healthy restore snapshots. Thresholds are explicit required fields, not schema defaults.
- `ASYMMETRIC` avoids only `PROGRAM_X`; `DEGRADED` signals avoidance for both declared classes; `INSUFFICIENT_DATA` and `UNKNOWN` return to local policy.
- Unavailable, timed-out, malformed, stale, future-dated, rolled-back, equivocated, unsupported, or missing intelligence yields `LOCAL_PRIMARY_FALLBACK`.
- A developer override may explicitly select `AVOID` or `LOCAL_PRIMARY_FALLBACK`; a throwing override fails open.
- Plain HTTP is permitted only for loopback development. Non-loopback polling requires HTTPS.
- Sprint 7 exposes a disposition but does not reorder or remove ReactiveRouter routes. Probe-informed routing remains Sprint 9.
