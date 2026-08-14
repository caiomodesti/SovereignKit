# Sprint 10 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Current official RPC semantics reviewed | PASS | links and frozen profile in Sprint 10 design |
| 2 | Devnet remains integration-only | PASS | explicit scope guard in docs and evidence schema |
| 3 | Unique transaction and ephemeral keypairs | PASS (HARNESS) | generated in memory for every opt-in run |
| 4 | RPC acknowledgement separate from landing | PASS (HARNESS) | existing telemetry coordinator and asserted lifecycle |
| 5 | Raw JSONL deterministically reconstructs timeline | PASS (HARNESS) | canonical reconstruction assertion |
| 6 | Logical ObservationQuorum 2/3 | PASS (HARNESS) | exactly three configurable readers, quorum two |
| 7 | Operational reader independence is not overstated | PASS | evidence always says not established |
| 8 | Cluster identity/version captured | PASS (HARNESS) | genesis hash, RPC version, processed/finalized slots |
| 9 | Blockhash lifetime captured | PASS (HARNESS) | context slot and last valid block height |
| 10 | Endpoint secrets excluded from evidence | PASS (HARNESS) | only URL origin is persisted |
| 11 | Integration typecheck | PASS | TypeScript 7.0.2, no errors |
| 12 | Unit regression | PASS | 84/84 tests |
| 13 | Real Devnet transaction acknowledged | BLOCKED | retained setup failure: public faucet HTTP 429 |
| 14 | Real quorum observed execution | BLOCKED | no funded ephemeral signer, therefore no transaction |
| 15 | Real confirmed/finalized evidence retained | BLOCKED | no transaction signature exists |
| 16 | Full static wrapper | PASS | build, workspace typecheck, 84/84 tests, integration typecheck |
| 17 | No Sprint 11 work began | PASS | no public report implementation or publication |

Verdict: **NOT ACCEPTED**. Harness-level passes do not substitute for criteria 13–15.

## Hostile methodology audit

- Three logical clients on one public endpoint can fail together and are not an
  independent infrastructure quorum.
- A successful future run proves compatibility at one time and from one operator
  location; it does not estimate accessibility rates.
- Faucet success selects for runs where setup infrastructure is available. Faucet
  failures must remain visible and excluded from transaction outcome denominators.
- Devnet can reset and can run a different minor release from Mainnet. Retaining the
  genesis hash, RPC version, slots, and timestamps is mandatory but does not make a
  Devnet result representative of Mainnet.
- A finalized balance corroborates execution but is read through RPC infrastructure;
  it is not an independently archived ledger proof.
- Endpoint origin redaction protects keys but reduces reproducibility for provider
  paths. Operators must retain private run configuration separately when using
  authenticated endpoints.

## Assumptions and residual risks

- System Program transfer semantics remain supported by the connected Devnet cluster.
- The public endpoint reports cluster identity and status honestly.
- Operator clock timestamps are useful provenance but are not globally synchronized.
- Rate limits, load balancers, provider upstream sharing, and network path correlation
  remain uncontrolled.
- `@solana/kit 7.0.0` compiled compatibility is established; live compatibility is not.
