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
- Linux host preflight v0.2 that fails closed on clock synchronization,
  observer identity/readiness, key ownership and exact mode `0600`, active and
  enabled service, loopback-only health, frozen manifest/source commit and
  Node.js version, systemd-unit integrity, and free-disk threshold while
  emitting only sanitized evidence.
- secret-safe single-RPC-route preflight that validates a provider Devnet endpoint while persisting only its public origin and explicitly contributing no observer-independence or milestone-acceptance claim.
- live Alchemy Solana Devnet route preflight retained at `fixtures/grant-m1/alchemy-devnet-route-20260826.json`: `getHealth`, `getGenesisHash`, `getVersion`, and finalized `getSlot` passed without retaining the credential-bearing URL path.
- frozen three-provider infrastructure topology and USD 50/month proposed ceiling with repository-enforced `billing_authorized: false`; the separately approved Oracle E4 Collector canary is the only provisioned cloud component.
- secret-free operator-readiness gate for provider ownership, MFA, billing controls, budget alerts, Collector DNS, key custody, and explicit provisioning approval; the checked-in example remains deliberately blocked.
- zero-cost-first funding policy that treats RPC credits separately from observer compute and keeps the USD 50/month topology as an unactivated paid fallback while free-tier eligibility is checked.
- fail-closed 24-hour host canary with append-only fsynced readiness samples, explicit coverage/readiness thresholds, identity-mismatch rejection, and a hardened systemd unit; no observer host has run it yet.
- machine-readable zero-cost candidate topology covering AWS, Google Cloud, and Oracle Cloud, with official-offer references, resource ceilings, explicit risks, unverified-account markers, zero authorized spend, and fail-closed admission tests.
- portable Observer deployment package with production-only local workspace
  packages, lockfile-pinned Solana dependencies, versioned file-level SHA-256
  manifest, and no requirement for a mutable Git checkout on the host.
- first external Collector canary provisioned on Oracle in `sa-saopaulo-1` after
  the preferred A1 shape failed with a concrete AD-1 capacity error. The active
  E2 micro canary is deliberately not admitted and has no public ingestion
  path; see `docs/grant-m1-live-infrastructure-log.md`.
- replacement Oracle E4 Collector canary provisioned with a verified 12.5%
  burstable baseline and 4 GiB memory. Its loopback Collector is active and
  passed service restart, frozen-runtime preflight, and durable replay recovery
  on the correctly identified host. Full-VM recovery was retracted pending a
  post-soak rerun.
- Collector-specific fail-closed preflight now verifies the frozen runtime
  manifest file-by-file, source commit, Node version, systemd unit, clock,
  service state, loopback-only bind, protected evidence log, health, and disk.
- Collector-specific 24-hour soak now fsyncs every sample, rejects inadequate
  coverage/readiness or gaps, and fails if the durable stored count regresses.
- the Oracle E4 Collector now passes the frozen-commit host preflight and a
  real-host durable replay drill. A synthetic, signed, schema-valid test result
  survived service restart and duplicate replay with exactly one durable
  record; this is Collector evidence only and contributes no observer claim.
- the true E4 24-hour soak completed with 1,441/1,441 ready samples, 100%
  coverage, zero storage regressions, and preserved raw evidence hash. A
  regression-tested evaluator correction resolved a one-second false rejection
  without changing the immutable JSONL.
- controlled full-VM reboot recovery and the post-reboot versioned preflight
  passed on the corrected E4 host. That admitted the private host; the following
  DNS/TLS gate admitted its narrow public edge. Every observer, Milestone 1
  acceptance, and Milestone 2 remain pending.
- fail-closed Collector DNS/TLS preflight and hardened Caddy environment
  templates are implemented and live-validated. The controlled hostname maps
  to the admitted E4 target, Caddy serves publicly trusted TLS 1.3, plaintext
  HTTP redirects, `/health` remains private, wrong methods fail closed, and an
  invalid signed-result payload reaches schema validation with HTTP 422. The
  sanitized anchor is `fixtures/grant-m1/oracle-e4-tls-20260831.json`.
- AWS Observer A now passes its immutable-runtime host preflight, signed
  transport and recovery drills, and a complete 86,400-second host soak. The
  independent verifier accepted 1,440 samples with 99.93% coverage, 100%
  readiness, zero identity mismatches, and a maximum gap of 60,071 ms. A fresh
  post-soak preflight reverified all 180 manifest files, key ownership/mode,
  service state, clock, disk, systemd unit, and loopback-only binding. The
  sanitized anchor is `fixtures/grant-m1/observer-aws-a-soak-20260901.json`.

## Not yet implemented or validated

- two remaining external observer deployments plus real observation work on
  the host-qualified Observer A;
- two remaining external identities and the final three-observer merged public
  allowlist;
- corroborated provider, instance, region, and ASN evidence;
- cross-host real Solana observation;
- external restart, delay, outage, malformed, unknown-observer, stale, disagreement, quorum-available, and quorum-unavailable evidence;
- real-host recovery exercises and complete external hostile audit.

The current runtime MUST NOT be described as a completed independent observation layer. The software and deployment path are implemented, locally integrated, and rehearsed against a real local validator, so the status remains `IMPLEMENTED_NOT_VALIDATED`. It remains below `ACCEPTED` until three real external deployments, real remote reader calls, failure/recovery exercises, and independence evidence are retained.

The Alchemy preflight proves that one external logical Devnet RPC route is usable
from the operator environment. It is neither an observer host nor independence
evidence, and it does not reduce the three-provider deployment requirement.

The Oracle E2 micro resource proves only that a candidate VM was provisioned.
It failed host fitness and recovery: the guest exposed only 498 MiB physical
memory, entered heavy swap under installation pressure, and did not restore SSH
within the bounded check after a Console reboot. The canary is rejected and
cannot replace the original A1 target. A1 remains blocked by observed capacity;
the E4 replacement is now the active bounded Collector canary.

The Oracle E4 host is admitted as the hosted public-TLS Collector component.
Its basic guest checks, service restart,
frozen-runtime preflight, durable replay, complete 24-hour soak, controlled
full-VM recovery, post-reboot preflight, controlled DNS, and narrow TLS edge
passed on the corrected host. The replay used an explicitly synthetic signed
fixture and the TLS preflight used an invalid payload only; neither proves
Solana observation or successful signed remote delivery. No independent
observer, complete Milestone 1, or Milestone 2 claim is made.
Observer queue recovery is a separate observer-host gate because the Collector
has no delivery queue.

AWS Observer A is `OBSERVER_HOST_QUALIFIED`, not a completed Milestone 1
observer evidence entry. Its two retained transport fixtures prove signing,
delivery, duplicate handling, outage retention, and recovery only; they are
explicitly not ledger measurements. Real assignment-correlated Solana reader
polls, the external failure matrix, provider/ASN corroboration, Observers B/C,
and three-provider acceptance remain pending.

Milestone 2 has not started.
