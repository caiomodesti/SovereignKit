# Sprint 6 hostile audit

## Verdict

No blocking defect remains for the narrow claim that a standalone local Observer can authenticate a ProbeResult to a separate loopback Collector and that accepted/replay state survives a clean restart. The implementation is not approved for public or multi-host exposure.

## Findings and disposition

### H1 — Versioned schema contradicted retained evidence

**Severity: blocking, closed.** The schema required UUIDs for deterministic attempt, claim, and decision identifiers. Rewriting them would invalidate signatures. ADR-018 aligns the schema with bounded opaque IDs and validates all 600 retained results.

### H2 — Observer sequence was incorrectly global

**Severity: blocking, closed.** Existing writers restart sequence for each experiment definition. Replay uniqueness is now scoped to `observer_id × experiment_definition_hash`; global result/idempotency protection remains.

### H3 — Memory could advance before durable storage

**Severity: blocking, closed.** The initial write path mutated replay indexes before append. It now assesses first, appends and `fsync`s, then commits indexes. An uncertain write poisons the process until restart.

### H4 — Crash recovery is conservative, not self-healing

**Severity: medium, residual.** A partial final record causes startup refusal. This preserves evidence integrity but requires operator inspection/recovery. No automatic truncation is allowed.

### H5 — JSONL is single-writer storage

**Severity: high for production, residual.** There is no file lock, transaction coordinator, replication, or concurrent Collector protocol. Only one Collector may own a log. A database remains a later production decision, not Sprint 6 scope.

### H6 — Process separation is not infrastructure independence

**Severity: high, residual.** Observer and Collector have separate PIDs but share host, OS, clock, disk, user account, and failure domain. Geographic observers remain future validation.

### H7 — Authentication does not prove truth

**Severity: high, residual.** Ed25519 proves which allowlisted key signed bytes. A compromised or dishonest observer can sign false measurements. Logical 2/3 readers on one validator are still correlated.

### H8 — Central allowlist and host remain trusted

**Severity: high, residual.** A malicious Collector/host can suppress submissions, alter configuration, or rewrite stored evidence. There is no external transparency log, hash-chain anchoring, or decentralized governance.

### H9 — Development key custody is basic

**Severity: medium, residual.** The private-key document is PKCS#8 on disk and `.secrets/` is ignored. POSIX mode `0600` is requested in the test, but Windows requires an explicit ACL that this package does not manage. There is no HSM, OS secret store integration, remote revocation, or enforced rotation workflow.

### H10 — HTTP service is intentionally local-only

**Severity: blocking if exposed, bounded.** It has no TLS or remote client authentication. Explicit loopback bind/client checks and payload bounds make it suitable only for the controlled host. Public binding is prohibited.

### H11 — Availability controls are incomplete

**Severity: medium, residual.** Body size is bounded and writes are serialized, but there is no production rate limiter, queue, backpressure telemetry, disk quota policy, or alerting.

### H12 — Schema validator adds supply-chain surface

**Severity: medium, bounded.** Ajv 8.20.0 and ajv-formats 3.0.1 are exact dependencies in the lockfile. They replace incomplete hand validation but require continued dependency/CI auditing in Sprint 12.

## Assumptions

1. A successful `fsync` provides the expected durability semantics on the local filesystem.
2. Exactly one Collector process owns a given accepted log.
3. The allowlist file and host clock are trustworthy.
4. Observer private-key files are readable only by the intended account.
5. Retained Sprint 5 signatures and public key identify one controlled run, not a durable decentralized identity.

## Blockers

None for local Sprint 6 acceptance. Public exposure is blocked on remote transport authentication, production storage/concurrency, secret custody, abuse controls, external integrity strategy, and operationally independent observers. Those are not silently claimed as complete.
