# Experiment Summary: sprint-5-live-controlled:insufficient_data:observer-local

- Policy: `ClassificationPolicyV0Experimental`
- Input hash: `0b53085647fe6c524365cc1f7528fbccf95d8283e3f664721d1049af2359230e`
- Experiment: `sprint-5-live-controlled@1`
- Phase: `insufficient_data`
- Observer: `observer-local`
- Configuration: `270db1db42b4cbfbf804bab31267e0cc88bd0c17bfe9b1689cc7cb59999c0352`

| Route | Classification | Evidence strength | Control | PROGRAM_X | Gap | Peer PROGRAM_X |
|---|---|---|---:|---:|---:|---:|
| route-a | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% | n/a |
| route-b | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% | n/a |
| route-c | INSUFFICIENT_DATA | INSUFFICIENT | 100.0% | 100.0% | 0.0% | n/a |

## Cell measurements

| Route | Class | Complete | Missing | Invalid | Success | Inconclusive | Policy rate | Complete-case rate | Wilson 95% |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| route-a | MATCHED_CONTROL | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |
| route-a | PROGRAM_X | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |
| route-b | MATCHED_CONTROL | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |
| route-b | PROGRAM_X | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |
| route-c | MATCHED_CONTROL | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |
| route-c | PROGRAM_X | 10 | 0 | 0 | 10 | 0 | 100.0% | 100.0% | 72.2%–100.0% |

> Experimental controlled classification only. `evidence_strength` is descriptive, not calibrated confidence.
