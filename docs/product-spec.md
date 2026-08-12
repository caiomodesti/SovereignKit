# Product Specification v0.1

## Thesis

> A network is only censorship-resistant if users can reliably reach it.

SovereignKit is transaction accessibility infrastructure. It measures observable differences between logical submission routes and matched transaction classes, then makes that evidence available to operators and, later, a resilient routing SDK.

## Products

### Sovereign Observatory

Runs controlled probes, receives signed measurements, forms explicit windows, compares classes and peer routes, emits route intelligence, and generates reproducible experiment summaries.

### Sovereign SDK

Registers routes, applies local primary/fallback policy, performs bounded reactive failover, and later polls versioned Observatory intelligence. The SDK fails open: stale or unavailable intelligence returns control to local policy.

## Users

- Researchers measuring transaction accessibility.
- Wallet and application engineers requiring submission resilience.
- Infrastructure operators diagnosing asymmetric route behavior.
- Ecosystem reviewers reproducing controlled experiments.

## v0.1 scope

- Local-validator controlled scientific environment.
- Project-owned matched test program.
- Controlled pass-through and selective-reject proxies.
- Declared transaction classes; no semantic classification of arbitrary user transactions.
- Three logical observation readers with a 2/3 quorum.
- Signed, idempotent observer results and collector allowlist.
- Four reproducible classifications: `HEALTHY`, `DEGRADED`, `ASYMMETRIC`, `INSUFFICIENT_DATA`.
- Reactive primary/fallback routing before the GO/KILL checkpoint.
- Markdown, JSON, and CSV experiment summaries after analysis exists.

Devnet is a later integration-validation environment and is not the source of the initial statistical proof.

## Non-goals

- Censorship attribution or intent detection.
- Validator- or leader-level attribution.
- Generic semantic classification of real user transactions.
- Economic decentralization of observers.
- Direct TPU submission, tokens, incentives, multi-chain support, or billing.
- Collection of raw user transactions or private signing material.

## Product invariants

1. Every public state derives from stored measurements and a versioned policy.
2. `RPC_ACKNOWLEDGED` is never displayed as landing.
3. No comparative experiment reuses an identical signed transaction across routes.
4. `ASYMMETRIC` requires sufficient samples, a healthy control, a healthy peer baseline, and a large test-class gap.
5. General degradation cannot automatically become `ASYMMETRIC`.
6. Observation cannot depend solely on the submission route.
7. Duplicate results do not change metrics.
8. The SDK has bounded attempts and cannot loop indefinitely.
9. Stale intelligence cannot disable local failover.
10. Controlled proxy results are never presented as evidence against a third-party provider.

## Success boundary

The v0.1 thesis survives only if matched probes, independent-enough observation, distinct classifications, measurement-derived analysis, and real router failover all pass the formal GO/KILL checkpoint.
