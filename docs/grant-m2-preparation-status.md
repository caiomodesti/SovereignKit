# Grant Milestone 2 preparation status

Status: `PRECOMMITMENT_FROZEN_NOT_AUTHORIZED`

Milestone 1 is accepted and the Collector administrative binding is
reconciled. Milestone 2 has not started. The experiment, observer/runtime set,
two-route set, cadence, protocol versions, qualification rules and interruption
policy are frozen in `deploy/grant-pilot/m2-pilot-precommitment.json`. The
canonical readiness contract is `deploy/grant-pilot/m2-pilot-readiness.json`;
its validator deliberately passes only when the remaining evidence and
authorization blockers stay visible.

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
2. Prove daily backup/restore to a separate location.
3. Prove cumulative/per-route counts and the append-only incident log.
4. Deploy the alert evaluator and Telegram delivery adapter on the live hosts.
5. Revalidate the 14-day resource estimate and obtain any required cost
   approval.
6. Obtain explicit authorization for the official window.

Backup integrity, daily count reconciliation and append-only incident-log
validation are implemented in `scripts/lib/grant-m2-operational-controls.mjs`.
Their status is `IMPLEMENTED_NOT_PROVEN`: local byte equality does not prove a
separate backup location, and synthetic ledgers/incidents do not prove the live
deployment. Those controls move to proven only after the authorized rehearsal
retains external evidence.

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
