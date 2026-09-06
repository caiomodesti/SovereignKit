# Observer C soak closure — 2026-09-06

Status: `HOST_SOAK_VERIFIED_ADMISSION_PENDING`.

The Oracle Observer C canary completed successfully from
`2026-09-04T23:07:46.230Z` through `2026-09-05T23:07:46.230Z`.
Independent local recomputation of the complete raw JSONL matched every field
of the on-host summary and its SHA-256:
`a317f8a3b64110eb3ca35f9f96aa8a294c467175c22cc5b1b309a6a3b2c3e8ea`.

- Duration: 86400 seconds, measured by the monotonic runner.
- Samples: 1441/1441; coverage and readiness: 100%.
- Identity mismatches: zero; maximum monotonic sample gap: 60074 ms.
- Unit result: success, exit 0. Inactive after completion is expected.
- Protected raw and summary file modes: 0600.
- Observer remained ready, with three delivery receipts and zero queued units.
- Fresh post-soak host preflight passed all checks for runtime commit
  `49557b234b7e359dcd77ca198639b6e0a936dee2`.
- Post-soak preflight SHA-256:
  `08710b814fa830f7d52ba71a8e5cade34c848a8489114cbabcb11b57e1e79f82`.

The runtime and completed capture were not restarted or changed. Independent
recomputation means a separate verifier invocation, not external organizational
review. The sampler does not record delivery counters, so a continuous
no-regression claim for those counters cannot be derived from these samples;
the post-reboot and current snapshots both show three delivered and zero queued.

The successful soak closes the host stability gate. Real assignment-correlated
Devnet evidence, network attribution and remaining M1 acceptance requirements
must still be checked before formal Observer C admission. Transport fixtures
remain excluded from the ledger-observation KPI. Milestone 2 has not started.
