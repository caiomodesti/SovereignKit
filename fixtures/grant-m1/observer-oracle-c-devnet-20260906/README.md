# Observer C real Devnet integration evidence

This bundle records one fresh Solana Devnet transaction and one short-lived,
coordinator-signed assignment executed by `observer-oracle-a1` on 2026-09-06.
The Observer signed its result and delivered it to the Collector, which accepted
it exactly once. Two logical readers reported `finalized`; the third reader's
RPC error is preserved.

The assignment, raw poll, Observer result, delivery receipt, Collector record,
and public keys were correlated and signature-checked before publication. Run:

```sh
node scripts/verify-grant-m1-devnet-evidence-bundle.mjs fixtures/grant-m1/observer-oracle-c-devnet-20260906
```

This is one real integration observation, not a matched comparative unit and
not proof of independent upstream RPC infrastructure. It does not by itself
admit Observer C, accept Milestone 1, or start Milestone 2.
