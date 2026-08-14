# Sprint 9 reproduction

## Requirements

- Node.js 22.17.0
- pnpm 11.16.0 through Corepack
- accepted Sprint 5 asymmetric summary and raw ProbeResults

No validator or external network is required for the route-order fixture. The
real local submission, quorum, and failover path remains covered by the
accepted Sprint 3/4 integration proofs.

## Complete verification

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile
corepack pnpm@11.16.0 verify:sprint-9
corepack pnpm@11.16.0 test:coverage
```

`verify:sprint-9` performs the workspace build and typecheck, runs every
deterministic test, re-verifies the Sprint 7 snapshot fixture, and regenerates
the Sprint 9 retained routing projection.

## Expected evidence cases

The verifier must reproduce:

| Case | Selected order |
|---|---|
| Fresh `PROGRAM_X` | B, C, A |
| Fresh `MATCHED_CONTROL` | A, B, C |
| Fresh `PROGRAM_X`, local `maxRoutes=2` | B, A |
| Stale `PROGRAM_X` | A, B, C |
| No declared class | A, B, C |

Every case returns `CONFIRMED` from a logical 2/3 observation. The deterministic
submitter proves ordering integration, not new live-validator behavior.
