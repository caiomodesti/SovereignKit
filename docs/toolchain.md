# Reproducible Toolchain

SovereignKit never uses `latest` in a committed environment contract.

## Sprint 1 pins

| Component | Version | Source of pin |
|---|---:|---|
| Node.js | 22.17.0 | `.tool-versions`, `mise.toml`, `package.json#volta` |
| pnpm | 11.16.0 | `.tool-versions`, `mise.toml`, `packageManager`, Volta |
| TypeScript | 7.0.2 | exact lockfile dependency |
| Vitest | 4.1.10 | exact lockfile dependency |
| @solana/kit | 7.0.0 | exact package dependency |
| Rust | 1.97.1 | `.tool-versions`, `mise.toml` |
| Agave/Solana CLI | 4.0.0 | `.tool-versions`, `SOVEREIGNKIT_AGAVE_VERSION` |

Node 22 is an LTS line and is the runtime that executes project scripts in the current Windows environment. Package engines permit Node 24 so pnpm's bundled installation runtime can operate, while Volta/mise pin the canonical development runtime exactly.

## Validation

```text
pnpm env:doctor:core  # Node, pnpm, manifest pins
. scripts/use-pinned-toolchain.ps1
pnpm env:doctor       # also Rust and Agave/Solana CLI after local activation
```

The full doctor intentionally fails if Rust or Agave is absent or mismatched. Sprint 1 unit tests do not require them; the first live local-validator experiment will.

## Upgrade policy

1. Verify the target release in official upstream sources.
2. Record the reason, compatibility impact, and rollback in a new ADR.
3. Update every pin and the lockfile in one change.
4. Run doctor, build, tests, coverage, timeline examples, and any live validator suite.
5. Never silently regenerate data under a new `measurement_version` or toolchain.
