# Telemetry Core v0.1

## Objective

Tell the observable story of one Solana transaction without collapsing RPC responses, reader observations, execution outcome, confirmation, finalization, expiration, or observation failure into a generic `success` status.

## Raw facts and derived states

Raw events are append-only facts:

```text
TRANSACTION_CREATED
SUBMISSION_ATTEMPTED_RECORDED
RPC_RESPONSE_RECEIVED
OBSERVATION_CYCLE_STARTED
READER_SIGNATURE_STATUS_RECEIVED
READER_BLOCK_HEIGHT_RECEIVED
READER_UNAVAILABLE
OBSERVATION_DEADLINE_REACHED
```

`deriveTimeline(events)` produces the normative lifecycle states. Derived timelines can be discarded and rebuilt; raw observations remain the source of truth.

Every event includes:

- `schemaVersion`;
- `measurementVersion`;
- `softwareVersion`;
- event, attempt, transaction, observer, and key identifiers;
- observer-local wall clock;
- observer-local monotonic nanoseconds;
- clock domain and sequence;
- type-specific fact payload.

Collector receipt time is optional and never used for local latency.

## Modules

| Module | Responsibility |
|---|---|
| `types.ts` | Raw event, lifecycle, identity, descriptor, and timeline contracts |
| `recorder.ts` | Capture facts with local clock/version metadata |
| `event-store.ts` | Append-only in-memory and JSONL persistence |
| `quorum.ts` | Earliest 2/3 logical quorum decisions |
| `timeline.ts` | Idempotent deterministic projection from events |
| `coordinator.ts` | Submission plus ordered three-reader polling |
| `solana-rpc.ts` | Current `@solana/kit` RPC adapters |
| `format.ts` | Human-readable timeline output |

## Observation behavior

The coordinator records reader results in configured reader order after concurrent I/O. This preserves deterministic local sequencing without serializing network requests.

- Two compatible execution claims establish observed success or failure.
- Two compatible `confirmed` or stronger claims establish `CONFIRMED`.
- Two compatible `finalized` claims establish `FINALIZED`.
- Two confirmed block heights above `lastValidBlockHeight`, with no ledger observation from any reader, establish `EXPIRED`.
- Deadline without an authoritative result produces `OBSERVATION_INCONCLUSIVE`.
- One unavailable reader cannot prevent the other two from establishing quorum.

This is a **Logical Observation Quorum**. In the laboratory the readers may share one validator and do not provide consensus/network independence.

## RPC rejection nuance

An explicit rejection known not to have forwarded, such as a controlled preflight rejection, may stop at `RPC_REJECTED`. Transport or generic RPC exceptions default to `mayHaveBeenForwarded=true` and continue observation because an error response cannot prove non-forwarding.

This refines, rather than removes, the Sprint 0 requirement to observe ambiguous rejections.

## Idempotency

Repeated raw observations with the same `observationId` and identical payload are reduced once. Conflicting duplicates are quarantined from quorum and reported as anomalies. The raw log retains both facts.

## Privacy

Transaction signatures and IDs are public but correlatable. They are not anonymous. The core stores no private key, seed phrase, raw signed transaction, account payload, or full unredacted RPC error message.

## Persistence scope

Sprint 1 uses in-memory and JSONL stores. PostgreSQL is intentionally absent. A future store must preserve the same append-only interface and deterministic projection behavior.
