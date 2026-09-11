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

## Proposed rehearsal

The proposed rehearsal is 3,600 seconds and is separate from grant KPI
evidence. It is not authorized and has not run. Its fixed pass criteria cover
all observers and routes, signature/schema verification, idempotent replay,
backup/restore, raw-to-derived count reconciliation and actual delivery of one
synthetic alert to an approved responder destination.

## Current blockers

1. Obtain explicit authorization and run the bounded rehearsal.
2. Repeat the proven backup/restore flow with the rehearsal export.
3. Prove cumulative/per-route counts and the append-only incident log.
4. Deploy the alert evaluator and Telegram delivery adapter on the live hosts.
5. Revalidate the 14-day resource estimate and obtain any required cost
   approval.
6. Obtain explicit authorization for the official window.

The quota revalidation now has a conservative reviewable estimate at
`deploy/grant-pilot/m2-resource-quota-estimate.json`. It budgets all 4,032
units at the maximum 25 reader polls, three per-observer minute health checks,
Alchemy submission/blockhash calls and a 10% contingency. The resulting
5,854,464 CU estimate plus current usage remains below the observed 30,000,000
CU account ceiling. Fixed 20-second unit offsets keep the computed Alchemy
burst at 240 CU/s below the observed 300 CU/s ceiling. This is an estimate and
does not approve quota, spending, the rehearsal or the official window.

The remaining configuration decision is recorded without deployment at
`deploy/grant-pilot/m2-reader-topology-proposal.json`. OnFinality currently
returns HTTP 429 for the essential signature-status method. The recommended
zero-cost replacement uses a second distinct logical Solana Public reader
client. The two public clients share one upstream and therefore have correlated
failure; they are not two independent witnesses. No observer configuration has
been changed at the proposal capture; see the later deployment checkpoint above.

Backup integrity, daily count reconciliation and append-only incident-log
validation are implemented in `scripts/lib/grant-m2-operational-controls.mjs`.
Their status is `IMPLEMENTED_NOT_PROVEN`: local byte equality does not prove a
separate backup location, and synthetic ledgers/incidents do not prove the live
deployment. Those controls move to proven only after the authorized rehearsal
retains external evidence.

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

The executable rehearsal contract is prepared at
`deploy/grant-pilot/m2-rehearsal-plan.json`. It fixes a one-hour run with two
30-minute cycles and 12 expected units across all accepted observers and frozen
routes. It requires external backup-location evidence, a real notification
delivery receipt, complete unit accounting and post-run readiness. Its status
is `PLANNED_NOT_AUTHORIZED`; it neither contributes to the grant KPI nor starts
Milestone 2.

Preparation verification:

```powershell
corepack pnpm verify:grant:m2:preparation
```

A pass means the safety contract and blockers are represented correctly. It is
not pilot readiness, rehearsal evidence, authorization to spend, or the start
of Milestone 2.
