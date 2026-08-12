# ADR-011: Use @solana/kit

- Status: Accepted
- Date: 2026-08-10

## Decision

Use the current recommended TypeScript SDK, `@solana/kit`, for implementation. Treat `@solana/web3.js` v1 as legacy compatibility only and introduce it solely through a future ADR with a concrete interoperability need.

## Consequences

The project aligns with current official APIs and gains composable RPC transports and typed transaction lifetimes. Team familiarity and ecosystem examples may be weaker than for legacy web3.js, so versions must be pinned and API usage tested.

## Sources

- <https://solana.com/docs/clients/official/javascript>
- <https://github.com/anza-xyz/kit>
