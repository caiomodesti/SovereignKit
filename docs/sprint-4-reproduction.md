# Sprint 4 Live Proxy Reproduction

## Preconditions

- Windows PowerShell;
- dependencies installed from `pnpm-lock.yaml`;
- patched Agave 4.0.0 validator at `.tools/agave/4.0.0-patched/bin/solana-test-validator.exe`;
- validator SHA-256 `9E9FD1C10BE90585039C1637F36FFCA360ADD8A6E7B1F64324E75B7E4708B406`.

The executable hash is authoritative. The patched Windows binary's displayed `src:` suffix is not used as identity because it has varied between invocations while the executable hash remained unchanged.

## Command

```powershell
& .\scripts\run-sprint-4-live-proof.ps1
```

To deliberately update the committed successful fixture:

```powershell
& .\scripts\run-sprint-4-live-proof.ps1 -UpdateFixture
```

The script creates a fresh ledger, starts Agave on loopback, runs integration typecheck and the live proxy test, saves logs/manifest under `artifacts/sprint-4/runs/<run-id>/`, and closes validator/proxies even on failure.

## Expected evidence

- validator health true and test exit code zero;
- real, distinct `MATCHED_CONTROL` and `PROGRAM_X` signatures;
- control forwarded through the selective proxy and confirmed;
- `PROGRAM_X` rejected by proxy error `-32098`;
- router attempts primary proxy once and direct fallback once;
- fallback transaction reaches independent logical 2/3 or stronger quorum;
- general schedule rejects both classes sharing one pair nonce;
- audit contains only pair-nonce hashes, never raw wire transactions.

Canonical evidence: [hostile proxy fixture](../fixtures/integration/agave-4.0.0/hostile-proxy/hostile-proxy-evidence.json).

Memo is an executable network-path fixture only. Do not use this run as statistical evidence for the project-owned `MATCHED_CONTROL`/`PROGRAM_X` program.
