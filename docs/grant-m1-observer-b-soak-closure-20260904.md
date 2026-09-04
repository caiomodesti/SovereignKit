# Observer B — soak closure verification, 2026-09-04

Status: `SOAK_AND_POSTFLIGHT_VERIFIED_PENDING_ADMISSION_RECORD`

This record documents live verification, not formal Milestone 1 acceptance.
Observer C provisioning and Milestone 2 have not started in this operation.

## Independently verified soak

- Observer: `observer-google-e2-micro`.
- Start: `2026-09-03T10:24:53.541Z`.
- Completion: `2026-09-04T10:24:53.580Z`.
- Duration: 86,400 seconds; interval: 60 seconds.
- Samples: 1,440 of 1,441 expected; coverage: 0.9993060374739764.
- Readiness: 1.0; identity mismatches: 0; maximum gap: 60,162 ms.
- Runner: `Result=success`, `ExecMainStatus=0`.
- Raw SHA-256: `9766a6f5c544ba4343b793cfa2e4df6bfcd059ceb31c8ec5ca6b010fa45942b6`.
- Independent gate: `GRANT_M1_OBSERVER_CANARY_EVIDENCE`, `PASS`, no blockers.

The verifier was absent from the immutable deployed runtime. It was fetched
from repository commit `3ae8d038a263f79c43f30404ae7f9d654df8eef8` into a
separate temporary directory. All three source hashes were checked against
the local Git objects before execution as the observer service account.
The deployed runtime and raw evidence were not changed or restarted.
The verifier recomputed the complete summary and checked the raw SHA-256,
sequence, sample outcomes, duration, coverage, readiness, and spacing.
This is independent recomputation, not review by an independent organization.

## Post-soak host preflight

- Captured: `2026-09-04T10:42:03.805Z`.
- Schema: `GrantM1HostPreflight@0.2.0`; ready: true; all 14 checks true.
- Runtime: `44031a66466e48fce5e1e93a86a7d48867edf134`.
- Node: `v22.17.0`; manifest: 180 files verified.
- Evidence SHA-256: `b881c124598cf7b89d4991a80075956b1453a4b28705432889c20ff630938081`.
- Clock, key metadata, runtime, systemd unit, active/enabled service,
  exclusive loopback binding, and disk floor passed.
- Raw and summary files were mode 0600, owned by the service account.
- At the closure check, readiness reported deliveredCount 2 and queuedCount 0.

No private key content was read. These are host/transport qualification
samples, not signed Solana transaction observations for the grant KPI.

## Remaining admission work

Preserve/export the evidence bundle, reconcile provider/region/ASN and upstream
overlap limitations, update the admission contracts and status documents
together, run the full verification and secret audit, and complete PR review/CI
before formal admission and any Observer C provisioning. The successful soak
does not need to be repeated unless a later gate reveals invalid evidence or
a material runtime change requires requalification.
