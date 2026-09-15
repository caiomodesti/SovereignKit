# M2 official replacement-window preflight — 2026-09-15

Status: immediate preflight passed; replacement window not started.

The private PR #88 was merged as `8f0c3dee05b35b0dfcebd270f70857a137859a33`.
The Oracle Collector coordinator runtime was then replaced with source commit
`2cbb5bac687879c7825facef9cf8a12ab48aa668`. The previous runtime remains at
`/opt/sovereignkit-m2-coordinator.backup-b453d9445489d6753a84546709641ab20895c486`,
and both runtime manifests were re-read remotely. The coordinator service
remained inactive and disabled throughout.

The final zero-transaction transport probe completed at
`2026-09-15T00:19:06.163Z`. AWS, Google Cloud and Oracle Cloud each returned a
signed receipt. The downloaded probe file matched the remote SHA-256
`5c274fbf084990cd0a7c6a4229f8c2ee69dd237a11da380ae2362fbc85c112da`.
No worker or official window was started, and the preserved interrupted-run
state remained 487 files with aggregate SHA-256
`6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73`.

The complete preflight was captured at `2026-09-15T00:19:10.354Z` and passed
`GrantM2OfficialPreflight@0.2.0` with SHA-256
`edd031001adea725658e0fe80dae19fcecf2e7b89fe1f347ce0128d37f6df15c`.
The authenticated Alchemy dashboard showed 4,930 of 30,000,000 CUs used,
leaving 29,995,070 CUs. The Devnet fee payer held 90,595,000 lamports. All
observer queues were empty, all monitor timers were active, and all official
worker counts and quota-journal file counts were zero.

The Google observer passed the frozen 512 MiB memory floor with 546,643,968
bytes available, but this is a narrow operational margin. This is not a schema
failure and does not invalidate the recorded preflight; it is retained as a
launch-risk note for the next operator decision.

This record does not bind a replacement run, authorize activation, start the
official coordinator, or declare Milestone 2 complete. A later start requires
a fresh immediate preflight and a new explicit authorization tied to that
replacement window.
