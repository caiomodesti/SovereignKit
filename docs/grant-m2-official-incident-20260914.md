# M2 official window interruption — 2026-09-14

Status: stopped; acceptance-blocking continuity breach. This record does not
declare Milestone 2 complete and does not authorize or start a replacement
window.

## What happened

The frozen window started at `2026-09-14T16:31:00.057Z`. The coordinator
successfully prepared and submitted each due Devnet transaction, then copied
the prepared assignment and public assignment-authority document to the target
observer. The copied files retained restrictive ownership for the SSH login
user. The receiving process ran as `sovereignkit`, could not read either file,
and exited before creating a receipt or starting a worker.

The same failure occurred on AWS, Google Cloud and Oracle Cloud. After 10
cycles, the append-only journal contained 60 `MISSING` records: 20 per observer
and 30 per route. There were 0 qualifying, rejected or invalid units.

## Safety response

- The coordinator was stopped and disabled.
- No backfill or automatic reset was performed.
- No official worker remained active.
- The original state tree was retained and archived deterministically as
  `artifacts/grant-m2-invalid-run-20260914.tar.gz`.
- Archive SHA-256:
  `edbcd715d55e4e305c7ded658c5885ff27990326c8374cd908d0322a2224be3b`.
- The operator received a simplified Telegram incident summary.

The interruption exceeded both the frozen two-cycle and one-hour continuity
limits. This window is therefore not acceptance-eligible even though the
remaining numerical capacity could have exceeded 3,000 units.

## Root cause and required correction

SSH connectivity alone was an insufficient preflight. It proved that the
Collector could reach each host but did not prove that the `sovereignkit`
identity could read the transported files.

The corrected transport must, in this order:

1. copy the prepared assignment and public authority document;
2. set owner/group to `sovereignkit:sovereignkit`;
3. set mode `0600`;
4. prove readability as `sovereignkit`;
5. invoke the signed assignment receiver.

Before any replacement window, all three observers must pass the same complete
transport path with a synthetic signed assignment, 0 Devnet transactions and 0
workers. The immediate preflight schema now requires that transport-probe gate.
A replacement 14-day window still requires a separate explicit authorization.

## Correction verification

Commit `2cbb5bac687879c7825facef9cf8a12ab48aa668` was installed as an
inactive parallel coordinator runtime. At `2026-09-14T21:59:57.631Z`, the
complete corrected transport path returned signed receipts from AWS, Google
Cloud and Oracle Cloud. The probe submitted 0 transactions, started 0 workers
and did not start an official window.

The interrupted run remained at 487 files and its deterministic aggregate
SHA-256 remained
`6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73`
before and after the probe. This proves the corrected transport path only; it
does not make the interrupted window eligible, pass a new immediate preflight,
or authorize a replacement window.
