# Sprint 3 Live Failover Reproduction

## Preconditions

- Windows PowerShell;
- project dependencies installed from `pnpm-lock.yaml`;
- patched Agave/Solana CLI 4.0.0 validator at `.tools/agave/4.0.0-patched/bin/solana-test-validator.exe`;
- validator SHA-256 `9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406`.

The Windows source-build exception and patch provenance are documented in ADR-016 and the Sprint 1.5 reproduction record.

## Command

From the repository root:

```powershell
& .\scripts\run-sprint-3-live-proof.ps1
```

To intentionally replace the committed canonical fixture with the new successful run:

```powershell
& .\scripts\run-sprint-3-live-proof.ps1 -UpdateFixture
```

The script creates a fresh temporary ledger, starts the validator on `127.0.0.1:8899`, waits for health, typechecks the integration, runs the live test, saves logs/manifest under `artifacts/sprint-3/runs/<run-id>/`, and stops the validator in a `finally` block.

## Expected proof

- `HEALTHY=True`;
- `TEST_EXIT_CODE=0`;
- one controlled primary `RPC_REJECTED`;
- one fallback `RPC_ACKNOWLEDGED` with `landing: false`;
- quorum `CONFIRMED` or `FINALIZED` from at least two of three distinct reader clients;
- two unique visited route IDs and exactly two attempts;
- a real transaction signature;
- finalized recipient balance of 1,000,000 lamports.

The canonical evidence is [the router failover fixture](../fixtures/integration/agave-4.0.0/router-failover/router-evidence.json). The primary rejection occurs at the adapter boundary, not through a network proxy; that limitation is resolved only by Sprint 4.
