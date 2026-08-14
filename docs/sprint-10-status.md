# Sprint 10 status

Status: **ACCEPTED — DEVNET INTEGRATION VALIDATION ONLY**

The complete static verifier passes: build, workspace typecheck, 84/84 unit tests,
Devnet integration typecheck, blocked-run verification, and accepted-run deterministic
reconstruction.

The accepted run is retained at
`fixtures/sprint-10/devnet-accepted-run-20260814T220116Z/`.

- signature: `2RzqePQSCvQL6Ve88sZR6uLMyNiKE7HukCN9aqroYgTud8LAWYzZX8XrnsEGdWt6BC78pQLWuufiyH7dzaAn5mvD`;
- cluster: Devnet genesis `EtWTRABZ...PkrZBG`, `solana-core 4.2.0`;
- lifecycle: CREATED through FINALIZED, derived from 34 raw events;
- acknowledgment: 131.891 ms;
- observed/confirmed: approximately 3.66 seconds;
- finalized: approximately 13.38 seconds;
- quorum: observed and confirmed 3/3, finalized 2/3;
- finalized recipient balance: 1,000,000 lamports;
- operational reader independence: explicitly not established.

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

## Resolved blockers

- Faucet rate limiting was bypassed using a disposable, locally ignored, pre-funded
  Devnet-only keypair. No user wallet secret entered the repository or evidence.
- Reader polling was reduced from 500 ms to 3,000 ms after a real transaction finalized
  but the public RPC rate-limited the original observation loop.
- The PoW fallback remains incompatible with the pinned Windows GNU environment, but
  it is no longer required for this acceptance run.

The initial pnpm wrapper error was resolved by running a frozen-lockfile, offline
install with Corepack pnpm 11.16.0. It changed no dependency or version contract.

These setup failures remain retained as operational evidence and are not classified
as transaction asymmetry. Sprint 11 may begin only after this accepted branch is
reviewed and merged.
