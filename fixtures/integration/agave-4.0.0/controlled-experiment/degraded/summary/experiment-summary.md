# Experiment Summary: sprint-5-live-controlled:degraded:observer-local

- Policy: `ClassificationPolicyV0Experimental`
- Input hash: `5f55ee67616fba5411c66b26553309ed2eefe8a77e32d827894789694eb62f83`
- Experiment: `sprint-5-live-controlled@1`
- Phase: `degraded`
- Observer: `observer-local`
- Configuration: `6e4fa407adbbb6feb2d6af136e580baf5c1fd1918547dc4e868e86f2c02a1067`

| Route | Classification | Evidence strength | Control | PROGRAM_X | Gap | Peer PROGRAM_X |
|---|---|---|---:|---:|---:|---:|
| route-a | DEGRADED | LIMITED | 20.0% | 20.0% | 0.0% | 100.0% |
| route-b | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 60.0% |
| route-c | HEALTHY | LIMITED | 100.0% | 100.0% | 0.0% | 60.0% |

## Cell measurements

| Route | Class | Complete | Missing | Invalid | Success | Inconclusive | Policy rate | Complete-case rate | Wilson 95% |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| route-a | MATCHED_CONTROL | 30 | 0 | 0 | 6 | 0 | 20.0% | 20.0% | 9.5%–37.3% |
| route-a | PROGRAM_X | 30 | 0 | 0 | 6 | 0 | 20.0% | 20.0% | 9.5%–37.3% |
| route-b | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-b | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | MATCHED_CONTROL | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |
| route-c | PROGRAM_X | 30 | 0 | 0 | 30 | 0 | 100.0% | 100.0% | 88.6%–100.0% |

> Experimental controlled classification only. `evidence_strength` is descriptive, not calibrated confidence.
