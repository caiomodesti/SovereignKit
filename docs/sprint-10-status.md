# Sprint 10 status

Status: **IN PROGRESS — NOT ACCEPTED**

The Devnet validation contract and opt-in live harness exist. The complete static
verifier passes: build, workspace typecheck, 84/84 unit tests, and Devnet integration
typecheck. A real Devnet run still has to complete before this sprint can be accepted.

No Devnet result is currently claimed. No fixture is accepted merely because the
harness compiles or because an RPC acknowledges submission.

## Live attempts on 2026-08-14

1. Cluster read calls succeeded; the first faucet call failed with an internal JSON-RPC error.
2. After adding five bounded attempts and reducing the requested amount to 0.01
   Devnet SOL, the faucet returned HTTP 429. No experimental transaction was created.
3. The Solana Foundation faucet page recommends `devnet-pow` for agents. A pinned,
   workspace-local installation of `devnet-pow 0.1.4` was attempted. Its historical
   `ring 0.16` dependency requires `gcc.exe` for the current Windows GNU Rust target,
   but GCC is not part of the pinned toolchain. The installation stopped without
   changing the Rust target or installing a compiler silently.

The final blocked run is retained under
`fixtures/sprint-10/devnet-blocked-run-20260814T040134Z/`. It records a healthy
Devnet read surface (`solana-core 4.2.0`) followed by an external faucet failure,
with `transactionCreated: false` and `methodologicalFinding: null`.

## Blockers

- the public Devnet faucet is rate-limiting this operator IP;
- the recommended PoW fallback is not buildable with the current pinned Windows GNU
  environment without a toolchain decision;

The initial pnpm wrapper error was resolved by running a frozen-lockfile, offline
install with Corepack pnpm 11.16.0. It changed no dependency or version contract.

These are operational/toolchain blockers, not evidence of transaction asymmetry.
Sprint 11 remains prohibited.
