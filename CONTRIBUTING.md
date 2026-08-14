# Contributing to SovereignKit

SovereignKit treats methodology as part of the product. A code change can be locally correct and still invalidate an experiment if it silently changes a comparable unit, route, commitment, or observation rule.

## Before opening a change

1. Read [the methodology](docs/methodology.md) and [epistemic limits](docs/epistemic-limits.md).
2. Identify whether the change affects implementation only or changes a normative contract.
3. Add or amend an ADR before changing a frozen methodological decision.
4. Preserve raw evidence; derived views must remain reproducible from accepted inputs.

## Local verification

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

Run the relevant sprint verifier when changing a component with committed fixtures. Live validator tests require the pinned toolchain documented in [docs/toolchain.md](docs/toolchain.md).

## Non-negotiable review checks

- `RPC_ACKNOWLEDGED` is never treated as landing.
- Submission-route evidence does not replace independent observation.
- Matched comparative units never reuse the same signed transaction.
- Commitments and send/preflight configuration do not drift silently.
- Observer signatures and idempotency identifiers are validated before ingestion.
- Classification uses measurements, not hidden scenario labels or proxy configuration.
- Stale or unavailable route intelligence fails open to local policy.
- New claims name their evidence boundary and residual limitations.

## Pull requests

Keep changes scoped, link the relevant contract or ADR, list verification commands, and state whether fixtures or accepted claims changed. Do not commit secrets, local keypairs, validator ledgers, dependency caches, or unbounded raw run artifacts.

