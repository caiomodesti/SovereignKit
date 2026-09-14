# M2 official cloud coordinator

Status: implemented but not activated. This document does not declare that the official fourteen-day window has started.

## Purpose

The coordinator runs on the Oracle Collector host so the official M2 window does not depend on an operator PC. It uses the frozen schedule, executes at most one assignment per due slot, and accounts for every planned unit without backfill.

The service is intentionally split into two gates:

1. `install-grant-m2-official-coordinator.sh` installs an inactive systemd unit and an empty state directory. It does not install credentials, enable the service, start the service, start a worker, or start M2.
2. An operator separately installs the root-owned configuration and credentials, validates the immediate preflight, enables the durable service, proves restart and single-writer behavior while the run is still waiting, and only then leaves it armed for the frozen start time.

## Safety invariants

- `/usr/bin/flock --nonblock` permits exactly one coordinator writer.
- `Restart=on-failure` and systemd enablement provide host-local restart durability.
- Each transaction preparation and submission uses the existing write-once slot side-effect journal.
- Transport and worker start reservations are persisted before the corresponding external side effect.
- A transaction submission is never retried automatically after an ambiguous outcome.
- An assignment transport or worker start with an ambiguous outcome is reconciled only from immutable remote evidence. It is not blindly repeated.
- A missed slot becomes `MISSING` with `MISSED_WITHOUT_BACKFILL`.
- A non-reconcilable side effect becomes `INVALID` with an explicit reason.
- A unit becomes `QUALIFYING` only after raw-to-derived recomputation, observer-signature verification, an original `ACCEPTED` delivery receipt, and an exact matching signed result in the Collector durable log.
- Ending the window never declares grant acceptance automatically.

## Runtime paths

- Code: `/opt/sovereignkit-m2-coordinator`
- Node runtime: `/usr/local/bin/node` (the pinned Node 22.17.0 installation used by the Oracle Collector host)
- Configuration: `/etc/sovereignkit/m2-official-coordinator.json`
- Mutable state: `/var/lib/sovereignkit/m2/official`
- Single-writer lock: `/run/sovereignkit-m2-coordinator/coordinator.lock`
- Collector durable log: `/var/lib/sovereignkit/evidence/accepted.jsonl`

The configuration points to private files under `/etc/sovereignkit/secrets`; those files are never included in the staged runtime package or evidence bundle.

## Notifications

Telegram is best-effort and cannot stop the coordinator. Messages are sent only for the official start, the first missing or invalid slot, one simple daily summary, a fail-closed coordinator stop, and the official end. Daily messages include plain Portuguese counts for valid, missing, problematic, and remaining units.

## Immediate preflight gate

Before activation, the operator must revalidate the exact source commit on the coordinator and all three observers, Collector TLS/readiness/durable log, zero observer queues, zero official workers, empty official quota journals, NTP and clock offsets, memory and disk, fee-payer balance, and authenticated Alchemy free-quota headroom.

Each observer must also pass a zero-transaction transport probe using the same
`scp -> chown/chmod -> sovereignkit receiver` path as the official coordinator.
Checking SSH connectivity alone is insufficient because it does not prove that
the service identity can read the transported assignment and authority files.
The immediate preflight must embed the probe evidence, bound to the exact
runtime commit and captured no more than 15 minutes earlier, including all
three signed-receipt hashes and explicit zero transaction/worker counters.

The coordinator-specific gate is true only after all of these are demonstrated while the run is still not started:

- the packaged runtime verifies against its manifest;
- the configured service is active and waiting for a future frozen start;
- a controlled service restart returns to active waiting state;
- a second concurrent process is rejected by `flock`;
- the service is enabled for reboot recovery;
- the journal contains no `WINDOW_STARTED` event and all observer worker counts remain zero.
