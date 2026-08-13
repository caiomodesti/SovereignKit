# Experiment Summary: sprint-5-live-controlled:healthy:observer-local

- Policy: `ClassificationPolicyV0Experimental`
- Input hash: `1bb56037ed7652f2704a633d6f265266a0b870b8deb88ba16d4b4a96abfe9726`
- Experiment: `sprint-5-live-controlled@1`
- Phase: `healthy`
- Observer: `observer-local`
- Configuration: `c29f2cd0ca288a351090bd973ec59ffec84b62ebcf012ff4bb33c6ce0dca5435`

| Route | Classification | Evidence strength | Control | PROGRAM_X | Gap | Peer PROGRAM_X |
|---|---|---|---:|---:|---:|---:|
| route-a | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 100.0% |
| route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 100.0% |
| route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 100.0% |

## Cell measurements

| Route | Class | Complete | Missing | Invalid | Success | Inconclusive | Policy rate | Complete-case rate | Wilson 95% |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| route-a | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-a | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-b | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-b | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |

> Experimental controlled classification only. `evidence_strength` is descriptive, not calibrated confidence.
