# Observer A common-runtime requalification — 2026-09-08

Status: `RUNTIME_REQUALIFIED` for the common runtime candidate only.

AWS Observer A is the first host requalified on runtime commit
`f4c70ea10198e5313eec0467f6a7b9222ff9e8f3`. Google Observer B and Oracle
Observer C were not changed. This is not formal Milestone 1 acceptance and
Milestone 2 has not started.

## Independent soak verification

- The immutable soak ran from `2026-09-07T00:42:05.162Z` through
  `2026-09-08T00:42:05.211Z`, reaching 86,400 seconds of monotonic runtime.
- Independent local recomputation verified 1,440 records, sequential indexes,
  monotonic elapsed time, and raw SHA-256
  `cdf491991855d1ee2cebe42ba7a0b23cc3a2ee4a5437f3109a01860d7e38c28b`.
- Coverage was 0.9993060374739764, readiness was 1.0, identity mismatches were
  zero, and the maximum gap was 60,073 ms. The summary was reproduced exactly
  and reported no blockers.
- Raw and summary files remain mode `0600` on the host and in ignored operator
  artifacts. The raw JSONL is intentionally omitted from the public repository.

## Recovery and post-soak integrity

A fresh valid transport-only fixture was queued while only Observer A pointed
at an unavailable local destination. The Collector and Observers B/C were not
changed. The runtime visibly became degraded with one queued item. After the
real configuration was restored, the same unsigned payload was delivered
automatically exactly once with Collector status `ACCEPTED`; its file hash was
unchanged across the retry. The final state was ready with queue zero.

The earlier malformed fixture was rejected by the Collector because its
serialized size was below the schema minimum. It is retained as negative
validation evidence and is not counted as the recovery pass. Neither fixture
is a Solana ledger observation or grant KPI unit.

The post-soak preflight passed all 14 checks: readiness/identity, synchronized
clock, key type/owner/mode, exact runtime commit, Node version, all 192 manifest
files, installed systemd unit, active/enabled service, loopback-only binding,
and disk threshold. Its SHA-256 is
`b8cc0ef9ac00442b607e4c06462fc54569524aaccb5827377b0426aec4137729`.

## Signed Devnet integration

A fresh Devnet transaction and short-lived coordinator-signed assignment were
completed before the soak. The Observer produced an assignment-correlated raw
poll, signed the result, and delivered it exactly once. The Collector accepted
the result, and bundle verification independently checked both signatures,
assignment/result/raw correlation, the final quorum, and delivery receipt.

The seven-file public bundle is
`fixtures/grant-m1/observer-aws-a-common-runtime-devnet-20260908`. It records a
real `FINALIZED` integration observation, not a matched comparative unit or
proof of independent upstream RPC infrastructure.

## Next gate

Only Observer A is qualified on the common candidate. The next deployment gate
is a separate owner-authorized update and requalification of Observer B. Until
that happens, the old B/C evidence remains valid only for its named runtime
commits, the three-observer common-runtime set is incomplete, and Milestone 1
must not be accepted.
