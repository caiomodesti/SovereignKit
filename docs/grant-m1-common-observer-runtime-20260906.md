# Grant M1 common Observer runtime candidate — 2026-09-06

Status: `OBSERVER_A_REQUALIFIED_B_C_PENDING`

The common Observer package was built from reviewed `main` commit
`f4c70ea10198e5313eec0467f6a7b9222ff9e8f3` after the authenticated experiment
plan, conservative quorum, source-age, delivery-recovery, and signed-feed
changes were integrated.

Local packaging evidence:

- manifest schema: `GrantM1ObserverRuntimeManifest@0.1.0`;
- manifest entries: 192;
- manifest SHA-256:
  `5088e46578192885e58a30a52937478dfa6796b279b115eac7af56dad2eb697b`;
- every listed file hash independently recomputed: PASS;
- `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`: PASS;
- packaged Observer runtime and observation worker imports: PASS.

The package remains in the ignored local `artifacts/` directory and contains no
host credentials. The exact archive has now been installed and requalified on
AWS Observer A only. It has not been installed on Google Observer B or Oracle
Observer C and does not establish Milestone 1 acceptance.

## Requalification decision

The change is material. Compared with the latest qualified AWS runtime, the
candidate changes the observation worker's quorum derivation and the delivery
runtime's retry/readiness behavior. The installed qualified commits are:

| Host | Qualified runtime |
| --- | --- |
| AWS Observer A | `f4c70ea10198e5313eec0467f6a7b9222ff9e8f3` (requalified 2026-09-08) |
| Google Observer B | `44031a66466e48fce5e1e93a86a7d48867edf134` |
| Oracle Observer C | `49557b234b7e359dcd77ca198639b6e0a936dee2` |

Only Observer A now equals the common candidate. Formal acceptance must not
combine the old B/C soak evidence with a claim that those hosts run the common
runtime.

Requalification will be sequential:

1. AWS Observer A: complete. Exact archive, all 192 manifest files, preflight,
   restart/recovery, signed Devnet assignment, 86,400-second soak, independent
   recomputation, and post-soak preflight passed;
2. only after separate owner authorization, repeat the same controlled update
   and gates for Google B;
3. only after B passes, repeat them for Oracle C.

The already retained historical evidence remains valid for its named commits;
it is not rewritten or discarded. The repeated gates qualify the common
candidate and are not counted as additional grant observations unless they are
real, signed, assignment-correlated Solana results.

Observer A closure is recorded in
`docs/grant-m1-observer-a-common-runtime-closure-20260908.md` and
`fixtures/grant-m1/observer-aws-a-common-runtime-requalification-20260908.json`.
