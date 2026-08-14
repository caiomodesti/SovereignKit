# Sprint 8 reproduction

## Requirements

- Node.js 22.17.0
- pnpm 11.16.0 through Corepack
- the committed Sprint 3, Sprint 5, and Sprint 7 fixtures

## Build the evidence dataset and dashboard

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile
corepack pnpm@11.16.0 --filter @sovereignkit/dashboard build
```

The static production artifact is written to `apps/dashboard/dist`. The data
adapter regenerates `apps/dashboard/public/dashboard-data.json` before every
build.

## Run locally

```powershell
corepack pnpm@11.16.0 --filter @sovereignkit/dashboard dev
```

Open the local URL printed by Vite. Select each scenario and confirm:

- `HEALTHY`: A/B/C healthy and no controlled findings;
- `DEGRADED`: route A degraded, B/C healthy;
- `ASYMMETRIC`: route A asymmetric, B/C healthy;
- `INSUFFICIENT_DATA`: A/B/C insufficient data.

The committed intelligence snapshot should display `STALE` after
`2026-08-14T00:01:00.000Z`.

## Verify the complete Sprint 8 contract

```powershell
corepack pnpm@11.16.0 verify:sprint-8
corepack pnpm@11.16.0 test:coverage
```

The verifier checks data provenance, required outcomes, failover semantics,
source-file presence, exact measurement preservation, the production artifact,
and forbidden epistemic claims.
