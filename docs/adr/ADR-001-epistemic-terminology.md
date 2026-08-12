# ADR-001: Epistemic terminology and lifecycle

- Status: Accepted
- Date: 2026-08-10

## Decision

Adopt `CREATED`, `SUBMISSION_ATTEMPTED`, `RPC_ACKNOWLEDGED`, `RPC_REJECTED`, `OBSERVATION_PENDING`, `OBSERVED_EXECUTION_SUCCESS`, `OBSERVED_EXECUTION_FAILED`, `CONFIRMED`, `FINALIZED`, `EXPIRED`, and `OBSERVATION_INCONCLUSIVE`.

`RPC_ACKNOWLEDGED` records a positive RPC response only. It never means landing, processing, or confirmation. Use evidence language and never infer censorship intent from route measurements.

## Consequences

Telemetry must preserve submission and observation as separate evidence streams. Interfaces require more states but cannot silently convert acknowledgment or timeout into success/failure.
