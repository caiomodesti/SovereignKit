# ADR-017: Disable periodic test-validator snapshots in the Windows local proof build

## Status

Accepted for the Windows-only controlled local experiment.

## Context

Agave/Solana CLI 4.0.0 hard-codes a full snapshot every 100 slots in
`test-validator/src/lib.rs`; `solana-test-validator` exposes no flag to change
or disable it. On the pinned Windows build, snapshot serialization fails while
flushing the slot-100 AppendVec with `os error 5 (Access denied)`. The fatal
SnapshotPackagerService error stops block production and the RPC service.

A recent blockhash remains valid for roughly 150 block heights. Therefore a
real `EXPIRED` observation cannot be reached: the process fails at slot 100
before the validity window can close. Moving the ledger outside OneDrive did
not change the failure, proving it is not workspace synchronization.

## Decision

For the patched Windows local validator only, replace the hard-coded full
snapshot interval with `SnapshotInterval::Disabled`. Keep:

- Rust 1.97.1;
- Agave/Solana CLI source version 4.0.0;
- all RPC, SVM, block production, blockhash-age, transaction-status, and ledger
  behavior used by the experiment;
- the existing Windows directory-open patch from ADR-016.

Record the patched validator SHA-256 in every run manifest. Do not use this
binary as Devnet/Mainnet or snapshot-behavior evidence.

Accepted local binary SHA-256:

```text
B316C23BB115299CC8A367F2813711E21E2147D091F0674314712FD3D5BA55AC
```

## Consequences

The local process can run beyond slot 100 and observe real blockhash expiry.
Snapshot creation/recovery is explicitly outside the Sprint 5 claim. Devnet
integration must later use unmodified infrastructure and cannot inherit this
exception silently.
