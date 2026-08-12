# Sprint 1 Hostile Audit

Date: 2026-08-11

## Scope

Telemetry Core source, test suite, append-only storage, deterministic projection, coordinator, Solana Kit adapters, toolchain, and documentation. No on-chain program exists in Sprint 1, so signer/PDA/account checks are not applicable.

## Findings fixed during the audit

### F1 — Hanging readers could block the entire coordinator

- Severity: High
- Fix: bounded every reader operation, introduced cooperative `AbortSignal`, and added a test where one reader never resolves while the other two finalize.

### F2 — JSONL input was trusted after `JSON.parse`

- Severity: Medium
- Fix: added runtime envelope/version/event/timestamp/sequence validation and fail-closed parsing.

### F3 — Conflicting duplicate observations could influence quorum

- Severity: High
- Fix: exact duplicates reduce once; conflicting observation IDs are excluded and emitted as anomalies.

### F4 — A mismatched returned RPC signature was silent

- Severity: Medium
- Fix: timeline derivation now emits an explicit anomaly while continuing observation of the known signed transaction signature.

## Open findings

### O1 — No live local-validator transaction was executed

- Severity: High evidence gap, not a unit-logic defect.
- Cause: this Windows host has no Rust, Agave/Solana CLI, WSL, or Docker.
- Required fix: install the pinned environment, run the adapters against Agave 4.0.0, and preserve the resulting JSONL/timeline as an integration fixture before claiming live-validator acceptance.

### O2 — JSONL is single-process MVP persistence

- Severity: Medium.
- Risk: no cross-process lock, fsync/durability contract, compaction, or recovery from partial final lines.
- Required fix: keep one writer per file in Sprint 1; add a durable storage implementation and crash tests before public ingestion.

### O3 — Recorder sequence continuity is process-local

- Severity: Medium.
- Risk: restarting a writer for the same attempt can restart sequence numbering.
- Required fix: treat one attempt as owned by one recorder process for now; future collector assigns an ingestion sequence or restores the next sequence from durable state.

### O4 — RPC error categorization is conservative but coarse

- Severity: Medium.
- Risk: message-class heuristics cannot reliably distinguish every preflight, provider RPC, timeout, and transport error.
- Required fix: introduce versioned coded-error normalization with provider-independent fixtures; ambiguous errors already use `mayHaveBeenForwarded=true`.

### O5 — Runtime validation is envelope-level

- Severity: Medium.
- Risk: a hand-edited JSONL line can have a valid envelope but malformed event-specific data.
- Required fix: reuse generated validators from the machine-readable event schema when ingestion becomes external.

### O6 — Observer events are identified but not signed

- Severity: Low for local Sprint 1, High before remote ingestion.
- Required fix: implement canonical ProbeResult signing with dedicated Ed25519 keys in the observer/collector sprint. No private keys are handled by Telemetry Core.

### O7 — Logical quorum is correlated

- Severity: Known methodological limitation.
- Required fix: later use different read infrastructure and regions; never call the current design an independent network quorum.

## Security review

- No committed secrets or private keys.
- `.secrets/` and environment files are ignored.
- Transaction signatures are documented as public and correlatable.
- Raw signed transaction bytes are not stored by the Telemetry Core.
- Full RPC messages are not retained; only category/code/message class.
- Reader requests are bounded and aborted where supported.
- No retry/failover loop or user transaction broadcaster was added.

## Scores

| Dimension | Grade | Rationale |
|---|---|---|
| Security | B | Safe local boundary; remote signing/ingestion deliberately absent |
| Correctness | A- | All required state paths pass; live-validator evidence remains missing |
| Error handling | B+ | Conservative ambiguity handling and timeouts; error taxonomy remains coarse |
| Testing | A- | 10 tests, six required scenarios, JSONL reconstruction, timeout and idempotency |
| Organization | A | Facts, quorum, projection, coordination, adapters, and persistence separated |
| Documentation | A | Methodology, API, examples, limitations, and acceptance mapped |

Overall: **B+**. Ready for Mainnet: **No**. Ready to stop Sprint 1 and request live integration authorization/toolchain setup: **Yes**.
