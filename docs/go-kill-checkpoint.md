# GO/KILL Checkpoint after the Asymmetry Engine

## Timing

Run this checkpoint only after telemetry, matched probes, reactive routing, controlled proxy, and `ClassificationPolicyV0Experimental` exist. Do not begin dashboard or public-infrastructure work before a recorded decision.

## Evidence bundle

- Source commit and dependency lockfile.
- Experiment definition and component versions.
- Signed raw probe results and reader claims.
- Matching-validation output.
- All four scenario summaries in Markdown, JSON, and CSV.
- Router failover trace with independent observation.
- Reproduction log from a clean reset.
- Hostile methodological review.

## Mandatory gates

| Gate | Pass condition |
|---|---|
| Matched probes | 100% of included units satisfy the matching contract; exclusions are enumerated |
| Unique transactions | No signature crosses route/class statistical units |
| Independent observation | 2/3 logical-reader quorum works; disagreement and shared-infrastructure limitations are visible |
| Healthy scenario | All eligible routes classify `HEALTHY` |
| General degradation | Target route classifies `DEGRADED`, never `ASYMMETRIC` |
| Selective rejection | Target route classifies `ASYMMETRIC`; peers remain `HEALTHY` |
| Insufficient data | Undersampled windows classify `INSUFFICIENT_DATA` |
| Measurement provenance | Classifications can be regenerated solely from measurements, definitions, and policy |
| Real failover | Primary failure causes one bounded fallback submission whose transaction reaches quorum `CONFIRMED` |
| Reproducibility | Clean rerun produces the same classifications and structurally equivalent summaries |

## Decision rule

- **GO:** every mandatory gate passes, no critical methodological finding remains open, and residual risks are accepted in a signed checkpoint record.
- **HOLD:** an implementation defect has a bounded correction that does not change the thesis or methodology. Fix and rerun the entire affected evidence bundle.
- **KILL/PIVOT:** matching cannot be maintained, observation is not sufficiently independent for the claim, degradation and asymmetry cannot be separated, classifications depend on injected frontend/proxy state, or routing cannot demonstrate real confirmed failover.

A deadline, hackathon schedule, or attractive dashboard is not evidence for GO.

## Required decision record

The checkpoint record must name reviewers, date, source commit, evidence hashes, every gate result, open risks, and the explicit `GO`, `HOLD`, or `KILL/PIVOT` decision.
