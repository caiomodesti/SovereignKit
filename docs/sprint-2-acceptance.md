# Sprint 2 Acceptance and Hostile Audit

Date: 2026-08-12

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | ProbeDefinition declares both controlled classes | PASS | Definition validation rejects missing or duplicate classes |
| 2 | Primary statistical units are complete and unique | PASS | Cartesian expansion and SHA-256 tuple-derived `unit_id`; 12/12 unique test units |
| 3 | Comparative transactions are never identical | PASS | Six route/class units produce six wire payloads and six signatures |
| 4 | Class pairs are methodologically matched | PASS | Same pair nonce; structural fingerprint covers program, accounts, signers, instructions, size, compute and fee policy |
| 5 | Class varies primarily by discriminator | PASS | Pair data uses identical fixed-width nonce and one-byte discriminator `0x00`/`0x01` |
| 6 | Structural mismatches are excluded | PASS | Tampered compute limit returns `MATCHING_INVALID` equivalent (`valid: false`) with reason |
| 7 | Randomization is seeded and reproducible | PASS | Same seed reproduces order; another seed changes it |
| 8 | Pairing windows are explicit | PASS | Per-index units remain contiguous; executor records span and breach |
| 9 | ProbeResults use observer Ed25519 authentication | PASS | Canonical hash/sign/verify with dedicated observer/key IDs |
| 10 | Collector uses an observer allowlist | PASS | Unknown and expired keys are rejected |
| 11 | Duplicate results cannot change counts | PASS | Exact replay returns `DUPLICATE`; stored count remains one |
| 12 | Identifier conflicts and false quorum fail explicitly | PASS | result/idempotency/sequence conflict, one-claim quorum, unknown claim and duplicate reader checks |
| 13 | Versioned schema supports key rotation | PASS | `observer_key_id` is required in `probe-result.schema.json` |
| 14 | No private observer key is committed | PASS | Tests generate ephemeral keys; fixtures contain behavior only |
| 15 | No generic semantic classifier exists | PASS | Classes are declared only |
| 16 | No Sprint 3+ product feature exists | PASS | No router, proxy, classifier, dashboard, database, or intelligence feed implementation |

## Verification

- Typecheck: PASS for telemetry and probes.
- Build: PASS for telemetry and probes.
- Tests: 19/19 PASS (11 Telemetry Core, 8 Probe Engine).
- Coverage: 89.21% statements, 80.63% branches, 97.10% functions, 94.59% lines overall.
- Probe Engine coverage: 82.02% statements, 71.34% branches, 96.15% functions, 93.48% lines.
- Git whitespace/error check: PASS.

## Decisions taken

1. Sprint 2 uses a dedicated `@sovereignkit/probes` package.
2. Solana transactions are legacy in this sprint, consistent with the proven Sprint 1.5 profile.
3. Pair nonce is 16 bytes, deterministic per experiment/version/phase/observer/route/probe index and equal across the two classes.
4. `MATCHED_CONTROL = 0x00`; `PROGRAM_X = 0x01`.
5. Compute limit and price are explicit transaction instructions.
6. Expected compute units are declared, compared with the official tolerance, and never presented as live measurements.
7. Randomization is deterministic HMAC-SHA-256 and pair-index bounded.
8. Observer signatures use Ed25519 over canonical JSON plus SHA-256 payload hash.
9. `observer_key_id` is an official required ProbeResult field.
10. Idempotency is derived from observer ID and unit ID; observer sequence is an additional replay-conflict key.
11. Exact replays are no-op duplicates; conflicting replays are rejected.
12. Sprint 2 ingestion is an in-memory contract fixture, not production collector storage.

## Hostile findings and residual risks

| Severity | Finding | Treatment / next required evidence |
|---|---|---|
| High (evidence scope) | The project-owned program is not deployed or executed in Sprint 2. | Do not claim live class equivalence. Deploy/profile it before the controlled experiment. |
| High (evidence scope) | Expected compute values are trusted declaration inputs. | Replace test declarations with measured CU evidence and retain logs before scenario analysis. |
| Medium | In-memory ingestion is not durable, concurrent, or network hardened. | Sprint 6 must add exhaustive schema validation, durable append-only storage and concurrency/replay tests. |
| Medium | Canonical JSON is project-defined, not claimed as RFC 8785. | Keep signers/verifiers on the same version; publish cross-runtime vectors before remote observers. |
| Medium | Legacy transaction construction has not been re-run live with the controlled program. | Add a validator integration once that program exists; Sprint 1.5 only proves the Telemetry Core transfer path. |
| Low | Seeded HMAC modulo selection has negligible modulo bias. | Accept for ordering, not cryptography; document if the scheduler is used beyond controlled tests. |

No critical exploitable security issue was found in the Sprint 2 client-only boundary. Solana on-chain signer, owner, PDA, rent, CPI, arithmetic and reinitialization checks are not applicable because no project-owned on-chain program exists yet.

## Sprint decision

Sprint 2 passes its scoped acceptance criteria. This validates construction, matching, scheduling, authentication, and ingestion semantics in deterministic tests. It does not validate the undeployed controlled program or any asymmetry claim. Sprint 3 has not started.
