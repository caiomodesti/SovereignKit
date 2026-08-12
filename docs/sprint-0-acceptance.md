# Sprint 0 Acceptance Audit

Date: 2026-08-10

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Required documents exist without placeholder sections | PASS | README, normative docs, 12 ADRs, schemas |
| 2 | Lifecycle states and transitions are defined | PASS | `measurement-model.md` |
| 3 | RPC acknowledgment is separated from landing | PASS | ADR-001, methodology, schema |
| 4 | Expiration is based on block height, not timeout | PASS | ADR-007, methodology |
| 5 | Observed facts are separated from derived states | PASS | architecture and measurement model |
| 6 | Observer and collector timestamps are separate | PASS | measurement model |
| 7 | Unit, pairing, randomization, sample size, and policy are defined | PASS | methodology and experiment schema |
| 8 | Insufficient samples or degraded controls cannot be asymmetric | PASS | classification precedence and thresholds |
| 9 | Selective and general degradation have distinct expected results | PASS | demo contract |
| 10 | Observation is not exclusively the submission route | PASS WITH LIMITATION | 2/3 logical quorum; shared validator disclosed |
| 11 | Hostile proxy scope and threat model are documented | PASS | transaction classes, threat model, demo contract |
| 12 | User telemetry is opt-in and secrets/raw transactions are excluded | PASS | product spec and epistemic limits |
| 13 | Current Solana SDK and compatibility policy are recorded | PASS | ADR-011 |
| 14 | No unused production package/folder scaffold was created | PASS | only docs, schemas, and one experiment definition |
| 15 | Product claims have measurement or limitation backing | PASS | README and epistemic limits |
| 16 | Frontend-generated experiment states are prohibited | PASS | product invariant and demo failure conditions |
| 17 | Official architectural questions are decided or blocked | PASS | ADRs and Sprint 0 audit blockers |
| 18 | Architecture, schema, methodology, and demo are contradiction-checked | PASS WITH FINDINGS | hostile audit records H1–H12 |
| 19 | Future reproduction/verification command contract exists | PASS | README and demo contract |
| 20 | Final Sprint 0 record lists decisions, blockers, assumptions, risks | PASS | ADR index and Sprint 0 audit |

## Sprint decision

Sprint 0 was completed as a specification sprint. Sprint 1 was subsequently authorized on 2026-08-11. Apache-2.0, reproducible toolchain pins, observer identity semantics, and the append-only raw-data principle were resolved before Sprint 1 implementation.
