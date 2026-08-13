# Sprint 1.5 status

Status as of 2026-08-12: **accepted after a real Agave 4.0.0 local-validator proof**.

## Proven

- Agave/Solana CLI remains pinned to `4.0.0` and Rust to `1.97.1`.
- A Windows-only source patch allows Agave's hardened genesis unpack to open a directory handle without weakening traversal validation.
- A second Windows-only source patch keeps the faucet listener on `0.0.0.0` but gives the RPC client the connectable loopback destination `127.0.0.1`.
- A clean validator boots, reports healthy, produces slots, and finalizes blocks.
- The faucet creates a real funding transaction.
- The Telemetry Core emits `CREATED`, `SUBMISSION_ATTEMPTED`, `RPC_ACKNOWLEDGED`, and `OBSERVATION_PENDING` from raw events, while correctly refusing to interpret RPC acknowledgement as landing.
- Production and integration typechecks pass; the unit suite passes 11/11.

## Resolved integration boundary

Repeated v0 experimental transfers received an RPC acknowledgement with the expected signature, but three logical readers returned a null signature status until the observation deadline. Those runs correctly derived `OBSERVATION_INCONCLUSIVE`.

A separate real legacy transfer submitted with Solana CLI `4.0.0` confirmed and credited the expected balance. Fixing the Sprint 1.5 harness profile to a legacy transaction then produced the full finalized lifecycle through quorum. v0 remains a documented compatibility limitation and is not included in the Sprint 1.5 proof. Sprint 2 has not started.

Raw runtime artifacts, ledgers, keypairs, local toolchains, and logs are intentionally excluded from Git.
