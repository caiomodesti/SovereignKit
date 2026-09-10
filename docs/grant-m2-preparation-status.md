# Grant Milestone 2 preparation status

Status: `PREPARED_NOT_AUTHORIZED`

Milestone 1 is accepted and the Collector administrative binding is
reconciled. Milestone 2 has not started. The canonical pre-pilot contract is
`deploy/grant-pilot/m2-pilot-readiness.json`; its validator deliberately passes
only when the preparation remains blocked and all missing evidence is visible.

## Frozen acceptance floor

- Solana Devnet only.
- At least 1,209,600 seconds of real operation (14 days).
- At least 3,000 qualifying signed observations.
- Participation from all three accepted observers and every frozen route.
- Missing, rejected and excluded units remain visible.
- No retroactive rule changes, silent exclusions or duplicate KPI counting.
- Any unresolved evidence-integrity failure blocks acceptance.

## Proposed rehearsal

The proposed rehearsal is 3,600 seconds and is separate from grant KPI
evidence. It is not authorized and has not run. Its fixed pass criteria cover
all observers and routes, signature/schema verification, idempotent replay,
backup/restore, raw-to-derived count reconciliation and actual delivery of one
synthetic alert to an approved responder destination.

## Current blockers

1. Freeze the experiment, deployments, identities, routes, versions, cadence,
   qualification rules and interruption policy.
2. Obtain explicit authorization and run the bounded rehearsal.
3. Prove daily backup/restore to a separate location.
4. Prove cumulative/per-route counts and the append-only incident log.
5. Configure and test operational alerts and assign an offline responder.
6. Revalidate the 14-day resource estimate and obtain any required cost
   approval.
7. Obtain explicit authorization for the official window.

Preparation verification:

```powershell
corepack pnpm verify:grant:m2:preparation
```

A pass means the safety contract and blockers are represented correctly. It is
not pilot readiness, rehearsal evidence, authorization to spend, or the start
of Milestone 2.
