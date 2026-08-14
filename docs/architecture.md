# Architecture v0.1

## System boundary

```text
ProbeDefinition
      |
      v
Probe Builder -> signed, unique transaction
      |
      v
Observer -> Logical Route -> local validator
      |                         |
      |                         v
      +-----------------> ObservationQuorum (3 readers, 2/3)
                                |
Observer signs ProbeResult      v
      +----------------------> Collector -> immutable measurements
                                              |
                                              v
                                     window aggregation
                                              |
                                              v
                              ClassificationPolicyV0Experimental
                                      |                 |
                                      v                 v
                              Experiment Summary   intelligence snapshot
                                                          |
                                                          v
                                       SDK polling + bounded route ordering
```

## Route model

A route is a logical submission perspective. It contains:

- `route_id`
- `logical_endpoint`
- `transport`
- `observer_region`
- `configuration_profile`
- optional `provider_label`

It does not assert that an endpoint maps to one machine, provider backend, network path, or geographic location. A material endpoint or configuration change creates a new route revision.

## Observer model

Each observer has an Ed25519 keypair and stable `observer_id`. The collector stores an allowlist mapping observer IDs to public keys. An observer signs the canonical serialization of each `ProbeResult`. Results include `result_id`, `idempotency_key`, schema version, sequence number, and timestamps.

This provides origin authentication and replay resistance within a centrally administered MVP. It is not a decentralized observer network.

## ObservationQuorum

The target is three logical readers and a 2/3 quorum. Readers must not use the route-under-test client instance. For the local experiment, all readers may still share the same validator; therefore they protect against a single reader/API failure but do not prove operational or consensus independence.

A quorum decision contains all individual reader claims. Agreement requires the same signature and compatible facts:

- execution presence and `err` outcome;
- confirmation status at or above the required level;
- observed slot when present;
- block height for expiration.

Conflicts, missing quorum, or expiration evidence that does not reach quorum become `OBSERVATION_INCONCLUSIVE`.

## Collector

The central MVP collector:

1. validates the complete versioned schema before type narrowing;
2. verifies observer allowlist membership and signature;
3. rejects conflicting `result_id`, `idempotency_key`, or definition-scoped observer sequence;
4. appends the signed result with Collector sequence/time and calls `fsync` before indexing it;
5. derives no frontend-only state;
6. records collector receipt time separately from observer time;
7. reconstructs replay indexes from the validated log on restart and fails closed on corruption.

Sprint 6 implements this only as a loopback, single-writer JSONL service. It is operational process separation on one host, not infrastructure independence or production public ingestion.

## Analysis boundary

Raw events are immutable facts. Lifecycle projections, window metrics, peer baselines, classifications, incidents, and intelligence snapshots are derived artifacts that reference:

- input result IDs;
- window definition;
- policy ID and version;
- generator version;
- generation timestamp.

## Intelligence feed

The Observatory exposes a polled, versioned snapshot containing `version`, `generated_at`, `expires_at`, and route intelligence. The SDK:

- rejects malformed or expired snapshots;
- applies hysteresis before avoiding or restoring a route;
- allows developer override;
- returns to local primary/fallback when unavailable or stale;
- never treats the feed as an authorization system.

When an MVP transaction class is explicitly declared, the router first applies
the local `maxRoutes` window and then moves `AVOID` routes behind locally
preferred routes. It never removes an avoided route or introduces a route that
local configuration excluded.

## Proposed implementation boundaries

Only create a package when it contains working code. The intended final boundaries are `core`, `telemetry`, `probes`, `analysis`, `sdk`, and `reporting`, plus observer, collector, and hostile-proxy services. Sprint 0 creates documentation and schemas only.

## Trust assumptions

- The local validator and test program are controlled and correctly instrumented.
- At least two logical readers report honestly for a quorum decision.
- Observer private keys remain secret.
- Collector code and stored raw measurements are not maliciously rewritten.
- Monotonic clocks behave correctly within each observer process.
- The proxy only handles allowlisted local upstreams.

Violations of these assumptions limit evidence; they do not justify stronger causal claims.
