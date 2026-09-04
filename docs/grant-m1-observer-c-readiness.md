# Grant M1 — Observer C preparation

Status: `PROVISIONED_CANARY_IN_PROGRESS`

## Console checkpoint — 2026-09-04

- Provisioned candidate: Oracle `VM.Standard.A1.Flex`, 1 OCPU, 6 GB RAM,
  Oracle Linux 9, Sao Paulo. The instance and observer runtime are running.
- Console marks this shape Always Free-eligible. Visibility is not proof of
  allocatable capacity or of remaining account allowance.
- The console estimate showed BRL 10.45/month for the boot volume. The user
  replied `continue` to the explicit cost authorization question. This is a
  bounded estimate, not a guarantee or authorization for additional services.
- The final console estimate remained BRL 10.45/month for the default 46.6 GB
  encrypted boot volume, within the explicitly accepted ceiling. Remaining
  aggregate storage allowance is not claimed as verified.
- The console displays an A1 entitlement-change notice. Do not reuse historical
  free-tier limits without checking the current account and official terms.

## Network finding and resolution

Read-only console inspection confirmed that `sk-collector-public-subnet` is
associated with `Default Security List for sk-grant-m1-vcn`. That list permits
stateful TCP destination port 22 from the entire IPv4 internet. It also contains
ICMP rules and unrestricted egress. No rule was modified.

This is evidence about the cloud network rule, not evidence of a compromise or
proof that the host firewall permits the same traffic. A restrictive NSG alone
must not be assumed to cancel a permissive subnet security list.

The candidate was placed in dedicated public subnet `sk-observer-c-subnet`.
That subnet is associated only with `sk-observer-c-security`, which has no
ingress and permits outbound traffic. The default list remains unchanged and is
not associated with the observer subnet. A dedicated `sk-observer-c-nsg` was
created and attached to the candidate VNIC; Collector ports 80 and 443 were not
copied. Later verification found that its TCP/22 rule existed but referenced a
stale operator `/32`. After explicit user confirmation, that source alone was
replaced with the current operator `/32`. No broad ingress or additional port
was added. SSH then reached the host; a local Windows key-ACL mismatch was
corrected by restricting the dedicated key to its owner before authentication
succeeded.

The existing Run Command dynamic group was expanded by one exact instance-ID
rule for this candidate. It was not widened to a compartment. The first
sanitized preflight was acknowledged and completed successfully with exit code
zero on 2026-09-04. Its output verified `aarch64`, Oracle Linux 9.8, 5,778,060
KiB of physical memory, a 30,867,456 KiB root filesystem, UTC output, and an
active Oracle Cloud Agent. No private address, public address, instance ID, or
credential is retained in this public record.

The runtime was built and staged on the host from merged source commit
`49557b234b7e359dcd77ca198639b6e0a936dee2` with 180 manifest entries. The local
immutable archive SHA-256 is
`2ea559731dc1756c693bbe3af6e90ca4e1119f2327d3b1b989f96d582d0d9e33`.

The first managed bootstrap attempt is retained as failed evidence. Oracle Run
Command executed it as the unprivileged `ocarun` account and refused the first
`sudo` operation because this instance was not launched with an `ocarun`
sudoers grant. The failure occurred before package installation, runtime
transfer, key generation, or service changes. No gate is credited from it.

The SSH bootstrap then compiled the frozen commit before staging, installed
Node 22.17.0 and the production-only runtime, generated the Ed25519 observer
identity on-host, retained the private document at mode `0600`, and started the
loopback-only observer service. The initial and post-reboot host preflights
passed with capture SHA-256 values
`235135d89321067a8c02d74ea39f209f7bbd327853f0bcab035ac81ed0e83d67` and
`441040abef4a3b0de5a88c4302c20e058918f58e4e07ff0f02c88471fb569ae2`.

Only the public identity was exported. It was added atomically to the Collector
allowlist with backup, ownership/mode preservation, service restart, health
check, and rollback-on-failure. A transport-only fixture was accepted; its
exact signed replay returned `DUPLICATE` without increasing durable storage.
A distinct fixture was retained while the Collector was confirmed stopped and
delivered automatically after recovery. The queued file remained owned by the
service account at mode `0600`. Observer-service restart and full-VM reboot both
preserved three delivery receipts, an empty queue, correct identity and ready
status. These fixtures prove transport behavior only, not Solana ledger
observation.

The fresh 86400-second canary began at `2026-09-04T23:07:46.230Z` with a
60-second interval. Its first two samples were ready, identity-matched, error
free, and 60.129 seconds apart. The raw file is mode `0600`. No summary exists
until the process reaches the complete duration.

## Remaining qualification sequence

1. Leave the running canary and runtime unchanged for at least 86400 seconds.
2. Verify the complete summary and independently recompute duration, coverage,
   spacing, readiness, identity and raw-file integrity.
3. Perform a fresh post-soak host preflight.
4. Publish sanitized qualification evidence and review admission separately.

Oracle is distinct from AWS A and Google B, but shares the Collector provider
and tenancy. This does not establish independent operators or upstream RPCs.
Milestone 1 formal acceptance remains pending; Milestone 2 remains not started.
