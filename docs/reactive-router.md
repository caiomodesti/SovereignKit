# Reactive Router v0.1

## Contract

The Sprint 3 router accepts one already-signed Solana transaction and a locally ordered list of logical routes. It attempts at most `maxRoutes`, never revisits a `route_id`, and stops at the global deadline. This is reactive primary/fallback routing only; it does not consume Observatory intelligence or classify transactions.

## Success semantics

`RPC_ACKNOWLEDGED` is a submission fact and is emitted with `landing: false`. It never returns routing success. Success requires an independent observer result of `CONFIRMED` or `FINALIZED` supported by at least two distinct reader IDs from the exactly three configured logical readers.

Every route declares `submissionClientIdentity`. Every reader declares a different `clientIdentity`, and construction fails if a reader reuses any submission client instance. In the local experiment these are distinct clients over one validator, so this proves logical separation, not infrastructure independence.

## Failover algorithm

For each locally ordered route:

1. enforce remaining global deadline and no prior visit;
2. bound submission by `min(routeTimeoutMs, remaining deadline)`;
3. record rejection, timeout, thrown adapter error, signature mismatch, or acknowledgment;
4. after a valid acknowledgment, poll through the independent observer within its bounded timeout;
5. stop on quorum `CONFIRMED`, `FINALIZED`, observed execution failure, or expiry;
6. select the next unvisited route after rejection, timeout, or inconclusive observation;
7. return `OBSERVATION_INCONCLUSIVE` if routes or deadline are exhausted.

Telemetry hooks are also bounded. Hook failure is retained in `telemetryHookErrors` but cannot prevent transaction routing; the returned in-memory event trace remains complete.

## Retransmission and attribution

The router retransmits the same signed transaction to fallback routes. This is necessary because an SDK cannot silently rebuild or re-sign a user's transaction and because Solana transaction signatures identify duplicate execution. This is not the comparative-probe path: comparative experiments continue to require a unique signed transaction per route/class/unit.

A timed-out or rejected submission may still have been forwarded. Therefore a confirmation observed after a fallback attempt is stored as `confirmationObservedAfterRouteId`, not `successfulRouteId`. This is temporal evidence, not causal route attribution. A late primary landing and fallback submission can be observationally indistinguishable.

## Terminal decisions

- `CONFIRMED` / `FINALIZED`: independent quorum only.
- `OBSERVED_EXECUTION_FAILED`: stop; rebroadcast cannot change an executed transaction's result.
- `EXPIRED`: stop; the signed transaction's blockhash lifetime is over.
- `OBSERVATION_INCONCLUSIVE`: no supported terminal fact before route/deadline exhaustion.

A wall-clock or operation timeout never becomes `EXPIRED`.
