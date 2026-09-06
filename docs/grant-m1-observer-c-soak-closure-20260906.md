# Observer C soak closure — 2026-09-06

Status: `OBSERVER_HOST_QUALIFIED`.

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

The successful soak closes the host stability gate. Transport fixtures remain
excluded from the ledger-observation KPI. Milestone 2 has not started.

## Devnet assignment checkpoint — 2026-09-06

A fresh disposable transaction completed a real finalized Devnet lifecycle.
The coordinator then issued a short-lived signed assignment for Observer C at
observer sequence 3 without changing or restarting the qualified runtime.

- Result: `b9f10559-86f4-4598-bc91-9d2482e6458b`.
- Worker terminal state: `FINALIZED`.
- Two logical readers returned successful finalized claims; the third reader's
  explicit RPC error is retained.
- The Observer signed and delivered the result; the Collector accepted it as
  sequence 12.
- Post-delivery readiness: ready, four delivered, zero queued.
- The seven-file public bundle passed coordinator-signature, Observer-signature,
  raw-poll, assignment, quorum, delivery, and Collector correlation checks at
  `fixtures/grant-m1/observer-oracle-c-devnet-20260906`.

This closes the real assignment-correlated Devnet gate for Observer C. It is
one integration observation, not a matched comparative statistical unit and
not proof of independent upstream RPC routes.

## Network attribution and admission

On 2026-09-06, OCI metadata corroborated the provider and region while the
RIPEstat `network-info` and `as-overview` APIs attributed the pinned VM address
to announced AS31898, holder `ORACLE-BMC-31898 - Oracle Corporation`. Public
evidence retains only the ASN, holder, region, and hashes of cloud identifiers;
the address, prefix, availability-domain label, and raw instance identifier are
omitted. See `fixtures/grant-m1/observer-oracle-c-network-20260906.json`.

The completed host soak, post-soak preflight, real signed Devnet observation,
Collector acceptance, and sanitized network attribution admit Observer C as a
qualified M1 host when this record is merged. This is not complete Milestone 1
acceptance. AWS, Google, and Oracle provider evidence must still be reconciled
in the three-observer registry and hostile acceptance package. Shared logical
RPC routes are not independent upstream readers. Milestone 2 has not started.
