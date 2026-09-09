# Grant M1 common Observer runtime candidate — 2026-09-06

Status: `OBSERVERS_A_B_REQUALIFIED_C_RETAINED_ACCEPTANCE_REVIEW_PENDING`

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
AWS Observer A and Google Observer B. Oracle Observer C retains its previous
qualified runtime. This does not establish Milestone 1 acceptance.

## Requalification decision

The change is material. Compared with the latest qualified AWS runtime, the
candidate changes the observation worker's quorum derivation and the delivery
runtime's retry/readiness behavior. The installed qualified commits are:

| Host | Qualified runtime |
| --- | --- |
| AWS Observer A | `f4c70ea10198e5313eec0467f6a7b9222ff9e8f3` (requalified 2026-09-08) |
| Google Observer B | `f4c70ea10198e5313eec0467f6a7b9222ff9e8f3` (requalified 2026-09-09) |
| Oracle Observer C | `49557b234b7e359dcd77ca198639b6e0a936dee2` |

Formal acceptance must not use historical C evidence to claim qualification of
a different runtime. It must instead decide whether C's retained reviewed
runtime and evidence satisfy the actual aggregate M1 requirements.

Requalification will be sequential:

1. AWS Observer A: complete. Exact archive, all 192 manifest files, preflight,
   restart/recovery, signed Devnet assignment, 86,400-second soak, independent
   recomputation, and post-soak preflight passed;
2. Google B: complete. The exact archive, signed Devnet delivery, isolated
   recovery, single 86,400-second soak, independent recomputation, and
   post-soak preflight passed;
3. after B passes, audit aggregate M1 acceptance using C's existing qualified
   runtime and evidence. Do not automatically update C or schedule another soak.
   Any incompatibility must be demonstrated against an actual acceptance
   requirement before proposing a material runtime change.

This sequence supersedes the earlier instruction to update C automatically.
See `docs/grant-soak-and-pilot-continuity.md` for evidence preservation,
incident handling and the pre-pilot release gate.

The already retained historical evidence remains valid for its named commits;
it is not rewritten or discarded. The repeated gates qualify the common
candidate and are not counted as additional grant observations unless they are
real, signed, assignment-correlated Solana results.

Observer A closure is recorded in
`docs/grant-m1-observer-a-common-runtime-closure-20260908.md` and
`fixtures/grant-m1/observer-aws-a-common-runtime-requalification-20260908.json`.
Observer B closure is recorded in
`docs/grant-m1-observer-b-common-runtime-closure-20260909.md` and
`fixtures/grant-m1/observer-google-b-common-runtime-requalification-20260909.json`.
