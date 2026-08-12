# ADR-007: Controlled experiment commitment profile

- Status: Accepted
- Date: 2026-08-10

## Decision

Use `confirmed` for `getLatestBlockhash`, `confirmed` for preflight, `skipPreflight=false`, `maxRetries=0`, `minContextSlot` from the blockhash response context, and base64 transaction encoding. Readers inspect returned signature status; confirmation requires quorum at `confirmed` or stronger. Expiration requires quorum block height greater than `lastValidBlockHeight` and no execution observation.

## Consequences

Configuration cannot vary silently across comparable probes. The experiment isolates a single submission attempt and does not represent default provider retry behavior. A wall-clock deadline produces inconclusive, not expired.
