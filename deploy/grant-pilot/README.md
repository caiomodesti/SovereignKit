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

Create the assignment authority once on the controlled coordinator host. Keep
the private document outside the repository and copy only the public entry to
the observer allowlist:

```bash
node packages/collector/dist/assignment-authority-keygen-process.js \
  grant-coordinator assignment-key-2026-01 \
  /etc/sovereignkit-coordinator/assignment-private.json \
  /var/lib/sovereignkit-coordinator/assignment-public.json \
  2026-08-25T00:00:00.000Z 2026-12-31T23:59:59.999Z

node packages/collector/dist/observation-assignment-sign-process.js \
  /etc/sovereignkit-coordinator/assignment-private.json \
  /var/lib/sovereignkit-coordinator/jobs/job-000001.json \
  /var/lib/sovereignkit-coordinator/signed/job-000001.json \
  2026-08-25T12:00:00.000Z 2026-08-25T12:10:00.000Z
```

The signer refuses to overwrite an existing output. Assignment validity may
never exceed 24 hours; operational jobs should use the shortest interval that
covers their observation deadline and delivery handoff.

1. Copy `observer-runtime.example.json` to `/etc/sovereignkit/observer-runtime.json` and replace placeholders.
2. Copy `reader-registry.example.json` to `/etc/sovereignkit/readers.json`, configure exactly three logical HTTPS readers, and document any shared upstream infrastructure.
3. Create the job centrally, wrap it in a short-lived `ObservationAssignment@0.1.0`, and sign that assignment with the grant coordinator's dedicated Ed25519 assignment key. Place only the signed assignment at `/var/lib/sovereignkit/jobs/<job-id>.json`; publish the matching public entry in `/etc/sovereignkit/assignment-authorities.json` on every observer. The coordinator private key never enters an observer host.
4. Start `sovereignkit-observation-worker@<job-id>`. The oneshot unit verifies issuer allowlisting, signature, payload hash, and validity before making reader calls. It writes a new raw JSONL and unsigned ProbeResult with exclusive-create semantics, so a repeated or conflicting assignment cannot silently overwrite evidence.
5. The long-running observer runtime detects that locally derived output in `/var/lib/sovereignkit/spool/*.json`, signs it, and delivers it to the Collector.
6. Install the hardened `systemd/sovereignkit-observer.service` and `systemd/sovereignkit-observation-worker@.service` templates.
7. Inspect `http://127.0.0.1:8790/health` and `/ready` through SSH or the provider monitoring plane.
8. Retain the immutable signed assignment, assignment-authority public entry, raw observation JSONL, journal heartbeats, and `/var/lib/sovereignkit/evidence/observer-delivery.jsonl`.

After the long-running observer is active, capture the fail-closed host preflight
on each Linux observer. Use the exact frozen commit being deployed; the command
refuses an unsynchronized clock, inactive service, dirty or mismatched checkout,
wrong Node.js runtime, non-loopback readiness URL, insecure/symlinked key, wrong
observer identity, or insufficient disk. It writes with exclusive-create mode
and never reads the key contents:

```bash
sudo -u sovereignkit -- node scripts/capture-grant-m1-host-preflight.mjs \
  --observer-id observer-provider-a \
  --key-path /etc/sovereignkit/secrets/observer-private.json \
  --runtime-root /opt/sovereignkit \
  --expected-runtime-commit REPLACE_WITH_FROZEN_40_CHARACTER_COMMIT \
  --expected-node-version v22.17.0 \
  --health-url http://127.0.0.1:8790/ready \
  --service sovereignkit-observer.service \
  --output /var/lib/sovereignkit/evidence/host-preflight-0001.jsonl
```

The preflight must run as the same `sovereignkit` service account that owns the
private key. Running it as `root` intentionally fails the ownership check.

Run this separately on all three hosts. A local or copied record does not prove
provider independence, and a PASS does not replace restart, provider, failure,
or signed-observation evidence.

The signed assignment proves who authorized the job and that its submission metadata was not altered after authorization. It does not independently prove that the issuer's submission claim is true. Milestone 1 acceptance therefore also requires the local observation-worker command, its exclusive assignment-bound raw reader log, process/journal evidence, and cross-host validation. Precomputed or centrally fabricated unsigned results cannot satisfy acceptance.

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

## Single RPC route preflight

An RPC provider account is a route dependency, not an observer deployment. Test each
credential-bearing Devnet endpoint before it enters an observer registry, while
keeping the complete URL below the ignored `.secrets/` directory:

```powershell
New-Item -ItemType Directory -Force .secrets | Out-Null
Copy-Item deploy/grant-pilot/rpc-route-endpoint.example.txt .secrets/alchemy-devnet-endpoint.txt
# Replace the single placeholder line locally. Never paste the endpoint into chat or Git.
corepack pnpm@11.16.0 preflight:grant:m1:rpc-route -- `
  --endpoint-file .secrets/alchemy-devnet-endpoint.txt `
  --route-id alchemy-solana-devnet `
  --provider-label Alchemy `
  --output artifacts/grant-m1/rpc-routes/alchemy-devnet-preflight.json
```

The command requires HTTPS, rejects URL userinfo/query/fragment credentials, calls
`getHealth`, `getGenesisHash`, `getVersion`, and finalized `getSlot`, and writes only
the endpoint origin. It never writes the credential-bearing path. The output is
explicitly `SINGLE_LOGICAL_RPC_ROUTE_PREFLIGHT_ONLY`; it establishes neither an
independent observer nor Milestone 1 acceptance.

Build `evidence-index.json` from `evidence-index.example.json` only after the
files are final. Replace every zero hash with the SHA-256 of the referenced
artifact and add one complete entry per observer. The acceptance verifier
requires version `GrantM1EvidenceIndex@0.3.0`, observer-scoped paths, valid
assignment and observer signatures, assignment-correlated raw polls,
non-placeholder operational evidence, and no private-key markers.

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
- `assignment_provenance`: at least one valid short-lived signed assignment
  whose job exactly matches an indexed ProbeResult;
- `raw_observations`: parseable `RawObservationPoll@0.2.0` JSONL correlated to
  both the signed assignment and transaction result and containing exactly
  three reader IDs.

The example contains one observer only to show the shape. A candidate bundle
must expand it to at least three complete observer entries and replace every
placeholder and zero hash before running acceptance.

Before provisioning any provider, rehearse this exact evidence path against the
project-controlled local Agave validator with
`scripts/run-grant-m1-local-readiness.ps1`. Its output is intentionally marked
`LOCAL_SOFTWARE_READINESS_ONLY`; copying or relabeling that evidence into the
external acceptance directory is prohibited.

Exercise Observer/Collector outage recovery separately with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-grant-m1-recovery-drill.ps1
```

The drill proves only local queue preservation, Observer restart delivery,
Collector log reconstruction, and duplicate suppression. Every external host
must repeat the equivalent exercise for Milestone 1 acceptance.
