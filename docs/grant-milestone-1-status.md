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
- short-lived Ed25519-signed observation assignments with issuer allowlisting, payload hashing, expiry enforcement, and raw-poll correlation;
- hardened Linux systemd templates and loopback Collector TLS-edge pattern;
- versioned observer topology registry contract;
- tests for delivery, replay avoidance, health, plaintext rejection, and identity mismatch.
- local end-to-end software test from reader evidence through signing, delivery, validation, and durable collection;
- hardened oneshot observation-job service feeding the long-running signing/delivery runtime.
- retained local readiness run against Agave 4.0.0 at runtime commit `450eb90576307b1975ed525c8365406c25749913`: a real System Program transaction reached `FINALIZED`, produced 280 raw polls, was signed and durably collected, and survived Collector replay;
- public secret-free anchor for that run at `fixtures/grant-m1/local-readiness-20260825.json`.
- local recovery drill proving queue preservation during Collector outage, delivery after Observer restart, Collector log reconstruction, and zero duplicate delivery records.
- Linux host preflight that fails closed on clock synchronization, observer identity/readiness, key ownership and permissions, active service, frozen commit and Node.js version, clean runtime tree, and free-disk threshold while emitting only sanitized evidence.
- secret-safe single-RPC-route preflight that validates a provider Devnet endpoint while persisting only its public origin and explicitly contributing no observer-independence or milestone-acceptance claim.
- live Alchemy Solana Devnet route preflight retained at `fixtures/grant-m1/alchemy-devnet-route-20260826.json`: `getHealth`, `getGenesisHash`, `getVersion`, and finalized `getSlot` passed without retaining the credential-bearing URL path.
- frozen three-provider infrastructure topology and USD 50/month proposed ceiling with repository-enforced `billing_authorized: false`; no cloud component is claimed as provisioned.
- secret-free operator-readiness gate for provider ownership, MFA, billing controls, budget alerts, Collector DNS, key custody, and explicit provisioning approval; the checked-in example remains deliberately blocked.

## Not yet implemented or validated

- three external observer deployments;
- three external identities and merged public allowlist;
- corroborated provider, instance, region, and ASN evidence;
- cross-host real Solana observation;
- external restart, delay, outage, malformed, unknown-observer, stale, disagreement, quorum-available, and quorum-unavailable evidence;
- hosted Collector and TLS endpoint;
- real-host recovery exercises and complete external hostile audit.

The current runtime MUST NOT be described as a completed independent observation layer. The software and deployment path are implemented, locally integrated, and rehearsed against a real local validator, so the status remains `IMPLEMENTED_NOT_VALIDATED`. It remains below `ACCEPTED` until three real external deployments, real remote reader calls, failure/recovery exercises, and independence evidence are retained.

The Alchemy preflight proves that one external logical Devnet RPC route is usable
from the operator environment. It is neither an observer host nor independence
evidence, and it does not reduce the three-provider deployment requirement.

Milestone 2 has not started.
