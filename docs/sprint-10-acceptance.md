# Sprint 10 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Current official RPC semantics reviewed | PASS | links and frozen profile in Sprint 10 design |
| 2 | Devnet remains integration-only | PASS | explicit scope guard in docs and evidence schema |
| 3 | Unique transaction and disposable key isolation | PASS | unique signature; in-memory recipient; ignored disposable fee payer; no secret in evidence |
| 4 | RPC acknowledgement separate from landing | PASS | acknowledgment at 131.891 ms; observation at 3,663.818 ms |
| 5 | Raw JSONL deterministically reconstructs timeline | PASS | 34 retained events reproduce the canonical timeline |
| 6 | Logical ObservationQuorum 2/3 | PASS | 3/3 observed and confirmed; 2/3 finalized |
| 7 | Operational reader independence is not overstated | PASS | evidence always says not established |
| 8 | Cluster identity/version captured | PASS | Devnet genesis hash, solana-core 4.2.0, processed/finalized slots |
| 9 | Blockhash lifetime captured | PASS | blockhash, context slot 483923790, last valid block height 471734479 |
| 10 | Endpoint secrets excluded from evidence | PASS | only public URL origin; verifier confirms no claimed secret persistence |
| 11 | Integration typecheck | PASS | TypeScript 7.0.2, no errors |
| 12 | Unit regression | PASS | 84/84 tests |
| 13 | Real Devnet transaction acknowledged | PASS | signature `2RzqePQS...An5mvD`; matching RPC response |
| 14 | Real quorum observed execution | PASS | success/confirmed 3/3; finalized readers 1 and 3 |
| 15 | Real confirmed/finalized evidence retained | PASS | finalized RPC status, 1,000,000-lamport finalized recipient balance |
| 16 | Full static wrapper | PASS | build, workspace typecheck, 84/84 tests, integration typecheck |
| 17 | No Sprint 11 work began | PASS | no public report implementation or publication |

Verdict: **ACCEPTED** for Devnet integration validation only. This is not a
controlled statistical proof, a Mainnet proxy, or evidence of operationally
independent readers.

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
- `@solana/kit 7.0.0` live compatibility is established for this one retained run,
  endpoint, cluster version, operator location, and timestamp only.
