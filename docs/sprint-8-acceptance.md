# Sprint 8 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Dashboard consumes real stored/derived data only | PASS | deterministic adapter reads seven accepted fixture files; no mock rows |
| 2 | Dataset is versioned and provenance-bearing | PASS | `DashboardDataset@0.1.0` plus complete source-file list |
| 3 | All required scenarios remain distinct | PASS | HEALTHY, DEGRADED, ASYMMETRIC, INSUFFICIENT_DATA views |
| 4 | Route and transaction-class measurements are visible | PASS | per-window route table with both matched classes |
| 5 | Classifications come from measurements | PASS | source summaries preserved byte-for-byte by verifier |
| 6 | Evidence uses `evidenceStrength` terminology | PASS | LIMITED/INSUFFICIENT values shown; no calibrated confidence claim |
| 7 | Observer authentication is visible without decentralization claim | PASS | one allowlisted observer and key identifier displayed |
| 8 | Observation limitations are prominent | PASS | shared-validator warning precedes route details |
| 9 | RPC acknowledgement remains separate from landing | PASS | failover view explicitly separates acknowledgement and quorum confirmation |
| 10 | Real failover evidence is shown | PASS | rejected primary, acknowledged fallback, final CONFIRMED state |
| 11 | Feed freshness is evaluated from versioned times | PASS | FRESH/STALE/INVALID unit tests; retained snapshot renders STALE now |
| 12 | Feed failure semantics remain fail-open | PASS | UI documents local primary/fallback disposition; no router mutation |
| 13 | Loading state exists | PASS | asynchronous evidence-loading view and test |
| 14 | Unavailable/invalid evidence fails explicitly | PASS | error view, retry path, and tests |
| 15 | Empty state exists | PASS | healthy window renders no-findings state |
| 16 | Responsive and dark-mode behavior exists | PASS | 375/768/1280 audit, no overflow, system dark palette |
| 17 | Keyboard/accessibility basics are present | PASS | semantic landmarks, native select/button, focus rings, reduced motion |
| 18 | Production build is reproducible | PASS | pinned dependencies, generated dataset, Vite static bundle |
| 19 | Integrated validation and coverage pass | PASS | 72/72 tests; 89.46% statements, 80.83% branches, 93.62% functions, 94.95% lines |
| 20 | Epistemic language remains bounded | PASS | verifier blocks forbidden claims; methodology view states non-claims |
| 21 | No Sprint 9 or public infrastructure began | PASS | no route ordering integration, hosting, remote Collector, or deployment |

Sprint 8 is accepted only for the local, static controlled-evidence dashboard
claim. Sprint 9 remains unstarted.
