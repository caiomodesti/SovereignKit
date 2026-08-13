# Experiment Summary: sprint-5-live-controlled:asymmetric:observer-local

- Policy: `ClassificationPolicyV0Experimental`
- Input hash: `ff82b977498c033ff7ea730e9a5b2eb7f98bfd5004bad2c5d691adfd52952377`
- Experiment: `sprint-5-live-controlled@1`
- Phase: `asymmetric`
- Observer: `observer-local`
- Configuration: `2f1d960277dd0bf629eb65f480e7383013d3e38e0bee29654f4f560d40c04e5e`

| Route | Classification | Evidence strength | Control | PROGRAM_X | Gap | Peer PROGRAM_X |
|---|---|---|---:|---:|---:|---:|
| route-a | ASYMMETRIC | LIMITED | 100.0% | 0.0% | 100.0% | 100.0% |
| route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 50.0% |
| route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 50.0% |

## Cell measurements

| Route | Class | Complete | Missing | Invalid | Success | Inconclusive | Policy rate | Complete-case rate | Wilson 95% |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| route-a | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-a | PROGRAM_X | 30 | 0 | 0 | 0 | 0 | 0.0% | 0.0% | 0.0%–11.4% |
| route-b | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-b | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |

> Experimental controlled classification only. `evidence_strength` is descriptive, not calibrated confidence.
