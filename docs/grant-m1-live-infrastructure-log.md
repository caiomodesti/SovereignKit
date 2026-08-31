# Grant Milestone 1 live infrastructure log

This is an append-only, secret-free operator log. Provider resource IDs, API
credentials, SSH private keys, and credential-bearing endpoint paths are not
published here. A resource appearing in this log is not admitted into the
Milestone 1 topology until its applicable preflight, recovery, and soak gates
pass.

## 2026-08-28 — Oracle Collector canary provisioned

- Intended candidate: Oracle Always Free `VM.Standard.A1.Flex`, 1 OCPU and
  6 GiB memory, in the account home region `sa-saopaulo-1`.
- Concrete blocker: Oracle returned `Out of capacity for shape
  VM.Standard.A1.Flex in availability domain AD-1`. São Paulo exposed no
  alternate availability domain for this attempt. The failed create operation
  left no instance or network resources.
- Controlled deviation: provisioned `sovereignkit-collector-gru-01` as an
  Always Free-eligible `VM.Standard.E2.1.Micro` canary with 1 GiB memory,
  Oracle Linux 9, and a 46.6 GiB boot volume. Oracle's shape documentation
  describes this micro as 1/8 OCPU with burst capacity; it is not treated as a
  full dedicated OCPU.
- Network boundary: dedicated VCN and public subnet; SSH ingress is restricted
  to the operator's then-current `/32` public address. No public Collector
  ingestion or HTTPS port was opened.
- Key boundary: a dedicated local SSH key was generated under the ignored
  `.secrets/` directory. The private key was not printed, copied to the
  repository, or passed through Oracle Run Command.
- Bootstrap channel: direct SSH reached the host but the process identity used
  for the network call could not read the locally protected private key. No key
  permissions were weakened. Oracle Compute Instance Run Command was selected
  as the recovery/bootstrap channel.
- IAM boundary: created a dynamic group matching only this instance and a
  policy allowing that group to consume only its own Run Command executions.
  The first read-only preflight command remains pending while IAM membership
  propagates; Oracle documents that this can take up to 30 minutes when a
  dynamic group is created after an instance.
- Admission status: `PROVISIONED_CANARY_NOT_ADMITTED`.
- Cost recorded by the project: USD 0. The console identifies the account as a
  Free Trial that later falls back to Always Free resources; billing and usage
  must still be monitored.
- Real SSH preflight: Oracle Linux 9.8, x86_64, synchronized NTP, active Oracle
  Cloud Agent, 25 GiB free on `/`, and 46.6 GiB total boot storage split between
  `/`, `/boot`, and `/var/oled`.
- Resource discrepancy: the guest reported only 498 MiB physical memory plus an
  existing 498 MiB swap file. This is below the frozen 1 GiB candidate floor.
  A separate 2 GiB swap file was added on the already provisioned `/var/oled`
  volume to prevent installation-time OOM; swap does not cure the physical
  memory shortfall and cannot make the host admissible by itself.
- Runtime deployment: Node.js 22.17.0 was downloaded from the official Node.js
  distribution, verified against the official SHA-256 list, and installed under
  `/opt`. The Collector is deployed from a locally staged, hashed production
  bundle rather than compiling the monorepo on this constrained host.
- Dependency finding: the first production install unnecessarily resolved the
  full Solana SDK through the probes package and drove the micro host into heavy
  swap. That attempt was stopped. The code now exposes a Collector-only probes
  entrypoint, and the deployment bundle omits the Solana SDK while retaining
  signed-result verification and ingestion.
- Recovery finding: under that installation pressure, the guest did not finish
  a graceful reboot promptly. A Console reboot was initiated and the instance
  remained in `Stopping` during this update. This is negative canary evidence;
  the host remains unadmitted even if it later returns and runs the reduced
  bundle.

## 2026-08-28 — Oracle E2 micro canary rejected

- The instance did not restore SSH availability within the bounded recovery
  check after the Console reboot.
- The observed 498 MiB physical memory is below the frozen 1 GiB candidate
  floor, and installation pressure caused heavy swap plus an unacceptably slow
  shutdown/recovery path.
- Decision: `CANARY_REJECTED_RESOURCE_FLOOR_AND_RECOVERY`.
- The VM MUST NOT host the official Collector or count toward any milestone.
- Next topology action: move the Collector to an external host that meets the
  resource floor. Prefer a verified Superteam compute benefit when it provides
  a general Linux VM with persistent storage; otherwise use the bounded paid
  fallback. RPC credits remain reserved for route diversity, not compute.

## 2026-08-28 — Oracle E4 Collector canary provisioned, not admitted

- Provisioned `VM.Standard.E4.Flex` in `sa-saopaulo-1` with 1 OCPU, a verified
  12.5% burstable baseline, 4 GiB configured memory, Oracle Linux 9, and the
  default encrypted boot volume. Provider resource IDs and addresses are not
  retained in this public log.
- Reused the dedicated VCN, public subnet, NSG, and dedicated SSH public key.
  SSH remains restricted to the operator's current `/32`; Collector ingestion
  remains closed and the health endpoint binds only to `127.0.0.1:8787`.
- Oracle displayed BRL 1,500 in trial credits. A BRL 60 monthly budget and an
  80% actual-spend alert were active before creation.
- Estimator discrepancy: the Console showed BRL 131.21/month at the full shape
  rate even though both review and live instance details confirmed the 12.5%
  baseline. The frozen public-price calculation plus displayed boot volume is
  BRL 45.326306625/month. Both values are retained; neither is described as a
  bill.
- Real guest preflight: x86-64, synchronized UTC clock, approximately 3.45 GiB
  visible memory, approximately 22 GiB free on `/`, and zero swap use at the
  capture time.
- Deployed the Collector-only runtime from commit
  `d2e5e09c01d890c0f142b0cf22010280c38b366c` using Node.js 22.17.0 after
  verifying the official Node archive checksum. The service is enabled and
  active under the hardened systemd unit.
- Loopback health returned `status=ok`, the service bound only to
  `127.0.0.1:8787`, and a controlled service restart preserved the append-only
  evidence file with mode `0600`.
- A controlled full-VM reboot changed the guest boot identity as expected. SSH,
  the enabled Collector service, loopback health, and the mode-`0600` evidence
  file recovered in approximately 49 seconds.
- Admission status: `PROVISIONED_CANARY_NOT_ADMITTED`. Versioned preflight,
  durable replay recovery, and the complete 24-hour soak remain pending. The
  delivery queue belongs to an Observer and is not claimed here. This Collector
  contributes no observer independence.

### Required gates before this can become the Collector

1. Run Command delivery and real execution must be observed, not merely
   accepted by the control plane.
2. Host preflight must prove clock, disk, runtime, and service readiness.
3. The 4 GiB E4 host must survive deployment, Collector durable replay, and a
   24-hour production-like canary without storage regression or readiness loss.
4. A controlled conventional DNS hostname and TLS path must exist before any
   observer sends results to it.
5. The Collector remains a centralized availability dependency and contributes
   nothing to observer independence.

## 2026-08-28 — RETRACTED host attribution

The actions below were originally attributed to E4. On 2026-08-29 a hostile
audit proved that the ignored SSH target file still named the rejected E2 host.
The E4 preflight, replay, reboot, and soak claims in this section are therefore
retracted. The historical record is retained to make the correction auditable;
the corrected E4 evidence follows in the next section.

- The Run Command dynamic group was corrected to match only the active E4
  instance; the rejected E2 instance is no longer a member. The associated
  policy remains least privilege: the dynamic group may only consume its own
  `instance-agent-command-execution-family` resources. Commands created before
  and immediately after the change remained control-plane `Accepted`, not
  executed, during this checkpoint. Oracle documents an approximately one-hour
  propagation window for matching-rule changes, so no execution claim is made.
- Direct SSH through the existing dedicated, ignored key provided a bounded
  bootstrap path without weakening key permissions or opening Collector
  ingestion. Provider addresses and resource IDs remain outside this public
  log.
- The fail-closed preflight found that the installed manifest still named
  source commit `3c904a64b0303c7bd8aad9e37f07fc26f69ab254`, which predates the
  frozen Collector-only deployment commit. The expected commit was not changed
  to hide the mismatch.
- A detached build at frozen commit
  `d2e5e09c01d890c0f142b0cf22010280c38b366c` produced a 124-file runtime
  manifest and a 66,174-byte archive with SHA-256
  `a6401eb0c2ed2f7bb201b59e9baa692bbf45a7e92ca725747737ea440bb6f66c`.
  The runtime was replaced with an automatic rollback path retained on-host;
  the Collector recovered with loopback health `status=ok`.
- The versioned host preflight then passed and wrote mode-`0600` evidence owned
  by `sovereignkit`, with evidence SHA-256
  `c4403d90fee4099ffad2851bf4dc9e0b7a904db318be9e7f5731d90aaf0462ba`.
- The first archived local fixture was rejected because its observer key was
  not allowlisted. A first synthetic canary attempt was then rejected by the
  JSON Schema because its phase label was outside the official enum. Both
  failures occurred before durable append and are retained as negative gate
  evidence; validation was not weakened.
- A replacement synthetic replay fixture was signed with an ephemeral,
  short-lived canary key and validated locally against the signature, ingestor,
  and official JSON Schema. It is explicitly Collector durability test data,
  not a Solana observation and not observer-independence evidence.
- The real-host durable replay drill passed: first ingest accepted exactly one
  record, service restart reconstructed one record, duplicate replay did not
  append, evidence remained mode `0600`, and health ended at `storedCount=1`.
- The 24-hour Collector soak started at `2026-08-28T16:26:04.321Z`. Its first
  fsynced sample was ready over loopback with HTTP 200 and `stored_count=1`.
  The systemd unit is enabled and running independently of the operator PC.
  No summary or admission claim exists until the complete 24-hour evaluator
  finishes successfully.
- Admission status remains `PROVISIONED_CANARY_NOT_ADMITTED`. Public DNS/TLS,
  external observer delivery, and every independence claim remain absent.

## 2026-08-29 — E4 attribution corrected; real soak started

- The expected 24-hour summary was absent on E4. Inspection proved that E4 had
  no soak unit, journal, or soak evidence and still ran source commit
  `3c904a64b0303c7bd8aad9e37f07fc26f69ab254` with `storedCount=0`.
- Root cause: the ignored SSH target file named the rejected E2 address. This
  explains the repeated E2 banner timeouts and invalidates the prior E4 host
  attribution; it is not evidence that a completed E4 soak failed.
- E4 itself was `Running`, with Oracle Linux 9.8, x86-64, approximately 4 GiB
  memory, synchronized time, Node `v22.17.0`, and adequate disk. No new VM or
  billing action was required.
- The 124-file frozen runtime at
  `d2e5e09c01d890c0f142b0cf22010280c38b366c` was deployed transactionally
  with rollback retained. The Collector recovered healthy on loopback.
- The real E4 preflight passed at `2026-08-29T17:15:44.667Z`; its evidence
  SHA-256 is
  `b756fe8eaa031b11a5ae7aeb25609fe811a5029ddd9f54f9377941df382d2bc6`.
- The real E4 durability drill passed at `2026-08-29T17:16:47.998Z`: one
  accepted append, restart reconstruction, duplicate rejection, one retained
  record, and mode-`0600` evidence. Its evidence SHA-256 is
  `757fdae4bc12ce69b6d663e2fb3ecce2c71a57a12e88287d1ee6536e4aaf5051`.
- The true E4 soak started at `2026-08-29T17:17:37.739Z`. Its first fsynced
  sample was ready with HTTP 200 and `stored_count=1`. It cannot pass before
  `2026-08-30T17:17:37.739Z` and remains `IN_PROGRESS`.
- Full-VM restart recovery is reset to unverified. It will be rerun only after
  the soak completes so the active 24-hour window is not disturbed.
- Sanitized anchor: `fixtures/grant-m1/oracle-e4-preflight-replay-20260829.json`.
- Admission remains `PROVISIONED_CANARY_NOT_ADMITTED`; Milestone 2 has not
  started.

## 2026-08-30 — Corrected E4 Collector admission

- The correctly attributed soak completed with 1,441 ready samples, 100%
  coverage/readiness, no storage regression, and raw JSONL SHA-256
  `2b0c51ea7e78b28d7396c16451cef2afd0f13e086c632fe86613d6d6bcf2e548`.
- The raw evidence was not modified. A regression-tested evaluator correction
  uses the final monotonic elapsed value from runner start and resolves the
  original one-second false rejection.
- After disabling the completed soak unit, a controlled full-VM reboot
  recovered the enabled Collector, loopback health, `storedCount=1`, protected
  evidence, and the same raw hash.
- A post-reboot versioned host preflight passed all checks and produced
  sanitized evidence SHA-256
  `d3820e884b89b0a89405b8c60fbef21de3da2b1077e6ae3f011474b765a35175`.
- Status is `COLLECTOR_ADMITTED_PRIVATE`. This is Collector-only evidence and
  has no observer-independence effect. Public TLS and every observer remain
  pending; Milestone 2 has not started.

## 2026-08-31 — E4 Collector public TLS edge admitted

- Registered a conventional project hostname and created one DNS A record for
  the Collector. Registration cost was USD 7.98; the registrar displayed a
  current renewal price of USD 11.84/year. No hosting or email add-on was
  purchased.
- Installed the official Caddy package for Oracle Linux, retained the Collector
  on `127.0.0.1:8787`, and exposed only TCP 80/443 through the instance NSG and
  guest firewall. Existing SSH restriction remained unchanged.
- The fail-closed preflight matched DNS to the private expected-address file
  without persisting that address, authorized a publicly trusted TLS 1.3
  certificate, observed HTTP 308 redirect, kept `/health` and wrong methods at
  404, and reached Collector schema validation with HTTP 422.
- Sanitized evidence is retained at
  `fixtures/grant-m1/oracle-e4-tls-20260831.json`; its capture SHA-256 is
  `d44aaaba5c1456902a0a28f060b85ae7a760db8f4606ee86b0acdd640d7fa469`.
- Status advances to `COLLECTOR_ADMITTED_PUBLIC_TLS`. This does not prove a
  successful signed Observer delivery, observer independence, Milestone 1
  acceptance, or any Milestone 2 work.
