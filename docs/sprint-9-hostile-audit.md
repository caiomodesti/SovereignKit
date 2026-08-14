# Sprint 9 hostile audit

## Verdict

The implementation is acceptable for controlled, fail-open route ordering. It
does not establish that production route intelligence is accurate, independent,
signed, timely, or beneficial for arbitrary user transactions.

## Attacks attempted

1. **Delete a locally configured route with intelligence.** Failed: `AVOID`
   stable-partitions the eligible set and remains last resort.
2. **Introduce a route outside `maxRoutes`.** Failed: the local window is formed
   before any intelligence decision.
3. **Keep using an expired decision without polling.** Failed: generated/expiry
   times are checked again at routing start.
4. **Move the clock behind `generated_at`.** Failed open to local order.
5. **Throw or return malformed adapter values.** Contained and recorded as
   `FAIL_OPEN`; no unsafe reorder occurs.
6. **Misuse asymmetric evidence for the control class.** Failed: the same fresh
   snapshot moves `PROGRAM_X` but preserves `MATCHED_CONTROL` local order.
7. **Avoid every route.** Local order is preserved instead of fabricating a
   preference among equally avoided routes.
8. **Omit the declared class.** Intelligence is not consulted; legacy local
   routing remains.
9. **Treat acknowledgement as success.** Unchanged: only independent quorum can
   return `CONFIRMED` or `FINALIZED`.
10. **Hide how order was selected.** Result and telemetry retain configured
    order, selected order, class, decision source, version, and fail-open reason.

## Residual risks and blockers to production claims

- The caller can falsely or accidentally declare a transaction class. The SDK
  deliberately has no generic semantic classifier to correct that input.
- Snapshot authenticity is not cryptographically signed; HTTPS protects
  transport but not every origin-compromise scenario.
- Hysteresis state is in process memory and resets on restart.
- There is no background polling scheduler; applications own poll cadence.
- A decision is atomic at routing start. A snapshot may expire while that one
  transaction is already in flight, and the order is not mutated mid-attempt.
- Developer override can intentionally bypass feed behavior and must be audited
  by the application operator.
- Route IDs must match between local configuration and intelligence. Missing
  entries fail open but can silently reduce proactive benefit.
- Evidence remains one controlled local observer, shared infrastructure,
  `ClassificationPolicyV0Experimental`, and `LIMITED` n=30 cells.
- The Sprint 9 composite fixture uses a deterministic submitter. It reuses the
  previously live-proven router semantics but is not a new live-validator run.
- Devnet/Mainnet latency, fee markets, provider behavior, route identity, and
  production false-positive rates remain unvalidated.

## Scope audit

No Devnet work, public feed hosting, background service, semantic transaction
classification, new observer-network claim, dashboard feature, billing, or
Sprint 10 implementation was added.
