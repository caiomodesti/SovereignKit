# ADR-010: Versioned polling intelligence feed

- Status: Accepted
- Date: 2026-08-10

## Decision

The initial Observatory intelligence feed is a polled snapshot with `version`, `generated_at`, `expires_at`, and route intelligence. Proactive routing includes TTL validation, hysteresis, developer override, and provenance.

The SDK fails open: stale, unavailable, invalid, or unsupported intelligence returns routing to local primary/fallback policy.

## Consequences

Observatory outages do not become transaction outages. Intelligence takes effect less quickly than push delivery and requires careful stale-state telemetry.
