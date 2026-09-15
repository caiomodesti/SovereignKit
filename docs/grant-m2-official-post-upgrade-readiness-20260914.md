# M2 official post-upgrade readiness — 2026-09-14

Status: transport passed; immediate preflight pending. This record does not
authorize or start a replacement window.

The M2 host runtime at commit
`2cbb5bac687879c7825facef9cf8a12ab48aa668` was installed sequentially on
AWS, Google Cloud and Oracle Cloud. Each upgrade preserved the prior runtime at
`/opt/sovereignkit-m2-rehearsal.backup-b453d9445489d6753a84546709641ab20895c486`.
After each swap, the qualified observer remained active, the M2 monitor timer
was active and enabled, and no rehearsal or official worker instance existed.

A second complete transport probe finished at `2026-09-14T22:14:42.299Z`.
All three observers returned signed receipts. The probe submitted 0 Solana
transactions, started 0 workers and did not start an official window. The
interrupted state remained at 487 files and retained aggregate SHA-256
`6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73`.

The local second-probe record currently comes from the Collector's captured
stdout. A byte-identical copy of the remote evidence file and a fresh complete
preflight remain pending. The corrected coordinator is still installed only in
the inactive parallel path; replacing the original coordinator path requires a
separate controlled swap with its own backup. Therefore this document records
transport readiness only, not immediate-preflight success.
