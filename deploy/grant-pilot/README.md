# Grant pilot deployment contract

Status: software template only; no external deployment is accepted by the presence of these files.

## Topology

- one HTTPS edge terminates TLS and forwards only `POST /v0/probe-results` to a loopback Collector;
- one single-writer Collector retains the accepted append-only JSONL;
- three observer hosts run one unique Ed25519 identity each on distinct infrastructure providers;
- each observer health endpoint remains bound to `127.0.0.1` and is inspected through the host monitoring plane or an authenticated tunnel;
- observer signing keys never leave their observer host and never hold funds.

Three processes, containers, endpoint aliases, accounts under the same underlying provider, or hosts behind one operational control plane do not automatically establish independence.

## Pinned runtime

Deploy the exact Git commit under review with Node.js `22.17.0` and pnpm `11.16.0`. Install with `pnpm install --frozen-lockfile --ignore-scripts`, build, and retain the commit SHA in the observer registry. Do not use floating container tags or silently upgrade the toolchain.

## Observer identity

Run key generation independently on each observer host. Never run it in CI and never send private output through chat:

```bash
node packages/collector/dist/observer-keygen-process.js \
  observer-provider-a key-2026-01 \
  /etc/sovereignkit/secrets/observer-private.json \
  /var/lib/sovereignkit/public-allowlist-entry.json \
  2026-08-24T00:00:00.000Z 2026-12-31T23:59:59.999Z
```

The command refuses to overwrite either path. Copy only the public allowlist entry to the Collector host. On Linux the private key must remain mode `0600`; on other systems configure an explicit equivalent ACL.

## Observer runtime

1. Copy `observer-runtime.example.json` to `/etc/sovereignkit/observer-runtime.json` and replace placeholders.
2. Copy `reader-registry.example.json` to `/etc/sovereignkit/readers.json`, configure exactly three logical HTTPS readers, and document any shared upstream infrastructure.
3. Place a versioned observation job at `/var/lib/sovereignkit/jobs/<job-id>.json` and start `sovereignkit-observation-worker@<job-id>`. The oneshot unit writes a new raw JSONL and unsigned ProbeResult with exclusive-create semantics, so a repeated or conflicting job cannot silently overwrite evidence.
4. The long-running observer runtime detects that locally derived output in `/var/lib/sovereignkit/spool/*.json`, signs it, and delivers it to the Collector.
5. Install the hardened `systemd/sovereignkit-observer.service` and `systemd/sovereignkit-observation-worker@.service` templates.
6. Inspect `http://127.0.0.1:8790/health` and `/ready` through SSH or the provider monitoring plane.
7. Retain the immutable job, raw observation JSONL, journal heartbeats, and `/var/lib/sovereignkit/evidence/observer-delivery.jsonl`.

The signing runtime cannot by itself prove that an unsigned observation was derived honestly. Milestone 1 acceptance therefore requires the local observation-worker command, its exclusive raw reader log, process/journal evidence, and cross-host validation. Precomputed or centrally fabricated unsigned results cannot satisfy acceptance.

## Collector and TLS

The Collector remains loopback-only by design. Install `systemd/sovereignkit-collector.service`, place the merged public allowlist at `/etc/sovereignkit/allowlist.json`, and use the Caddy template to expose only the signed ingestion route over HTTPS. The Collector's `/health` endpoint remains private. Apply provider firewall limits, log retention, clock synchronization, disk alerts, and backups before external validation.

## Required retained evidence

- provider, account, sanitized instance ID, region, ASN/network, provision time, and runtime commit;
- proof that each provider and control plane is distinct;
- public key and validity interval for each observer;
- local health/readiness and journal heartbeat history;
- signed results, Collector receipts, raw reader observations, and restart evidence;
- failure tests and recovery commands;
- sanitized invoice or provider-console evidence where available;
- explicit limitations where ownership, ASN, geography, or upstream RPC routes overlap.

Secrets, unredacted invoices, account passwords, payment data, IP allowlist secrets, API tokens, and private keys must not be published.

Build `evidence-index.json` from `evidence-index.example.json` only after the
files are final. Replace every zero hash with the SHA-256 of the referenced
artifact and add one complete entry per observer. The acceptance verifier
requires version `GrantM1EvidenceIndex@0.2.0`, observer-scoped paths, valid
signatures, correlated raw polls, non-placeholder operational evidence, and no
private-key markers.

The content contracts for each observer are:

- `health_history`: at least one record with matching `observer_id`,
  `ready: true`, `clock_synchronized: true`, and
  `key_permissions_verified: true`;
- `restart_evidence`: at least one matching record with
  `restart_succeeded: true` and `recovered_records >= 1`;
- `provider_evidence`: a matching `observer_id`, provider label, region, and
  non-zero ASN plus `corroborated: true`;
- `failure_matrix`: one matching record whose `cases` marks `HEALTHY`,
  `DELAYED`, `ONE_READER_UNAVAILABLE`, `TWO_READERS_UNAVAILABLE`, and
  `DISAGREEMENT` as `PASS`;
- `signed_results`: at least one cryptographically valid `FINALIZED`
  ProbeResult with a valid 2/3 decision;
- `raw_observations`: parseable `RawObservationPoll@0.1.0` JSONL correlated to
  the signed transaction signature and containing exactly three reader IDs.

The example contains one observer only to show the shape. A candidate bundle
must expand it to at least three complete observer entries and replace every
placeholder and zero hash before running acceptance.

Before provisioning any provider, rehearse this exact evidence path against the
project-controlled local Agave validator with
`scripts/run-grant-m1-local-readiness.ps1`. Its output is intentionally marked
`LOCAL_SOFTWARE_READINESS_ONLY`; copying or relabeling that evidence into the
external acceptance directory is prohibited.
