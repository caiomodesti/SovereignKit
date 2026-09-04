# Grant Milestone 1 — Observer B readiness

Status: `SOAK_AND_POSTFLIGHT_VERIFIED_PENDING_ADMISSION_RECORD`

Observer A passed its host preflight, delivery recovery, corrected-runtime
requalification, and 24-hour host soak. Observer B is now provisioned on the
frozen Google candidate and has passed the pre-soak host, delivery, duplicate,
queue-recovery, service-restart, and full-VM-recovery gates. Its 24-hour host
canary passed independent raw-evidence verification on 2026-09-04, followed
by a successful post-soak host preflight. See
[closure evidence](grant-m1-observer-b-soak-closure-20260904.md).
The Devnet integration bundle passed signature and correlation validation and
is published on the working PR under `fixtures/grant-m1/observer-google-b-devnet-20260904`.
Network attribution was corroborated on 2026-09-04 through GCE metadata and
RIPEstat: both returned ASNs (43515 and 15169) are retained in
`fixtures/grant-m1/observer-google-b-network-20260904.json`. No single-origin
claim is made. Formal admission review and merge remain pending. The RPC routes are shared with
Observer A and must not be counted as independent upstream readers.
This does not admit Observer B or authorize Observer C
or Milestone 2 activity.

## Frozen candidate

- role: independent Observer B;
- provider: Google Cloud, distinct from AWS Observer A and Oracle Collector;
- candidate: `e2-micro` in an eligible US region under the published limited
  free tier;
- minimum disk: 30 GiB standard persistent disk;
- expected architecture: x64;
- billing boundary: the authenticated account has a configured budget alert;
  this is monitoring rather than a hard spending cap, so the single bounded VM
  remains the only authorized Google resource for this gate.

The 1 GiB memory profile is a risk, not an accepted assumption. The runtime must
pass a bounded installation rehearsal and memory-pressure check before the host
can begin its soak. No swap configuration may be used to relabel insufficient
physical memory as sufficient.

## Gates before provisioning

1. Verify account ownership and MFA without retaining account identifiers.
2. Confirm the exact Free Tier region, shape, disk allowance, expiration, and
   billing-account behavior from the authenticated console.
3. Establish a budget or hard-stop boundary; an alert alone is not a spending
   guarantee.
4. Confirm the selected region and control plane are operationally distinct
   from AWS Observer A.
5. Obtain a fresh operator checkpoint before any external resource is created.

## Gates after provisioning

1. Generate the Ed25519 observer key only on Observer B and retain mode `0600`.
2. Deploy the immutable package from the accepted runtime commit and verify its
   file-level manifest.
3. Pass clock, disk, memory, service, systemd, identity, and loopback-binding
   host preflight.
4. Prove signed delivery, exact duplicate suppression, Collector outage queue
   retention, automatic recovery, service restart, and full-VM recovery.
5. Run a fresh uninterrupted 24-hour canary with at least 95% coverage, at
   least 99% readiness, zero identity mismatches, and no gap above three
   intervals.
6. Independently recompute the soak summary from the immutable raw JSONL.
7. Retain sanitized provider/region/ASN evidence and explicit upstream RPC
   overlap limitations.

## Stop conditions

- any unexpected charge or missing hard billing boundary;
- less than the documented physical-memory floor;
- mutable or unverified runtime;
- private-key exposure or incorrect ownership/mode;
- identity mismatch, clock failure, public health binding, queue loss, storage
  regression, unexplained restart failure, or incomplete soak;
- pressure to provision Observer C before Observer B qualifies.

Observer C remains blocked. Milestone 2 remains `NOT_STARTED`.
