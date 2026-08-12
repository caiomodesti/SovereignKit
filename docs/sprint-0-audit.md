# Sprint 0 Hostile Audit

Date: 2026-08-10

Scope: specification only; no implementation evidence exists.

## Hostile findings

### H1 — The observation quorum is not genuinely independent

**Severity:** critical for real-world claims, accepted for the controlled experiment.

Three logical readers backed by one local validator share consensus state, process, storage, and likely failure modes. The quorum detects a broken reader interface; it does not provide three independent witnesses. Any public claim must say this directly. The GO checkpoint may pass for the controlled proof, but production research requires operational and preferably implementation/provider diversity.

### H2 — Thresholds are constructed around deterministic interventions

**Severity:** high.

The v0 thresholds should cleanly recognize injected 0%/100%-like behavior. They are not calibrated for organic failure rates, temporal dependence, multiple comparisons, or real-world false positives. The policy name and `evidence_strength` vocabulary correctly constrain this, but no real-world alerting should ship under this policy without calibration.

### H3 — A matched program can still leak class differences

**Severity:** high.

A discriminator branch may produce different compute, logs, memory access, instruction traces, or proxy parsing paths. Sprint 2 must measure serialized bytes and actual compute consumption and exclude out-of-tolerance units. “Same program” alone is not equivalence.

### H4 — `maxRetries=0` measures a deliberately constrained client

**Severity:** medium.

This is appropriate for isolating submission behavior but not representative of provider defaults or production applications. Reports must identify it as an experiment control. Later experiments should vary retry policy explicitly rather than silently.

### H5 — RPC rejection is not proof of non-forwarding

**Severity:** medium.

A proxy or RPC could forward and still return an error, or reject after partial handling. The lifecycle correctly continues independent observation after rejection. Implementations must not short-circuit polling on `RPC_REJECTED`.

### H6 — Expiration quorum can be fooled by correlated readers

**Severity:** high outside local control.

Two lagging or malicious readers can report block height inconsistently. The first experiment controls them; later deployment needs reader freshness metrics, diversity, and possibly a stronger decision rule.

### H7 — Signed observer data does not prove truth

**Severity:** high.

Signatures prove which key asserted a payload. They do not prove execution location, honest software, or untampered local clocks. Signed software attestations or cross-observer comparison are future research, not v0 facts.

### H8 — General degradation injection must avoid detector leakage

**Severity:** medium.

The deterministic rejection schedule must be committed before the run but unavailable to analysis. Otherwise reproducibility becomes a covert label channel. Evidence artifacts should hash the schedule separately and reveal it only during verification.

### H9 — Pooled peer baseline can hide peer heterogeneity

**Severity:** medium.

Pooling B and C may conceal one healthy and one degraded peer. Summaries must show each peer individually in addition to the pooled leave-one-route-out baseline. Future policies may require a minimum number of healthy peers.

### H10 — Inconclusive outcomes can distort rates

**Severity:** high.

Counting all inconclusive outcomes as failures is conservative and could turn reader failure into route degradation. The policy now forces `UNKNOWN` above a 10% inconclusive rate. Sprint 5 must still run sensitivity tables with complete-case and all-valid-unit denominators. Classification uses the declared denominator consistently and cannot switch opportunistically.

### H11 — Reproducible does not mean byte-identical everywhere

**Severity:** low.

Markdown timestamps, JSON key order, floating formatting, and CSV line endings can differ. Canonical JSON and normalized rendering must define which artifacts are byte-reproducible; summaries may otherwise be structurally equivalent with verified semantic hashes.

### H12 — No open-source license is selected

**Severity:** blocking before external release.

Calling the project open source without a license is legally incorrect. The repository must select a license before Sprint 1 or remove the open-source claim until one is chosen.

## Blockers

1. Open-source license selection before Sprint 1/publication.
2. Exact local-validator distribution/version and test-program toolchain must be pinned when implementation begins.
3. Observer key storage and rotation mechanism must be selected before deploying observers outside a developer machine.
4. The definition of “structurally equivalent summary” needs a canonicalization test in Sprint 5.

## Resolution after Sprint 0 approval

- License: resolved as Apache-2.0 in ADR-013.
- Toolchain policy: resolved and pinned in ADR-014; the full doctor still reports missing local Rust/Agave installations honestly.
- Observer key semantics: resolved in `observer-identities.md`; deployment secret-provider selection remains future operational work.
- Summary canonicalization: remains intentionally scheduled for Sprint 5 under ADR-015's raw-data principle.

## Assumptions

1. The first validator, proxies, test program, observers, and readers are all project controlled.
2. `@solana/kit` remains the implementation baseline unless an ADR supersedes it.
3. The local validator supports the current JSON-RPC methods used by the design.
4. Both test instructions can be made equivalent within the stated compute tolerance.
5. Reader polling load is small enough not to alter validator behavior materially.
6. The collector can preserve append-only raw inputs in the MVP.
7. Wall clocks are NTP-managed, while latency uses monotonic clocks.
8. One observer is sufficient for pipeline proof; geographic observer claims wait for later deployment.
9. Controlled thresholds are not reused for real-world provider claims.
10. The SDK's proactive mode remains optional and secondary to local routing policy.

## Residual risks accepted for Sprint 0

- Correlated observation readers.
- Central collector and allowlist.
- Deterministic synthetic interventions.
- No calibrated false-positive/negative rate.
- No implementation, performance, security, or dependency evidence yet.
- No proof that local methodology generalizes to Devnet/Mainnet.
- Potential probe detectability and different treatment from user traffic.
- Potential fee/account-state confounding despite matching controls.

## Audit conclusion

The specification is internally viable for a controlled proof if its claim remains narrow. It is not yet evidence that transaction-class asymmetry can be measured reliably on public infrastructure. The most dangerous future failure would be promoting the controlled policy or logical quorum as real-world causal confidence.
