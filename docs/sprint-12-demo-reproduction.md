# Sprint 12 read-only demo reproduction

The demo is a static projection of accepted evidence. It never generates a
classification in the browser and does not call a live collector, proxy, feed,
or Solana RPC.

## Local reproduction

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile
corepack pnpm --filter @sovereignkit/dashboard build
corepack pnpm --filter @sovereignkit/dashboard dev
```

Open the local URL printed by Vite, then:

1. Replay HEALTHY and verify all route classifications remain healthy.
2. Advance to DEGRADED and verify both route-a class rates move together.
3. Advance to ASYMMETRIC and verify route-a control is 100%, PROGRAM_X is 0%,
   and the experimental policy reports ASYMMETRIC.
4. Inspect confirmed failover: the first route rejects, the fallback is
   acknowledged, and a separate quorum confirms it.
5. Open the Devnet proof in Solana Explorer and verify the retained signature.
6. Expand provenance and trace every displayed section back to a committed
   accepted source file.

## Full release gate

```powershell
corepack pnpm verify:sprint-12
corepack pnpm audit --prod --json
```

The first command rebuilds, typechecks, runs deterministic tests, verifies
controlled and Devnet fixtures, reproduces the Sprint 11 report, scans tracked
files for secret signatures, and runs locked Rust tests. The online npm audit is
kept separate because its advisory database can change without a source commit.

