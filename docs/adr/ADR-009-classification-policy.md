# ADR-009: ClassificationPolicyV0Experimental

- Status: Accepted
- Date: 2026-08-10

## Decision

Adopt the transparent thresholds in `docs/methodology.md` for the controlled experiment. The required distinct outcomes are `HEALTHY`, `DEGRADED`, `ASYMMETRIC`, and `INSUFFICIENT_DATA`; all unmatched cases are `UNKNOWN`.

Use `evidence_strength`, not confidence. The policy is not universal or calibrated for public networks.

## Consequences

Results are auditable and reproducible, but real-world classification requires new calibration and likely a superseding policy.
