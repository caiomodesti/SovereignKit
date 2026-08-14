# Sprint 7 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Snapshot contains version, generation, expiry and route intelligence | PASS | versioned schema and generated fixture evidence |
| 2 | Route intelligence carries source provenance | PASS | experiment/window/observer/config/source hash/sample/source time required |
| 3 | Source observation time is not replaced by feed generation time | PASS | verifier derives `2026-08-12T16:50:54.093Z` from raw ProbeResults |
| 4 | Snapshot generation is deterministic | PASS | canonical input hash and retained real-summary evidence |
| 5 | Schema is strict and versioned | PASS | Draft 2020-12; additional fields/unsupported constants fail |
| 6 | HTTP polling is bounded | PASS | abort timeout, streaming size cap, JSON/status/redirect controls |
| 7 | Non-loopback transport requires HTTPS | PASS | HTTP URL guard; loopback network test |
| 8 | TTL is enforced | PASS | future, invalid interval, and `now >= expires_at` fail open |
| 9 | Version rollback fails open | PASS | lower version test |
| 10 | Same-version equivocation fails open | PASS | content-hash comparison test |
| 11 | Same identical version is not a new vote | PASS | repeated v1 remains below avoid threshold |
| 12 | Avoid hysteresis is explicit | PASS | two distinct snapshots by default |
| 13 | Restore hysteresis is explicit | PASS | three distinct healthy snapshots by default |
| 14 | Class semantics are bounded | PASS | asymmetric avoids PROGRAM_X only; degraded applies to both |
| 15 | Unavailable/malformed/oversized feed fails open | PASS | dispositions return `LOCAL_PRIMARY_FALLBACK` |
| 16 | Developer override exists and is safe | PASS | explicit override wins; exception returns local policy |
| 17 | Feed does not silently pool observers | PASS | duplicate route/class sources rejected |
| 18 | ReactiveRouter remains unchanged | PASS | client exposes disposition only; no route order mutation |
| 19 | Workspace validation passes | PASS | build and 65/65 tests |
| 20 | Coverage remains measured | PASS | 89.45% statements, 81.03% branches, 93.13% functions, 94.76% lines |
| 21 | No dashboard/Sprint 8 or probe-informed routing/Sprint 9 began | PASS | no UI, hosting, router integration, or public feed service |

Sprint 7 is accepted for the local feed-contract and fail-open SDK claim only.
