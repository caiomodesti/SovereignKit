# ADR-014: Pinned reproducible toolchain

- Status: Accepted
- Date: 2026-08-11

## Decision

Pin exact canonical Node, pnpm, Rust, Agave, TypeScript, Vitest, and Solana Kit versions. Provide `pnpm env:doctor`; upgrades require an ADR and complete verification.

## Consequences

Environment drift becomes visible. Developers without Rust/Agave can run Telemetry Core unit tests but cannot claim the full local-validator environment is ready.
