# Sprint 1.5 status

Status as of 2026-08-12: **in progress; not accepted**.

## Proven

- Agave/Solana CLI remains pinned to `4.0.0` and Rust to `1.97.1`.
- A Windows-only source patch allows Agave's hardened genesis unpack to open a directory handle without weakening traversal validation.
- A second Windows-only source patch keeps the faucet listener on `0.0.0.0` but gives the RPC client the connectable loopback destination `127.0.0.1`.
- A clean validator boots, reports healthy, produces slots, and finalizes blocks.
- The faucet creates a real funding transaction.
- The Telemetry Core emits `CREATED`, `SUBMISSION_ATTEMPTED`, `RPC_ACKNOWLEDGED`, and `OBSERVATION_PENDING` from raw events, while correctly refusing to interpret RPC acknowledgement as landing.
- Production and integration typechecks pass; the unit suite passes 11/11.

## Still failing

The experimental transfer receives an RPC acknowledgement with the expected signature, but three logical readers continue to return a null signature status until the 60-second observation deadline. The derived result is therefore `OBSERVATION_INCONCLUSIVE`, as required by the evidence model.

Increasing the explicit send profile from `maxRetries: 0` to `maxRetries: 5` did not resolve landing. The next investigation must examine the Windows local-validator transaction forwarding/TPU path. No Sprint 1.5 acceptance claim has been made, and Sprint 2 has not started.

Raw runtime artifacts, ledgers, keypairs, local toolchains, and logs are intentionally excluded from Git.
