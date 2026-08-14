# Threat Model v0.1

## Assets

- Integrity and reproducibility of raw measurements.
- Observer private keys and allowlist.
- Experiment definitions and policy versions.
- Route credentials and endpoint secrets.
- Availability of collector, readers, proxy, and SDK.
- Privacy of opt-in SDK telemetry.
- Public credibility of classifications and reports.

## Trust boundaries

1. Observer process to logical submission route.
2. Observer to observation readers.
3. Observer signed payload to collector.
4. Collector storage to analysis and reporting.
5. Observatory snapshot to SDK.
6. Hostile proxy to allowlisted local upstream.

## Threats and required controls

| Threat | Impact | v0.1 control |
|---|---|---|
| Malicious observer fabricates results | False classifications | Per-observer Ed25519 signature, allowlist, raw claims, audit logs |
| Replay or duplicate result | Biased rates | Deterministic unit ID, sequence, result ID, idempotency key, uniqueness constraints |
| Observer key theft | Forged measurements | File permissions, no key logging, rotation/revocation procedure before deployment |
| Collector manipulation | Rewritten evidence | Append-only raw store design, content hashes, reproducible summaries; external anchoring deferred |
| Reader lies or fails | False lifecycle state | 2/3 quorum, preserve dissent; shared-validator limitation disclosed |
| Route returns acknowledgment but does not forward | False success | Acknowledgment separated from independent observation |
| Malformed RPC response | Crash or misclassification | Strict schema/size validation, typed normalization, retain raw category safely |
| Timeout/resource exhaustion | Observer outage | Per-request deadline, concurrency caps, payload caps, circuit breaker |
| Retry storm/failover loop | Route overload | `maxRetries=0` for experiments; bounded SDK `maxRoutes`, overall deadline, no route revisits |
| Clock manipulation/drift | Invalid latency/order | Local monotonic durations, separate wall times, collector receipt time, drift metadata |
| Proxy used against third parties | Abuse | Local/allowlisted upstream only, bind to loopback by default, no open forwarding |
| Proxy class evasion | Invalid experiment | Known program/shape only, builder-proxy fixtures, unknowns pass through and are excluded |
| Probe matching defect | False asymmetry | Pre-submit matching validation and exclusion, serialized artifact hashes |
| State/account contention | Confounding | Unique accounts where needed, identical layout, randomized order, record state conflicts |
| Intelligence feed tampering/staleness | Bad routing | Schema/version/TTL validation, transport security later, hysteresis, override, fail-open |
| Signature/account correlation | Privacy leakage | Probe/user separation, opt-in user telemetry, minimization and retention policy |

## Security status after Sprint 6

Local observer signing, central allowlisting, exhaustive ProbeResult schema validation, payload limits, single-writer durable ingestion, and restart replay reconstruction now exist. Production key custody, remote deployment, public ingestion, database authorization, TLS/client authentication, multi-writer coordination, external anchoring, and abuse operations do not. They must be implemented and tested before exposure.

## Residual critical risks

- A 2/3 logical quorum on one validator is not Byzantine or consensus independence.
- Central collector compromise can still suppress results.
- Signed false measurements remain false; signatures authenticate origin, not truth.
- The local proxy experiment cannot calibrate real-world false positives.
- Dependency and CI supply-chain controls cannot be audited before dependencies and CI exist.
