# ADR 018: ProbeResult identifiers and runtime validation

- Status: accepted
- Date: 2026-08-13
- Scope: Sprint 6

## Context

`probe-result.schema.json` described `attempt_id`, `claim_id`, and `decision_id` as UUIDs. The controlled Sprint 5 pipeline intentionally derives those identifiers from the statistical unit and decision inputs. Accepted, signed evidence therefore contains SHA-256 identifiers and bounded composite claim identifiers. Replacing them with random UUIDs would invalidate retained signatures and weaken deterministic reproduction.

The Sprint 2 collector also performed only selected semantic checks in TypeScript. It did not validate the complete persisted payload against the versioned JSON Schema.

## Decision

- `result_id` remains UUID-formatted because it identifies an independently created result envelope. Retained Sprint 5 values are deterministic UUID-shaped hashes and are not retroactively required to carry RFC version/variant bits.
- `attempt_id`, `claim_id`, and `decision_id` are opaque logical identifiers. They may be deterministic hashes or bounded composite identifiers.
- Logical identifiers are limited to 160 ASCII characters from `[A-Za-z0-9._:-]`.
- The Collector validates unknown input against the complete Draft 2020-12 schema before type narrowing, authentication, replay checks, or persistence.
- Semantic invariants that JSON Schema cannot express remain explicit TypeScript validation.
- `observer_sequence` is unique within `(observer_id, experiment_definition_hash)`. Envelope IDs and idempotency keys remain globally checked by the Collector. This matches the existing experiment writers, which restart their sequence for each versioned definition.
- Existing signed Sprint 5 evidence remains valid; no evidence is rewritten.

## Consequences

The versioned schema now matches the evidence-producing implementation. Deterministic IDs remain reproducible. A malformed or additional field fails closed before entering the accepted raw log. This does not make observers operationally independent and does not change the ObservationQuorum claim.
