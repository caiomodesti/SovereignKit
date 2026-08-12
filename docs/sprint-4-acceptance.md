# Sprint 4 Acceptance and Hostile Audit

Date: 2026-08-12

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Loopback-only listener | PASS | Bind type and runtime validation permit only literal loopback |
| 2 | Allowlisted local upstream only | PASS | Exact URL allowlist plus literal loopback/HTTP/no-credentials validation |
| 3 | No open header/credential forwarding | PASS | Proxy creates a minimal content-type-only upstream request |
| 4 | Safe pass-through | PASS | Exact JSON body reaches fake upstream; live control reaches Agave |
| 5 | Selective reject only `PROGRAM_X` | PASS | Control passes, test rejects with `-32098`; runtime mode validation |
| 6 | Deterministic general degradation | PASS | Precommitted pair nonce rejects both classes, unscheduled pair passes |
| 7 | Schedule cannot mutate after start | PASS | Internal set snapshot; external mutation adversarial test |
| 8 | Unknown/malformed class data passes through | PASS | Invalid base64, wrong program and non-send methods cannot be selectively rejected |
| 9 | Parser is restricted to builder shape | PASS | Signer/version/instruction/program/data/account checks |
| 10 | Payload and streamed response limits | PASS | 413/502 tests; bodies are bounded while streaming |
| 11 | Timeout and concurrency limits | PASS | Delayed upstream and concurrent request adversarial test |
| 12 | Audit capacity is bounded | PASS | Forwarding stops at cap before evidence can silently disappear |
| 13 | Audit excludes raw sensitive payload | PASS | Only SHA-256 pair-nonce hash retained; tests search for nonce/wire data |
| 14 | Audit snapshots are immutable | PASS | Frozen events and copy snapshots tested |
| 15 | Real proxy rejection drives real failover | PASS | Live proxy → router → direct Agave → 3/3 logical confirmation |
| 16 | ACK remains separate from landing | PASS | Router live trace records `landing: false` before independent confirmation |
| 17 | Controlled findings are scoped correctly | PASS | Memo and shared-validator limitations embedded in fixture/docs |
| 18 | No Sprint 5 implementation | PASS | No classifier policy, aggregation, peer baseline or summary generator added |

## Verification

- Hostile Proxy unit/network tests: 9/9 PASS.
- Full deterministic suite: 40/40 PASS.
- Live integration: 1/1 PASS against local Agave 4.0.0.
- Typecheck/build: PASS for telemetry, probes, SDK and hostile proxy; both relevant integration configs PASS.
- Coverage: 88.91% statements, 79.92% branches, 97.84% functions, 94.97% lines overall.
- Proxy coverage: 85.04% statements, 74.86% branches, 100% functions, 95.20% lines.
- Validator SHA-256: `9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406`.

## Decisions taken

1. Implement the network service as `@sovereignkit/hostile-proxy` with no remote/public mode.
2. Bind and forward only on literal loopback; exact upstream allowlist is mandatory.
3. Accept only immutable `PASS_THROUGH`, `REJECT_CLASS(PROGRAM_X)` or `GENERAL_DEGRADATION` startup modes.
4. Identify general-degradation units by precommitted pair nonce; both classes share that nonce.
5. Use exact builder-shape decoding, not generic semantic classification.
6. Pass unknown/malformed class payloads through and mark them `UNKNOWN`.
7. Hash pair nonces in audit and never retain raw transaction bytes.
8. Return generic controlled JSON-RPC rejection `-32098` without revealing class/schedule details.
9. Bound requests, streamed responses, concurrency, upstream time and audit capacity.
10. Stop forwarding when audit evidence capacity is exhausted.
11. Encode the builder's 16-byte nonce as 16 hex ASCII characters so it remains fixed-width, deterministic, unique and valid UTF-8 for the executable fixture.
12. Use Memo only to prove the network path; do not substitute it for the project-owned experiment program.
13. Treat the executable SHA-256 as validator identity; ignore unstable displayed source suffixes.

## Blockers

Sprint 4 itself has no remaining blocker. Sprint 5 statistical execution is blocked until the project-owned matched program is built/deployed and actual compute consumption is measured within the official tolerance.

## Assumptions

- Loopback and local validator are controlled by the experiment operator.
- Proxy startup configuration and schedule ID are preserved with experiment artifacts.
- Unknown transactions are excluded from controlled-class analysis downstream.
- Audit hook persistence, if used, is append-only and operator-controlled.
- Logical readers remain distinct clients over one shared validator.

## Residual risks

| Severity | Finding | Specific treatment |
|---|---|---|
| High (methodology) | Live proof uses Memo, not the project-owned matched program. | Build/deploy/profile the official program before Sprint 5 classifications. |
| High (claim scope) | Controlled intervention cannot calibrate real provider behavior or intent. | Preserve controlled-only wording in all summaries and reports. |
| Medium | Loopback service has no caller authentication. | Keep it local-only; add OS/process isolation before any shared-host deployment. |
| Medium | Unknown/malformed transactions pass through by design. | Exclude them from experimental cells; never interpret pass-through as controlled classification. |
| Medium | In-memory audit is bounded but not crash-durable. | Use the audit hook for append-only persistence in the experiment harness; collector hardening remains later. |
| Low | Patched validator `src:` display is unstable despite identical binary hash. | Pin and report SHA-256, source patch and toolchain instead of the displayed suffix. |

## Hostile verdict

Scoped PASS. Security B+, correctness A-, error handling A-, testing A-, organization A, documentation A; overall A-. Not ready for public deployment or mainnet. No critical exploitable security issue was found within the enforced loopback boundary. On-chain signer/owner/PDA/CPI/rent checks remain deferred until the project-owned program exists.

Sprint 5 has not started.
