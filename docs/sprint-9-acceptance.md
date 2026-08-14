# Sprint 9 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Transaction class is explicitly declared | PASS | routing context accepts only MATCHED_CONTROL or PROGRAM_X |
| 2 | No generic semantic classifier was introduced | PASS | absent context bypasses intelligence entirely |
| 3 | Local `maxRoutes` is authoritative | PASS | eligible window is sliced before decisions; bounded fixture B/A excludes C |
| 4 | Avoided routes are not removed | PASS | stable partition keeps A as last resort |
| 5 | All-avoided case preserves local order | PASS | deterministic test A/B/C |
| 6 | Fresh selective intelligence affects PROGRAM_X | PASS | accepted asymmetric evidence selects B/C/A |
| 7 | Matched control remains unaffected by asymmetric signal | PASS | same snapshot selects A/B/C for MATCHED_CONTROL |
| 8 | TTL is checked at routing time | PASS | exact expiry restores local order without another poll |
| 9 | Clock rollback fails open | PASS | routing time before generated_at returns local policy |
| 10 | Unavailable/missing/throwing intelligence fails open | PASS | local order plus explicit FAIL_OPEN trace |
| 11 | Runtime-malformed decisions fail open | PASS | unsupported source/disposition test |
| 12 | Developer override remains explicit and validated | PASS | valid override reorders; unsupported runtime value fails open |
| 13 | Legacy routing remains available | PASS | no context means no source call and local A/B/C |
| 14 | Selected order is auditable | PASS | result and PROBE_INFORMED_ORDER_SELECTED event retain decisions/order |
| 15 | RPC acknowledgment remains separate from confirmation | PASS | existing quorum-only success path unchanged |
| 16 | Existing router bounds remain intact | PASS | timeout, deadline, no-revisit, observation and telemetry tests pass |
| 17 | Retained Sprint 9 evidence reproduces exactly | PASS | five cases regenerated from accepted asymmetric measurements |
| 18 | Sprint 7 evidence remains reproducible | PASS | original snapshot verifier passes with explicit decision time |
| 19 | Workspace validation passes | PASS | build, typecheck and 84/84 tests |
| 20 | Coverage remains measured | PASS | 89.74% statements, 81.56% branches, 93.80% functions, 95.15% lines |
| 21 | No Sprint 10/Devnet work began | PASS | no external-network validation or API migration added |

Sprint 9 is accepted only for controlled fail-open route ordering. It does not
authorize production intelligence claims or begin Sprint 10.
