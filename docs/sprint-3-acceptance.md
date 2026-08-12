# Sprint 3 Acceptance and Hostile Audit

Date: 2026-08-12

## Acceptance criteria

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Local primary/fallback ordering | PASS | Routes are attempted in declared order; live trace shows primary then fallback |
| 2 | Bounded route attempts | PASS | `maxRoutes` validated and enforced; invalid excess rejected before sending |
| 3 | No route revisit | PASS | Duplicate route/client identities rejected; visited set checked before every attempt |
| 4 | Route submission timeout | PASS | Hanging primary is aborted and fallback proceeds |
| 5 | Independent observation timeout | PASS | Timeout becomes inconclusive/failover, never expiry |
| 6 | Global deadline | PASS | Deadline prevents visiting another route and returns inconclusive |
| 7 | Telemetry cannot hang routing | PASS | Hook has its own bounded timeout; failures retained |
| 8 | RPC acknowledgment is not landing | PASS | ACK event contains `landing: false`; no ACK-only success path |
| 9 | Confirmation requires 2/3 logical readers | PASS | False quorum, repeated reader and unknown reader are rejected |
| 10 | Submission clients differ from reader clients | PASS | Constructor rejects identity overlap; live run uses five distinct client instances |
| 11 | Returned RPC signature must match | PASS | Mismatch becomes rejection and cannot confirm |
| 12 | Execution failure/expiry are terminal | PASS | Observed execution failure stops without futile fallback |
| 13 | Failover uses one real Solana transaction | PASS | Live Agave fallback signature and finalized 1,000,000-lamport balance |
| 14 | Real fallback reaches independent logical quorum | PASS | Three readers supported `CONFIRMED` in canonical run |
| 15 | Telemetry trace is ordered and complete | PASS | Versioned events have UUID, sequence, wall time and monotonic offset |
| 16 | No causal route overclaim | PASS | Field is `confirmationObservedAfterRouteId`, not successful/landing route |
| 17 | No Sprint 4+ implementation | PASS | No proxy, classifier, intelligence feed, dashboard or database added |

## Verification

- Unit tests: 12/12 Reactive Router PASS.
- Full deterministic suite: 31/31 PASS (11 telemetry, 8 probes, 12 SDK).
- Live integration: 1/1 PASS against real local Agave 4.0.0.
- Typecheck/build: PASS for telemetry, probes and SDK; integration typecheck PASS.
- Coverage: 90.01% statements, 81.45% branches, 97.52% functions, 94.91% lines overall; SDK 93.52% statements, 85.86% branches, 100% functions, 96.42% lines.
- Validator SHA-256: `9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406`.

## Decisions taken

1. Create working code in `@sovereignkit/sdk` only when Sprint 3 begins.
2. Accept an already-signed transaction; never silently rebuild or request private keys.
3. Retransmit the same signed transaction across reactive fallback routes; comparative probe uniqueness remains unchanged.
4. Fix `maxRoutes`, per-route timeout, observation timeout, telemetry-hook timeout and overall deadline in local policy.
5. Require exactly three distinct logical reader clients and quorum two.
6. Prohibit reader-client identity overlap with any submission client identity.
7. Treat thrown adapters and returned-signature mismatch as route rejection facts.
8. Treat observation timeout/failure as inconclusive, never expired.
9. Stop on independently observed execution failure or expiry.
10. Keep telemetry hook failures fail-open for routing but explicit in the returned trace.
11. Avoid causal attribution: confirmation is only recorded as occurring after a route attempt.
12. Use a controlled adapter rejection for the Sprint 3 live proof; reserve network-level failure injection for Sprint 4.

## Blockers

No blocker remains for the scoped Sprint 3 implementation. Network-level primary failure proof remains intentionally outside this sprint.

## Assumptions

- The signed transaction is valid and safe to retransmit idempotently.
- At least two configured logical readers report honestly.
- Client identities accurately describe distinct instantiated clients.
- Abort-aware adapters stop promptly; adapters that ignore abort may finish in the background.
- Local readers share one validator and therefore are not infrastructure-independent.

## Residual risks

| Severity | Finding | Specific treatment |
|---|---|---|
| High (evidence scope) | Primary live failure is adapter-injected, not a real proxy/network failure. | Sprint 4 must reproduce the same trace through a controlled pass-through/reject proxy. |
| High (attribution) | A late primary submission can land after fallback begins. | Preserve temporal wording; never claim the fallback caused landing without stronger evidence. |
| Medium | Abort cannot undo an already-forwarded RPC request, and an adapter may ignore abort. | Same signed transaction limits duplicate execution; retain deadlines and document background completion. |
| Medium | Event trace is returned in memory; hook durability is caller-owned. | Add durable collector/SDK sink hardening later without weakening routing availability. |
| Medium | Reader identity separation is declared and process-level, not cryptographically attested. | Preserve shared-infrastructure caveat and add operational separation in Sprint 6. |
| Low | Route errors use a coarse normalized category. | Preserve raw adapter telemetry externally and version richer coded-error normalization later. |

## Hostile verdict

Scoped PASS. Security B+, correctness A-, error handling A-, testing A-, organization A-, documentation A; overall A-. Not ready for mainnet. No critical exploitable security issue was found in the client-only routing boundary. On-chain signer/owner/PDA/CPI/rent/reinitialization checks remain not applicable because no project-owned program exists yet.

Sprint 4 has not started.
