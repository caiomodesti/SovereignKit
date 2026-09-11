# M2 scheduler: local dry-run checkpoint

Status: `LOCAL_DRY_RUN_IMPLEMENTED`; no live dispatch adapter or timer installed.

The scheduler builds twelve slots for two 30-minute cycles. Each cycle uses the
observer/route mapping and offsets 0, 20, 40, 60, 80 and 100 seconds from the quota
proposal. A proposed one-second lateness allowance prevents replaying missed
slots in a burst. This local allowance is not an amendment to the frozen pilot
contract and must be reviewed before live integration.

Each invocation processes a supplied UTC timestamp, persists an immutable tick
record, and exits. It does not wait for wall time, sign assignments, send
transactions, invoke SSH, call RPC, or start the rehearsal. All results carry
zero qualifying units. Passing this test is not proof of a real one-hour run.

The first call stores the exact schedule. Later calls must use the identical
schedule, replay and recompute every prior tick, and never repeat a consumed slot.
Late slots remain `MISSING`; in-time slots are `DRY_RUN_DUE`. A completed window
means only that the supplied simulated clock reached its end.

An exclusive lock rejects concurrent writers. On corruption, changed bindings,
backwards time or interruption, the lock and evidence remain in place for manual
inspection. There is no automatic lock reclamation, journal repair or backfill.
Files are flushed before lock release. This is a local process-restart check,
not a cross-filesystem power-loss durability claim.

Example (choose a new output directory for a new independent simulation):

```powershell
node scripts/run-grant-m2-scheduler-dry-run.mjs --dry-run rehearsal-simulation 2026-09-10T00:00:00.000Z 2026-09-10T00:00:00.000Z artifacts/grant-m2/rehearsal-simulation
```

Repeat with the same run ID, start and directory and a later tick timestamp to
exercise restart behavior. Repeating the same tick produces no duplicate slot.
The CLI rejects live mode and restricts output lexically to `artifacts/`; use
trusted local directories, not symlinks to evidence or external locations.

Before live operation, add a reviewed assignment/submission adapter, aggregate
RPC rate enforcement covering polls and health checks, and a real clock loop.
Submission outcome ambiguity after a crash must be reconciled, not retried as
a new unit. Bind the resulting runtime/configuration to a new approved run
manifest. The existing 240 CU/s quota number remains a model assumption, not a
measured or enforced rate. Rehearsal and official-window authorization remain
separate gates.
