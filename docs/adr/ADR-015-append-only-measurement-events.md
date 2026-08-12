# ADR-015: Append-only measurement events as source of truth

- Status: Accepted
- Date: 2026-08-11

## Decision

Persist raw measurement facts append-only. Derive timelines deterministically from raw events plus versioned code. PostgreSQL is not required in Sprint 1; in-memory and JSONL stores implement the initial boundary.

## Consequences

Incorrect projection logic can be fixed without losing observations. Storage is intentionally simple and not yet suitable for public ingestion volume or adversarial multi-process writes.
