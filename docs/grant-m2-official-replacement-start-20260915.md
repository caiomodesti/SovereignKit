# M2 official replacement window start — 2026-09-15

Status: running; the initial three cycles are qualifying. This record confirms
the start and an early health snapshot only. It does not declare the 14-day
window or Milestone 2 complete.

The exact operator authorization was bound to immediate preflight SHA-256
`77a7721ccfeccf8de8a50745e0ec1a6a9b4f73083c782c1d9915dbb07c82bcea`.
The replacement run `m2-official-replacement-20260915t011700000z` was armed in
an isolated state directory after proving that the interrupted 487-file state
tree remained unchanged at aggregate SHA-256
`6927da1cd611080dddf80feaee1973f4c58c339880f10ff9edccf12b3b02ec73`.

The append-only `WINDOW_STARTED` event was recorded at
`2026-09-15T01:17:00.041Z`, 41 milliseconds after the frozen start. Its
SHA-256 is
`a0ea5962bd8daf51bd0b03cfa26f44ed89745f1ca1b404cfe9038aaed541b892`.
The frozen end is `2026-09-29T01:17:00.000Z`; no backfill is permitted.

At `2026-09-15T02:24:32.279Z`, the journal contained one start event and 18
terminal slots across three complete cycles. All 18 were `QUALIFYING`: six per
observer and nine per RPC route. Every terminal record asserted successful
raw-to-derived recomputation, observer-signature verification and Collector
receipt binding. There were zero `MISSING`, `INVALID` or `REJECTED` slots.

AWS, Google Cloud and Oracle Cloud reported ready with empty queues, active and
enabled monitors, and no stuck official workers. Google retained the bounded
2 GiB swap with zero bytes used. The coordinator had no Telegram notification
failure record, so the start notification path completed without a recorded
delivery failure.

The acceptance target remains at least 3,000 qualifying units from 4,032
planned slots over the full real-time 14-day window. Early success is not a
forecast or guarantee: final acceptance still requires window completion,
continuity checks, immutable-evidence verification and semantic
reconciliation.
