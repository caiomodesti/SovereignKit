# Sprint 1.5 acceptance and hostile audit

## Verdict

Sprint 1.5 passes its Live Validator Integration Proof. Sprint 2 has not started.

**Telemetry Core has now been validated against a real local Agave validator.**

Canonical fixture: `fixtures/integration/agave-4.0.0/healthy`.

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | One real Solana transaction completes the healthy lifecycle | PASS | Real signature and finalized recipient balance in `evidence.json` |
| 2 | Lifecycle reconstructed from raw events | PASS | `canonicalJson(reconstructed) === canonicalJson(timeline)` asserted by live test |
| 3 | Transaction observed through quorum | PASS, logically limited | All three logical readers observed success, confirmed, and finalized; required quorum is 2/3 |
| 4 | RPC acknowledgement remains separate from ledger observation | PASS | Raw sequence records ACK before observation; ACK alone previously produced `OBSERVATION_INCONCLUSIVE` |
| 5 | Confirmed and finalized observed in reality | PASS | `getSignatureStatuses` returned `finalized`, `err: null`, slot 4 |
| 6 | Artifacts reproducible | PASS | Pinned commands and source-build provenance in `sprint-1.5-reproduction.md` |
| 7 | Integration fixture preserves evidence | PASS | JSONL, timeline JSON/text, and evidence JSON committed |
| 8 | Harness fakes no timeline state | PASS | Failed v0 runs remained inconclusive; only reader facts derive ledger states |
| 9 | No Sprint 2 feature started | PASS | No Probe Engine, classifier implementation, Hostile Proxy, dashboard, observer network, proactive routing, or PostgreSQL |

## Accepted run

- Agave: `solana-test-validator 4.0.0`
- patched validator SHA-256: `9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406`
- transaction format: `legacy`
- send profile: base64, `skipPreflight=false`, `preflightCommitment=confirmed`, `maxRetries=5`, `minContextSlot=latestBlockhash.context.slot`
- blockhash commitment: `confirmed`
- observation readers: three logical readers, one local endpoint
- required quorum: 2/3; achieved: 3/3
- transfer: `1,000,000` lamports
- final status: `finalized`, execution error `null`
- canonical fixture raw event count: 1,372

## Decisions taken

1. Preserve Rust `1.97.1` and Agave `4.0.0`; no silent toolchain upgrade.
2. Accept ADR-016's Windows-only source build with two minimal compatibility changes: directory-handle opening and loopback destination for the embedded faucet RPC client.
3. Keep faucet listening on `0.0.0.0`; change only the Windows in-process connect destination to `127.0.0.1`.
4. Fix the Sprint 1.5 transaction profile to `legacy`; v0 is outside this proof after reproducible non-landing while a real CLI legacy transfer succeeded.
5. Fix comparable send configuration at base64, preflight enabled, confirmed preflight, context-slot guard, and five retries.
6. Preserve JSONL as primary evidence and derive every lifecycle state from it.
7. Preserve three logical reader identities and quorum 2/3, while explicitly denying infrastructure independence.
8. Commit the healthy fixture but ignore runtime ledgers, keypairs, local toolchains, caches, and arbitrary artifacts.

## Blockers

No blocker remains for Sprint 1.5 acceptance.

The following are blockers for broader claims, not for this scoped proof:

- no operationally independent readers;
- no signed ProbeResult/collector ingestion path;
- no project-owned MATCHED_CONTROL/PROGRAM_X program deployed yet;
- no v0 transaction compatibility proof on this Windows validator path;
- no Devnet integration validation.

## Assumptions

- three reader objects hitting one endpoint are sufficient to validate quorum semantics, not decentralization or infrastructure independence;
- the System Program legacy transfer is sufficient to validate Telemetry Core lifecycle integration without introducing the controlled experiment program;
- local wall-clock timestamps are informative, while lifecycle latency ordering uses one monotonic process clock;
- a finalized RPC status plus finalized recipient balance is adequate external evidence of execution for this proof;
- the patched source preserves Agave 4.0.0 semantics outside the two Windows compatibility boundaries documented by ADR-016.

## Hostile methodology audit

### Challenges that survived

- **The quorum is not independent infrastructure.** All readers share one process and failure domain. A 3/3 result proves deterministic logical aggregation only.
- **The submission and observation endpoint share the validator.** Separation is semantic and event-based, not an independent provider witness.
- **The validator is not an upstream byte-identical release artifact.** It is a reviewed local source build; upstream Windows behavior remains a portability risk.
- **The healthy fixture proves one transaction class and one run shape.** It is not statistical evidence of accessibility or asymmetry.
- **The canonical raw fixture is large.** A 100 ms poll interval produced 1,366 facts for one lifecycle; later storage needs explicit sampling/compaction rules without rewriting raw truth.
- **Observer authentication is not exercised.** The local recorder identity is not a signed remote ProbeResult.
- **JSONL durability is limited.** It validates append-only semantics and payload rejection, but has no fsync, multi-writer coordination, or crash recovery guarantee.
- **Legacy-only proof.** v0 messages received RPC acknowledgement but did not land in repeated runs. The proof does not generalize across transaction versions.

### Falsification behavior that worked

- the unpatched official validator failed instead of being relabeled healthy;
- the unfixed faucet returned internal error and produced no false transaction evidence;
- repeated acknowledged but non-landed v0 transactions derived `OBSERVATION_INCONCLUSIVE`, never `FINALIZED`;
- changing retries alone did not manufacture landing;
- the accepted lifecycle appeared only after a real legacy transaction reached finalized status and changed recipient balance.

## Residual risks

| Risk | Severity | Required future treatment |
|---|---|---|
| Shared reader failure domain | High for scientific independence | Use separately operated readers before broader claims |
| Unsigned local evidence | Medium | Implement observer keypairs, canonical ProbeResult signing, allowlist, and idempotency before ingestion |
| Local Agave patch divergence | Medium | Upstream or replace patch; reproduce hashes/tests in CI |
| JSONL crash/multi-writer limits | Medium | Add durable ingestion storage without changing raw event semantics |
| v0 non-landing | Medium | Isolate Kit/Agave v0 forwarding behavior before claiming version coverage |
| Poll volume | Low | Define sampling/storage budget while retaining immutable raw facts |
| One successful transaction | High for statistical claims | Do not use Sprint 1.5 as asymmetry evidence; later matched experiments require explicit windows and repetitions |

## Verification results

- environment doctor: PASS for Node 22.17.0, pnpm 11.16.0, Rust 1.97.1, Solana CLI 4.0.0, manifest pins;
- production typecheck: PASS;
- integration typecheck: PASS;
- build: PASS;
- unit tests: 11/11 PASS;
- live integration: 1/1 PASS;
- coverage: 94.78% statements, 85.75% branches, 97.52% functions, 95.34% lines;
- timeline examples: healthy, rejected, execution failed, expired, inconclusive generated successfully.
