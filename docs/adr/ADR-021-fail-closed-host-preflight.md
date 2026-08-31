# ADR-021 — Fail-closed observer host preflight

Status: Accepted
Date: 2026-08-26

## Context

Milestone 1 acceptance requires retained evidence that each external observer
host had a synchronized clock, restricted signing key, healthy runtime, pinned
software, and enough disk. Manually authored health JSON could repeat operator
claims without measuring the host that actually ran the observer.

## Decision

Every external Milestone 1 observer must produce a
`GrantM1HostPreflight@0.2.0` record on its own Linux host before its operational
evidence can be accepted. The command runs as the observer service account and
fails closed unless all of the following are true:

- `timedatectl` reports NTP synchronization;
- the observer systemd service is active and enabled;
- the health port is bound exclusively to loopback;
- the loopback-only `/ready` endpoint reports the expected observer identity;
- every deployed file matches the SHA-256 in the frozen Observer runtime
  manifest and the installed systemd unit matches the staged unit;
- the running Node.js version equals the frozen deployment runtime;
- the observer key is a regular non-symlink file owned by the running service
  account, with no group or other access;
- the evidence filesystem meets the explicit free-space floor.

The record is created exclusively with mode `0600`, synchronized before close,
and contains no key contents, IP address, account credential, or provider token.
The readiness request cannot follow redirects or target a non-loopback host.

## Consequences

- Unsafe hosts cannot emit a nominally passing health record through this tool.
- The resulting JSONL is directly usable as indexed `health_history` evidence.
- The command is intentionally Linux-only; unit tests on Windows prove logic,
  not real-host state.
- Deployment no longer depends on a mutable Git checkout on the observer host.
- A passing preflight proves bounded local host conditions at one timestamp. It
  does not prove provider independence, ongoing health, truthful provider
  metadata, restart durability, network policy, backup, or complete evidence
  publication.
