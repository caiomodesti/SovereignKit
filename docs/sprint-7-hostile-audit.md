# Sprint 7 hostile audit

## Verdict

No blocking defect remains for deterministic local snapshot generation and fail-open consumption. The feed is not approved as a hosted, authenticated, multi-observer production service.

## Findings and disposition

### H1 — Hysteresis defaults were not actual contract fields

**Severity: blocking, closed.** JSON Schema `default` does not populate missing data. Avoid/restore thresholds are now required, generated explicitly, and bounded.

### H2 — Evidence strength schema omitted `NONE`

**Severity: high, closed.** Analysis already emits `NONE`. The snapshot contract now includes it rather than rejecting legitimate unknown evidence.

### H3 — Per-route provenance was insufficient

**Severity: blocking, closed.** Global input hash alone could not identify experiment, observer, window, configuration, source summary, or source time. Every route/class entry now carries them.

### H4 — Source observation time was initially fabricated as generation time

**Severity: blocking, closed.** `observed_at` now must be supplied by the source and precede snapshot generation. The retained fixture derives it from raw signed results.

### H5 — Repeated versions could inflate hysteresis

**Severity: blocking, closed.** Identical versions are `UNCHANGED`; different content at one version is equivocation and fails open.

### H6 — Locale-sensitive sorting threatened reproduction

**Severity: medium, closed.** `localeCompare` was replaced with ordinal lexical comparison before the accepted fixture.

### H7 — Plain HTTP could expose nonlocal polling

**Severity: high, closed for client API.** Plain HTTP is loopback-only; non-loopback URLs require HTTPS. HTTPS still authenticates the transport endpoint, not the snapshot author independently.

### H8 — No snapshot signature or transparency log

**Severity: high, residual.** A compromised HTTPS origin can publish valid-schema false intelligence. Provenance fields are assertions, not cryptographic proofs of analysis lineage.

### H9 — Hysteresis state is process-local

**Severity: medium, residual.** Restart returns to local policy and loses counters. This is safe fail-open behavior but delays avoidance/restoration after restart.

### H10 — No independent-observer aggregation policy

**Severity: high, residual.** The generator rejects duplicate route/class sources. It does not claim that one observer/window represents a network-wide route condition.

### H11 — Feed availability and scheduling are external

**Severity: medium, residual.** The SDK executes bounded polls when called. It does not schedule, persist, back off, jitter, cache to disk, or expose operational alerts.

### H12 — Classification remains experimental and uncalibrated

**Severity: high, residual.** The retained snapshot uses controlled `LIMITED` evidence. TTL and hysteresis do not convert that evidence into calibrated production confidence.

### H13 — Disposition is intentionally not wired into routing

**Severity: not a defect, scope boundary.** Automatic route mutation would begin Sprint 9 prematurely. The current ReactiveRouter still uses local configured primary/fallback only.

## Assumptions

1. The source AnalysisSummary and supplied observation time are authentic.
2. Client wall time is sufficiently correct for TTL decisions.
3. Snapshot version ownership is single-author and monotonic.
4. Two avoid and three restore versions are safety mechanics, not statistically calibrated thresholds.
5. The developer override is trusted application code.

## Blockers

None for Sprint 7 local acceptance. Hosted production use remains blocked on origin authentication/signing strategy, version authority, multi-observer aggregation, persistent state, scheduling/backoff/telemetry, and organic calibration.
