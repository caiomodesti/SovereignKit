# Sprint 5 hostile methodological audit

## Verdict

No critical open finding remains for the narrow controlled claim. The audit
found one blocking defect—submission initiation was grouped but not seeded or
explicitly recorded. The harness was changed to use the Probe Engine's
HMAC-SHA-256 plan, record every execution ordinal and timestamp, and the full
600-unit experiment was rerun successfully as `20260812T164539Z`.

## Findings and disposition

### H1 — Initial program branch introduced class-dependent compute

**Severity:** blocking, closed. The first live binary measured 500 CU for
control and 502 CU for PROGRAM_X. Indexed marker selection replaced the
asymmetric branch. The accepted SBF measured 510/510 CU in all ten pairs.

### H2 — Submission order was not randomized

**Severity:** blocking, closed. The initial successful run used concurrent
groups in declaration order. It was rejected as final evidence. The accepted
run randomizes probe-index groups and route/class order with the declared seed,
stores `executionOrdinal`, and has zero pairing-window breaches.

### H3 — Local observer quorum is not infrastructure independence

**Severity:** high, residual. Three clients/readers query one validator. This
tests quorum logic and submission-route separation, but correlated validator,
host, clock, disk, and RPC failure remain. Every manifest and report retains
this limitation; no decentralized-network claim is permitted.

### H4 — Windows test-validator snapshot path is patched

**Severity:** medium, bounded. The unmodified interval crashes at slot 100 with
AppendVec `Access denied`, making real expiry impossible. ADR-017 uses Agave's
supported `SnapshotConfig::new_disabled()` for this local proof and pins the
resulting hash. Snapshot behavior is excluded from the claim and must be
revalidated on unmodified Devnet infrastructure later.

### H5 — Thresholds are uncalibrated

**Severity:** high, residual. n=30 yields `LIMITED` evidence, not probabilistic
confidence. The deterministic 0/20/100% regimes validate separation logic but
do not estimate organic false-positive rates, temporal dependence, provider
behavior, or public-network prevalence.

### H6 — Analyzer/process isolation is logical, not adversarial

**Severity:** medium, residual. The analysis API receives only definitions and
measurements and the independent fixture verifier has no proxy mode/schedule.
During the live run all components still share one OS process/host. A malicious
runner could fabricate measurements; observer signatures authenticate the
ephemeral key, not honest software or location.

### H7 — Pooled peers can be heterogeneous

**Severity:** medium, visible. In the asymmetric phase, B and C each see a 50%
leave-one-out peer baseline because the other pool includes degraded A. Their
own healthy classification does not require peers. The summary exposes every
peer route individually so pooling cannot conceal this fact.

### H8 — Rejected probes consume blockhash lifetime

**Severity:** medium, accepted. A controlled RPC rejection cannot become a
failure from ACK semantics. The harness waits near expiry, submits with margin,
confirms accepted siblings, then observes real blockhash expiry. This adds run
time but preserves lifecycle truth.

### H9 — Fixture keys are ephemeral

**Severity:** low for Sprint 5, residual operationally. A fresh observer key is
generated per run; only its public key is persisted and all 600 signatures
verify. This is evidence authenticity within one run, not durable observer
identity, rotation, HSM custody, or decentralized attestation.

## Assumptions

1. The recorded executable hashes identify the local SVM/validator artifacts
   more reliably than Agave's varying source suffix.
2. Loopback proxies faithfully implement the precommitted controlled fault.
3. The 5-second within-index bound is adequate for this deterministic host.
4. Successful `confirmed` execution is the declared accessibility outcome.
5. The project-owned log marker is an acceptable minimal observable operation.

## Blockers

None for the controlled Sprint 5 claim. Infrastructure-independent observation,
calibration on organic data, and unmodified Devnet validation remain blockers
for broader public/provider claims, not for this checkpoint.

