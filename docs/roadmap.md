# Roadmap

Each sprint stops after its acceptance audit. Starting the next sprint requires explicit authorization.

## Sprint 0 — Research and specification

Product boundary, architecture, measurement method, lifecycle, schemas, threat model, epistemic limits, controlled experiment, ADRs, and GO/KILL contract. No production implementation.

## Sprint 1 — Telemetry core

Build transaction creation/submission timelines and ObservationQuorum. Acceptance requires separation of acknowledgment, observed execution, confirmation, finalization, expiration, and inconclusive outcomes.

## Sprint 2 — Probe engine

Implement declarations, matched builders, structural validation, randomized execution, signed ProbeResults, and idempotent ingestion fixtures.

## Sprint 3 — Reactive router

Implement bounded local primary/fallback, timeouts, no route revisit, telemetry hooks, and confirmed failover.

## Sprint 4 — Controlled hostile proxy

Implement safe pass-through, selective reject, and deterministic general degradation against allowlisted local infrastructure.

## Sprint 5 — Asymmetry engine and experiment summaries

Implement count-bounded windows, peer baselines, `ClassificationPolicyV0Experimental`, and reproducible Markdown/JSON/CSV summaries. Prove all four required scenarios.

## Formal GO/KILL checkpoint

Execute [the checkpoint](go-kill-checkpoint.md). A GO is required for subsequent product expansion.

## Sprint 6 — Observer and collector hardening

Standalone observers, allowlisted signature verification, replay defense, schema validation, and operational separation. Target geographically separated observers only after the local evidence pipeline is sound.

## Sprint 7 — Observatory intelligence feed

Versioned polling snapshots with TTL, hysteresis inputs, route intelligence provenance, developer override, and SDK fail-open behavior.

## Sprint 8 — Dashboard

Build views from real stored and derived data only: routes, observers, classes, incidents, failovers, and methodology.

## Sprint 9 — Probe-informed routing

Consume fresh intelligence without weakening local primary/fallback safety.

## Sprint 10 — Devnet integration validation

Validate current Solana APIs and operational behavior. Do not treat Devnet as the controlled statistical proof or Mainnet performance proxy.

## Sprint 11 — Public experimental report

Publish methodology, dataset, caveats, and results with careful route identity policy. Controlled findings remain clearly labeled.

## Sprint 12 — Security, quality, and demo hardening

Complete infrastructure, dependency, secrets, abuse, load, retry, privacy, and reproducibility audits.
