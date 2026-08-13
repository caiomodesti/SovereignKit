# Sprint 5 reproduction

## Pinned environment

- Rust 1.97.1
- Agave/Solana CLI and `cargo-build-sbf` 4.0.0
- Node 22.17.0
- pnpm 11.16.0
- `@solana/kit` 7.0.0
- Windows local validator exception from ADR-016 and ADR-017

ADR-017 is required on this Windows host because the stock local build crashes
while serializing its hard-coded slot-100 snapshot, before a recent blockhash
can expire. The Sprint 5 validator reports Agave 4.0.0 and has SHA-256:

```text
B316C23BB115299CC8A367F2813711E21E2147D091F0674314712FD3D5BA55AC
```

Snapshots are outside the experiment claim; block production, RPC, SVM,
transaction status, ledger observation, and blockhash ageing remain real.

## Build and prove program equivalence

```powershell
$env:CARGO_HOME=(Resolve-Path '.tools\cargo').Path
& .\.tools\agave\4.0.0\solana-release\bin\cargo-build-sbf.exe `
  --manifest-path programs\matched-probe\Cargo.toml --offline
& .\scripts\run-sprint-5-program-proof.ps1
```

Expected: 3/3 Rust host tests, one live Vitest, ten matched pairs, twenty unique
signatures, 238 serialized bytes, and 510 CU for both classes.

## Run the four-scenario experiment

```powershell
& .\scripts\run-sprint-5-controlled-experiment.ps1
```

The script compiles the SBF binary, starts the allowlisted loopback validator,
preloads the project-owned program, executes 600 signed statistical units, and
writes raw, derived, and summary evidence. The accepted run is
`20260812T164539Z`.

Expected classifications in route order A/B/C:

- healthy: `HEALTHY, HEALTHY, HEALTHY`;
- degraded: `DEGRADED, HEALTHY, HEALTHY`;
- asymmetric: `ASYMMETRIC, HEALTHY, HEALTHY`;
- insufficient_data: `INSUFFICIENT_DATA` for all routes.

## Rebuild and verify persisted evidence

```powershell
corepack pnpm verify:sprint-5
```

This verifies all 600 observer signatures, re-runs
`ClassificationPolicyV0Experimental` from the stored definition and
measurements only, and requires the Markdown, canonical JSON, and CSV summaries
to match byte for byte.

## Quality gates

```powershell
corepack pnpm check
corepack pnpm test
corepack pnpm test:coverage
```

Accepted deterministic result: 48/48 tests. Global coverage is 89.48% statements,
80.57% branches, 97.87% functions, and 95.30% lines. Analysis coverage is
93.79% statements, 86.02% branches, 98.03% functions, and 97.97% lines.

