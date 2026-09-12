# Grant Milestone 2 preparation status

Status: `PRECOMMITMENT_FROZEN_NOT_AUTHORIZED`

Milestone 1 is accepted and the Collector administrative binding is
reconciled. Milestone 2 has not started. The experiment, observer/runtime set,
two-route set, cadence, protocol versions, qualification rules and interruption
policy are frozen in `deploy/grant-pilot/m2-pilot-precommitment.json`. The
canonical readiness contract is `deploy/grant-pilot/m2-pilot-readiness.json`;
its validator deliberately passes only when the remaining evidence and
authorization blockers stay visible.

## Reader deployment checkpoint (2026-09-10)

Local scheduler preparation now exists in `scripts/lib/grant-m2-scheduler.mjs`.
It tests the proposed offsets with a persistent, exclusive dry-run journal,
explicit missing slots and restart checks. It has no live dispatch adapter or
timer. See `docs/grant-m2-scheduler-dry-run.md` for the scope and reproduction.

The local signed-dispatch and RPC-budget components are now tested against the
existing observation worker with synthetic readers. Their scope and remaining
live integration issues are in `docs/grant-m2-dispatch-integration.md`.
Precommitment v0.2 explicitly maps the experiment phase `public_pilot` to the
schema-valid result unit phase `healthy`, and hash-binds the three-host reader
deployment plus the pending quota estimate. Deployed workers do not yet share
the quota gate, so the rehearsal runtime is not ready.

The approved reader replacement is installed on AWS, Oracle and Google.
All three registry hashes match; previous registries are retained as private
on-host backups and services remained active. Evidence is recorded separately
in `fixtures/grant-m2/reader-deployment-20260910.json`. The original proposal
JSON remains a historical proposal, not a current deployment record. Credentials
were reused inside each host rather than transferred from the workstation.
Two logical readers share the Solana Public upstream; the quorum is not evidence
of independent upstream witnesses. No M1 evidence was replaced.

Offsets remain proposed, not installed or activated in a scheduler. Their
throughput estimate still needs runtime enforcement and measurement including
health checks and scheduling jitter. Rehearsal, quota and official-window gates
remain pending; a method-availability check is not signed ledger evidence.

## Frozen acceptance floor

- Solana Devnet only.
- At least 1,209,600 seconds of real operation (14 days).
- At least 3,000 qualifying signed observations.
- Participation from all three accepted observers and every frozen route.
- Missing, rejected and excluded units remain visible.
- No retroactive rule changes, silent exclusions or duplicate KPI counting.
- Any unresolved evidence-integrity failure blocks acceptance.

The frozen set uses Alchemy and Solana Public Devnet routes, three accepted
observers and `MATCHED_CONTROL` only. A 30-minute cadence produces 672 planned
cycles and 4,032 units over 14 days, 1,032 above the grant minimum. Comparative
classification is disabled: this pilot does not silently extend the controlled
`PROGRAM_X` equivalence claim. Failed Ankr, ExtrNode and OnFinality candidate
preflights are retained in
`fixtures/grant-m2/route-candidate-preflight-failures-20260909.json`.

## Rehearsal checkpoint (2026-09-12)

The authorized rehearsal ran for exactly 3,600 seconds and remained separate
from grant KPI evidence. Across all controlled attempts it used the full ceiling
of 12 unique Solana Devnet submissions: 11 have complete worker `FINALIZED`
evidence and one acknowledged submission remains explicitly unobserved after a
fail-closed transport incident. The final nine-unit continuation covered all
three observers and both routes, and its 15 raw polls reconcile to the nine
derived results. The rehearsal contributed zero grant units and did not start
Milestone 2. Sanitized evidence is in
`fixtures/grant-m2/rehearsal-execution-20260912.json`.

## Current blockers

1. Deploy and prove the live alert sampler and Telegram delivery path, including
   the constrained Google memory headroom.
2. Obtain operator confirmation that the post-rehearsal Telegram message was
   actually received.
3. Refresh host capacity and authenticated Alchemy quota immediately before the
   proposed start.
4. Obtain separate explicit authorization for the official window.

The original quota estimate remains frozen at
`deploy/grant-pilot/m2-resource-quota-estimate.json`. It budgets all 4,032
units at the maximum 25 reader polls, three per-observer minute health checks,
Alchemy submission/blockhash calls and a 10% contingency. The resulting
5,854,464 CU upper estimate remains below the observed 30,000,000 CU account
ceiling. Fixed 20-second unit offsets keep the computed Alchemy
burst at 240 CU/s below the observed 300 CU/s ceiling. This is an estimate and
does not approve quota, spending, the rehearsal or the official window.

The post-rehearsal authenticated capture at
`fixtures/grant-m2/resource-revalidation-20260912.json` records 3,730 CUs used,
29,996,270 remaining, and 24,141,806 remaining after the complete frozen upper
bound. It also recomputes host capacity, projected evidence storage and Devnet
fee-payer headroom. That evidence passes a deterministic validator, but still
requires an immediate pre-start refresh because provider quota and host
resources are time-sensitive.

The remaining configuration decision is recorded without deployment at
`deploy/grant-pilot/m2-reader-topology-proposal.json`. OnFinality currently
returns HTTP 429 for the essential signature-status method. The recommended
zero-cost replacement uses a second distinct logical Solana Public reader
client. The two public clients share one upstream and therefore have correlated
failure; they are not two independent witnesses. No observer configuration has
been changed at the proposal capture; see the later deployment checkpoint above.

Backup integrity, rehearsal transaction accounting and append-only incident-log
validation are implemented in `scripts/lib/grant-m2-operational-controls.mjs`.
The rehearsal repeated the backup/restore flow against Oracle evidence retained
privately on AWS and reconciled all 12 submitted transaction identities without
rewriting the acknowledged-but-unobserved transaction. Daily official-window
summaries remain unstarted because the official window has not begun.

The restricted AWS destination now exists with service-identity-only access.
At capture its available storage was above the frozen alert floor and the
existing Observer remained active and enabled. A bounded Collector snapshot was
then transferred from Oracle, retained on AWS and restored byte-for-byte with
matching SHA-256, 55,872 bytes and 21 complete JSONL records. Temporary staging
copies were removed. This preflight proves the mechanism and separate location;
the rehearsal must repeat it against its own export. The sanitized evidence is
hash-bound from the rehearsal plan.

The frozen alert thresholds and deterministic evaluator are in
`deploy/grant-pilot/m2-alert-policy.json` and
`scripts/lib/grant-m2-alert-policy.mjs`. Disk, clock, service/readiness,
delivery backlog and RPC quota detection are `IMPLEMENTED_NOT_PROVEN`.
The private Telegram destination is configured, the primary operator is
assigned, and a synthetic message was accepted by Telegram and confirmed by
the operator. Sanitized evidence is hash-bound from the alert policy at
`fixtures/grant-m2/telegram-delivery-test-20260909.json`; the token and chat
identifier remain in the ignored `.secrets` directory. Live host alert
evaluation and automatic delivery remain `IMPLEMENTED_NOT_PROVEN`.

The pre-start host monitor is now packaged separately at
`deploy/grant-pilot/m2-live-monitor-policy.json`. It samples every minute,
adds explicit 512 MiB warning and 384 MiB critical floors for available
memory, retains the frozen disk and clock thresholds, tracks observer service,
NTP synchronization, delivery backlog and each host's durable RPC budget, and
writes an append-only journal. Telegram notifications are emitted on alert
state changes, bounded reminders and recovery. A failed Telegram call remains
pending and is retried on the next sample. The package contains no credential
and its installer leaves the timer disabled until a live preflight succeeds.

All three observers were upgraded atomically to source commit `9a77fce` with
versioned rollback copies retained. The first three-host preflight exposed that
AWS and Oracle use Chrony rather than systemd-timesyncd for clock offset
reporting. The monitor was corrected to fail over explicitly to Chrony, covered
by tests, repackaged and redeployed. AWS, Google and Oracle then each completed
a pair of consecutive real, secret-free samples with healthy service and NTP
state, zero delivery backlog, no alert and at least 96.8% local RPC budget
remaining. No observation worker was started. Sanitized
evidence is in
`fixtures/grant-m2/live-monitor-deployment-20260912.json`.
The credential installation, three-host synthetic alert/recovery check and
timer activation were executed through `scripts/deploy-grant-m2-live-monitor.ps1`
after the operator's explicit authorization.
The script validates the local configuration without printing it, installs it
with root/service-group ownership, emits only sanitized evidence and refuses to
activate a timer until alert and recovery delivery pass on every host. Three
alerts and three recoveries were accepted by Telegram. The credentials are
`0640`, owned by `root:sovereignkit`, and are not present in sanitized
evidence. Each timer then completed two scheduled healthy samples, remained
active and started no observation worker. Activation evidence is in
`fixtures/grant-m2/live-monitor-activation-20260912.json`.

A separate current-state checkpoint now binds the completed rehearsal, resource
revalidation, frozen precommitment and three-host monitor preflight without
rewriting the historical canonical readiness contract. It records thirteen proven
controls, including the refreshed SSH allowlists, common runtime deployment and
three-host secret-free preflight, alert delivery and scheduled monitor samples.
It retains three explicit start gates: operator alert receipt, immediate
pre-start refresh and separate official-window authorization. See
`fixtures/grant-m2/prestart-readiness-20260912.json`. Its validator rejects
altered hashes, relabeling the acknowledged-but-unobserved rehearsal
transaction, hiding a remaining gate or claiming that Milestone 2 started.

The executable rehearsal contract is prepared at
`deploy/grant-pilot/m2-rehearsal-plan.json`. It fixes a one-hour run with two
30-minute cycles and 12 expected units across all accepted observers and frozen
routes. It requires external backup-location evidence, a real notification
delivery receipt, complete unit accounting and post-run readiness. Its status
is `PLANNED_NOT_AUTHORIZED`; it neither contributes to the grant KPI nor starts
Milestone 2. This frozen planning artifact remains unchanged; the separate
write-once live-run manifest records the received authorization and exact
execution interval.

Preparation verification:

```powershell
corepack pnpm verify:grant:m2:preparation
```

A pass means the safety contract and blockers are represented correctly. It is
not pilot readiness, rehearsal evidence, authorization to spend, or the start
of Milestone 2.
