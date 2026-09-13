# Rehearsal dispatch integration (local component checkpoint)

The prepared-dispatch module binds an existing submission job to one scheduler
slot and signs it using the existing ObservationAssignment implementation. The
worker verifier checks the signature before an injected transport is called.
Local tests use ephemeral authority keys, synthetic submissions and synthetic
readers. They do not load operational private keys or call Devnet.

The outbox reserves a slot on disk before delivery. Reopening the same slot,
including after an ambiguous transport failure, returns
`RECONCILIATION_REQUIRED`. It cannot silently resend. Receipts must identify the
same assignment ID and payload hash and now require an Ed25519 signature from the
assigned observer key. The coordinator verifies observer identity, key identity,
timestamp, hash and signature before recording transport acknowledgement. A
receipt still does not prove Collector acceptance or grant qualification. An
interrupted reservation is retained for investigation. These tests cover process
restart, not power loss.

Dispatch requires an explicit rehearsal approval matching the schedule hash and
time interval. This library input is supplied by its caller; it is not a signed
operator-approval system. The live-run loader now binds the operator's exact
authorization text, schedule hash, source commit, validity interval and three
captured observer sequence bases. The production slot CLI and wall-clock loop
are implemented locally but remain undeployed. Real submission metadata still
needs live evidence and reconciliation. Do not use a synthetic receipt as
evidence of a real submission.

The RPC gate serializes reservations at 20 CU per supported call, at most three
reservations in any rolling second. Persistence completes before the operation
starts. Calls with failed/ambiguous outcomes are never refunded. Restore checks
the owner and configured total limit. Persistence failure stops further calls.
The persistence adapter must durably store the exact state; tests use an in-memory
adapter. Each owner must have one exclusive gate and all its calls must use it.
It is not safe to create separate gates for each worker or each reader.

Four exclusive owners limited to 60 CU/s each would allocate at most 240 CU/s
to this application. This remains conditional until every submission, poll and
health check is routed through the gate; unrelated account traffic also counts.
In-flight reservations remain occupied until one second after completion. Slow
persistence or transport therefore cannot release reservations before delayed
calls start. Restored in-flight reservations require reconciliation; they never
expire automatically.
The total limit per owner is capped at 2 million CU in this component, not an
approval to consume that amount. Monthly reset still needs integration and
account quota revalidation. The local append-only journal in
`scripts/lib/grant-m2-rpc-budget-journal.mjs` provides one exclusive per-owner
process lock, syncs every state transition and fails closed on a partial record
or stale lock. It is tested locally but is not installed on the observer hosts.
Unknown RPC methods are rejected rather than assigned an invented cost.

## Unresolved live-contract issues

- Precommitment v0.2 now distinguishes experiment phase `public_pilot` from the
  schema-valid result `unit.phase` value `healthy`. The isolated rehearsal uses
  an explicitly separate experiment ID and this frozen mapping.
- The dry-run slot-selection tolerance is one second. The local dispatch adapter
  proposes a separate ten-second deadline to finish preparation and delivery after
  slot selection. These timing choices require a single reviewed live manifest.
- The existing qualified M1 worker remains unchanged. The separate M2 entrypoint
  `scripts/run-grant-m2-observation-worker.mjs` now wraps only the Alchemy reader
  with the shared per-host gate and durable journal. It is locally tested but is
  not staged or installed on any observer host.
- Observer sequences are now reserved before signing in an append-only,
  per-observer exclusive journal. A repeated slot or abandoned lock requires
  reconciliation and cannot allocate a replacement sequence. This is locally
  tested but not deployed. Each rehearsal slot now also has a write-once state
  journal. It records a prepared transaction before submission, records a
  successful RPC acknowledgement before assignment signing, and permanently
  marks ambiguous outcomes for reconciliation instead of retrying.

- The Devnet submission helper uses a unique slot-bound Memo transaction,
  confirmed blockhash and preflight, `skipPreflight=false`, and `maxRetries=0`.
  Preparation and submission are separate calls so signed bytes can be durably
  recorded before the network side effect. The slot runner binds the resulting
  provenance to the frozen schedule and the observer sequence. It is locally
  tested. The production slot CLI and three-host transport adapter are now
  implemented and locally tested; they remain undeployed and unused on Devnet.

The tests reuse the actual worker with synthetic readers and also cover absent
approval, signature alteration, late dispatch, concurrent dispatch, receipt
mismatch, ambiguous delivery, quota restoration and persistence failure. None
of these tests starts a real rehearsal or Milestone 2.

The observer-side write-once inbox is implemented separately in
`scripts/lib/grant-m2-assignment-inbox.mjs`. It validates the coordinator
signature and target observer before claiming an assignment directory, then
syncs both the prepared-dispatch envelope and the worker-facing assignment,
followed by the signed receipt. Concurrent or repeated delivery,
and any directory left after interruption, require reconciliation. The CLI is
prepared locally. A hardened, assignment-bound and quota-bound systemd unit is
also staged in source. The no-overwrite host installer and SSH/gcloud adapters
exist locally, but no host deployment has occurred at this checkpoint.

The orchestrator waits for every fixed offset and for the complete 3,600-second
interval. It records host-signed receipts, worker completion and raw evidence.
Any uncertain submission, delivery or worker outcome stops the run without an
automatic retry. Installation leaves the worker template unstarted. None of
these controls starts Milestone 2 or the official fourteen-day window.

`scripts/stage-grant-m2-rehearsal-runtime.mjs` creates an ignored, inert runtime
under `artifacts/` from a clean tracked commit. Its manifest hashes the closed
file set and explicitly records that credentials, activation units, rehearsal
authorization and M2 activation are absent. Staging does not install dependencies,
copy secrets, contact a host or start a service.

The isolated-package smoke test uses `GRANT_M2_WORKER_SCRIPT` to execute the
staged worker against a loopback JSON-RPC server. This proves lockfile install,
module resolution, worker execution and quota journaling without Devnet access.
