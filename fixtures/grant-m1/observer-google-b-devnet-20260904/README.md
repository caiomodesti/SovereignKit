# Observer B historical Devnet integration evidence

The six evidence files and their manifest capture one remote observation on
2026-09-04 of a transaction submitted on 2026-09-01. This is not a new
transaction or a matched comparative unit. The same transaction was used for
Observer A's integration qualification; these are not independent transaction
samples for grant KPIs.

Two readers reported finalized; the third returned an explicit RPC error.
Reader routes are shared with A; different observer hosting providers do not
prove independent upstream RPC infrastructure. The error is retained.

The signed result was retrieved directly from the Collector. Its sequence was
8 and the Collector stored count was 9. The signed assignment and raw poll
copies were hash-matched to the original Observer B files. Both coordinator
and observer signatures and the delivery receipt were checked locally.

Run from the repository root after building:

```sh
node scripts/verify-grant-m1-devnet-evidence-bundle.mjs fixtures/grant-m1/observer-google-b-devnet-20260904
```

This bundle does not establish full host admission, corroborated ASN,
the complete failure matrix, or Milestone 1 acceptance.
