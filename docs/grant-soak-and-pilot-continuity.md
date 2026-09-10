# Soak closure and pilot continuity

Status: M1 accepted; M2 precommitment frozen but rehearsal and operational
controls still require evidence before M2 starts. Documentation alone is not a
pass.

## Current execution and scope

- A, B and C are accepted under the retained M1 aggregate package; preserve
  their closed qualification evidence and reviewed runtime compatibility.
- The M2 experiment, observer/runtime set, routes, cadence, versions,
  qualification rules and interruption policy are frozen in
  `deploy/grant-pilot/m2-pilot-precommitment.json`.
- M2 remains gated on rehearsal, backup/restore, counts/incidents,
  alert/response, resource approval and explicit official-window authorization.

## Preserve an active or closed run

Freeze the deployed runtime, configuration, identities, collection paths and
acceptance rules during a qualification window. Documentation-only edits and
local verifier work do not change a deployed runtime or invalidate its data.
Do not overwrite raw evidence, restart a soak, or relax thresholds to obtain a
pass. Each attempt retains its own identifier, artifacts and incident record.

Classify failures before choosing a remedy:

| Finding | Required handling |
| --- | --- |
| Login, shell quoting, download or report command fails | Fix access or tooling; inspect the original run before taking any collection action |
| Verifier defect with intact raw evidence | Correct and test the verifier against the frozen acceptance rules; recompute the retained raw data |
| A collection gap or readiness failure | Record the incident and evaluate the original thresholds; do not silently discard samples |
| Missing/corrupt evidence or a material runtime change | Identify the exact affected requirement and interval; assess what remains valid before proposing a new qualification window |

A failed post-soak preflight can block current admission without erasing a
historically valid closed soak. Preserve both findings and diagnose the cause.
Any proposed additional 24-hour run needs a concrete explanation of the failed
requirement, why existing evidence cannot satisfy it, and the user's decision.

## B closure checklist

1. Inspect the existing service and files read-only. `activating/start` is
   expected for a running long-lived systemd oneshot; it is not a failed run.
2. Require the complete summary and successful service exit. Independently
   verify the exact raw bytes, hash, basename, sequence and recomputed summary
   with `scripts/verify-grant-m1-observer-canary-evidence.mjs`.
3. Apply the existing 86,400-second minimum, 95% coverage, 99% readiness,
   zero identity mismatches and maximum three-interval gap. For B's 60-second
   cadence, that gap is 180 seconds. Verify protected regular files at 0600.
4. Check the post-soak host manifest/configuration, readiness, disk, clock,
   identity, delivery receipts and queue against retained pre-soak evidence.
   The canary raw schema does not record delivery counters: do not claim a
   continuous counter history from readiness samples alone.
5. Preserve private originals; publish only sanitized verification and claim
   boundaries. B qualification alone does not imply aggregate M1 acceptance.

## Before the official 14-day window

Prepare one short end-to-end rehearsal on the intended frozen deployment,
separate from grant KPI evidence. It must exercise assignments, route coverage,
signed results, collection, independent verification, daily export and restore.
Agree its bounded duration and pass criteria before execution; it is not another
automatic 24-hour soak.

Before declaring pilot readiness, retain evidence for all of these controls:

- Frozen experiment, runtime/configuration versions, identities, routes,
  cadence, qualifying-unit definition and inclusion/missing-data rules.
- Successful end-to-end rehearsal and recovery with idempotent replay,
  preserving original observations and preventing duplicate KPI counts.
- Tested daily raw-data backup and restore to a separate location, with hashes
  and reproducible signature, schema and raw-to-derived verification.
- Daily cumulative qualifying counts, per-observer/route participation,
  rejected/missing counts, and an append-only incident log.
- Working alerts with measured thresholds for disk headroom, clock drift,
  service/readiness, delivery backlog and RPC quotas; test actual notification
  delivery and identify who can respond while the operator is offline.
- A resource and quota estimate for 14 days with margin and approved costs.
- A recorded policy for interruptions and recovery consistent with the grant's
  continuous-operation requirement, frozen before the official start.

During M2, assess incidents against that policy. A recoverable export failure
need not erase intact collection, but an actual interruption may prevent a
continuous-window claim. Neither automatically reset all 14 days nor promise
that every failure permits continuation. Preserve evidence and report the
actual limitation; do not redefine acceptance retrospectively.
