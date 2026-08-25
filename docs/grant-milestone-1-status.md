# Grant Milestone 1 status

Status: `IMPLEMENTED_NOT_VALIDATED`
Milestone: Independent Observation Layer
Started: 2026-08-24

## Implemented in the active branch

- official grant activation and project master plan;
- long-running observer signing/delivery runtime;
- dedicated Ed25519 identity generation with no-overwrite behavior;
- append-only, fsync-backed observer delivery receipts;
- HTTPS requirement for remote Collector delivery;
- loopback-only observer health and readiness endpoints;
- structured runtime heartbeats;
- local observation worker that polls exactly three readers, preserves raw observations, and derives quorum terminal state before signing;
- hardened Linux systemd templates and loopback Collector TLS-edge pattern;
- versioned observer topology registry contract;
- tests for delivery, replay avoidance, health, plaintext rejection, and identity mismatch.
- local end-to-end software test from reader evidence through signing, delivery, validation, and durable collection;
- hardened oneshot observation-job service feeding the long-running signing/delivery runtime.
- retained local readiness run against Agave 4.0.0 at runtime commit `450eb90576307b1975ed525c8365406c25749913`: a real System Program transaction reached `FINALIZED`, produced 280 raw polls, was signed and durably collected, and survived Collector replay;
- public secret-free anchor for that run at `fixtures/grant-m1/local-readiness-20260825.json`.

## Not yet implemented or validated

- three external observer deployments;
- three external identities and merged public allowlist;
- corroborated provider, instance, region, and ASN evidence;
- cross-host real Solana observation;
- external restart, delay, outage, malformed, unknown-observer, stale, disagreement, quorum-available, and quorum-unavailable evidence;
- hosted Collector and TLS endpoint;
- complete recovery exercise and hostile audit.

The current runtime MUST NOT be described as a completed independent observation layer. The software and deployment path are implemented, locally integrated, and rehearsed against a real local validator, so the status remains `IMPLEMENTED_NOT_VALIDATED`. It remains below `ACCEPTED` until three real external deployments, real remote reader calls, failure/recovery exercises, and independence evidence are retained.

Milestone 2 has not started.
