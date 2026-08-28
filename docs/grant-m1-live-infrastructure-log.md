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

### Required gates before this can become the Collector

1. Run Command delivery and real execution must be observed, not merely
   accepted by the control plane.
2. Host preflight must prove clock, disk, runtime, and service readiness.
3. The 1 GiB host must survive build/deployment, restart, queue recovery, and a
   24-hour production-like canary without swap thrash or memory exhaustion.
4. A controlled conventional DNS hostname and TLS path must exist before any
   observer sends results to it.
5. The Collector remains a centralized availability dependency and contributes
   nothing to observer independence.
