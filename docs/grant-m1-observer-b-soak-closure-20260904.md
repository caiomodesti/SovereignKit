# Observer B — soak closure verification, 2026-09-04

Status: `SOAK_AND_POSTFLIGHT_VERIFIED_PENDING_ADMISSION_RECORD`

This record documents live verification, not formal Milestone 1 acceptance.
Observer C provisioning and Milestone 2 have not started in this operation.

## Independently verified soak

- Observer: `observer-google-e2-micro`.
- Start: `2026-09-03T10:24:53.541Z`.
- Completion: `2026-09-04T10:24:53.580Z`.
- Duration: 86,400 seconds; interval: 60 seconds.
- Samples: 1,440 of 1,441 expected; coverage: 0.9993060374739764.
- Readiness: 1.0; identity mismatches: 0; maximum gap: 60,162 ms.
- Runner: `Result=success`, `ExecMainStatus=0`.
- Raw SHA-256: `9766a6f5c544ba4343b793cfa2e4df6bfcd059ceb31c8ec5ca6b010fa45942b6`.
- Independent gate: `GRANT_M1_OBSERVER_CANARY_EVIDENCE`, `PASS`, no blockers.

The verifier was absent from the immutable deployed runtime. It was fetched
from repository commit `3ae8d038a263f79c43f30404ae7f9d654df8eef8` into a
separate temporary directory. All three source hashes were checked against
the local Git objects before execution as the observer service account.
The deployed runtime and raw evidence were not changed or restarted.
The verifier recomputed the complete summary and checked the raw SHA-256,
sequence, sample outcomes, duration, coverage, readiness, and spacing.
This is independent recomputation, not review by an independent organization.

## Post-soak host preflight

- Captured: `2026-09-04T10:42:03.805Z`.
- Schema: `GrantM1HostPreflight@0.2.0`; ready: true; all 14 checks true.
- Runtime: `44031a66466e48fce5e1e93a86a7d48867edf134`.
- Node: `v22.17.0`; manifest: 180 files verified.
- Evidence SHA-256: `b881c124598cf7b89d4991a80075956b1453a4b28705432889c20ff630938081`.
- Clock, key metadata, runtime, systemd unit, active/enabled service,
  exclusive loopback binding, and disk floor passed.
- Raw and summary files were mode 0600, owned by the service account.
- At the closure check, readiness reported deliveredCount 2 and queuedCount 0.

No private key content was read. These are host/transport qualification
samples, not signed Solana transaction observations for the grant KPI.

## Remaining admission work

Latest checkpoint: the network lookup completed at `2026-09-04T11:43:30.088Z`.
The authorized query used the VM's metadata-derived public address only for
RIPEstat lookup; no address or prefix is retained in public evidence.
Both origins, AS43515 and AS15169, were returned and retained, with their
RIPEstat holder labels. See `fixtures/grant-m1/observer-google-b-network-20260904.json`.
This closes the network-attribution lookup, not full M1 acceptance or RPC
independence. Historical pending statements below describe earlier checkpoints.

### Devnet integration checkpoint — 2026-09-04

The approved Observer A reader configuration was transferred privately and
installed on B with service-account ownership and mode 0600. These are shared
logical RPC routes; no independent upstream-reader claim is made.

A fresh, coordinator-signed short-lived assignment queried the historical
Devnet transaction used for A's integration test. This is historical ledger
integration evidence, not a fresh submission, comparative experimental unit,
or new transaction-accessibility KPI sample.

- Assignment: `b421d1da-7305-4da7-953d-3b005902ba0b`.
- Result: `045388a2-717c-43b5-b203-97c8abc538af`.
- Worker terminal state: `FINALIZED`.
- Raw polls and unsigned result retained in the private host evidence directory.
- Runtime signed and delivered the result through its existing durable spool.
- Delivery: `2026-09-04T11:00:10.409Z`, Collector status `ACCEPTED`.
- Result payload hash: `f5cf3e356961dd89209659bcc9c7f747fe16e507bfd6301f7ea3219bca5152e2`.
- Readiness after delivery: ready, deliveredCount 3, queuedCount 0.
- Runtime start time remained `2026-09-03T10:23:19.941Z`; no restart or
  runtime replacement occurred.

The original preparation command failed before writing its assignment due to
command-string escaping; the corrected preparation then executed successfully.
The retained result still requires bundle-level correlation/signature checking
against the Collector's stored record before it is promoted to accepted evidence.

Subsequent verification completed on 2026-09-04: the Collector record was
exported read-only (sequence 8, collected at `2026-09-04T11:00:10.325Z`),
and its observer signature passed against the Collector's public allowlist.
Collector health reported storedCount 9. The local seven-file Devnet bundle
passed `GRANT_M1_DEVNET_EVIDENCE_BUNDLE`, including coordinator signature,
observer signature, assignment correlation, raw polls, quorum, and receipt.
It is retained under `artifacts/grant-m1/observer-b/devnet-bundle-20260904`;
it is not yet published. The third reader error remains in the evidence.

Local import hashes were compared with the original VM files and matched:

- raw observations: `c2adc95ee53cca2b02661b71daac8c23a3b79f9324aa12495df0b9a2cdc9226a`;
- signed assignment: `919c519338709ebe830586463f9adb67affd6e8ccec725a323cd34b175e15e3b`.

Remaining work is topology/ASN corroboration, explicit upstream overlap,
final sanitized publication, and formal host admission. Full M1 acceptance
still requires the complete three-observer acceptance package.

### Export checkpoint

On 2026-09-04, the three explicitly selected files (raw JSONL, summary,
post-soak preflight) were copied from the VM to a private Cloud Shell directory.
The archive is mode 0600; originals remain unchanged on the VM. The exported
raw file contains 1,440 records and matches the raw hash above; the exported
preflight also matches its recorded hash. Summary SHA-256:
`0b1b18b78e31bdcd3968a56ac2cd5d67e3649d7fea4d835f23f9e00d78be67a6`.
This is a second private copy, not yet a published or local-repository bundle.

Authenticated control-plane inspection confirmed RUNNING, e2-micro,
us-central1-a, creation timestamp `2026-09-02T18:20:48.581-07:00`.
This confirms deployment metadata, not a corroborated network ASN or
independent upstream RPC paths.

The final M1 acceptance contract additionally requires per-observer signed
FINALIZED results, matching signed assignment provenance, correlated raw
reader polls, delivery/recovery evidence, provider evidence, and failure cases.
The stability samples and two transport fixtures must not substitute for those
transaction-evidence requirements.

At `2026-09-04T10:52:01Z`, a bounded filename-only search found no reader
configuration under `/etc/sovereignkit` (depth 2), nor assignment/observation
artifacts under `/var/lib/sovereignkit` (depth 3). This is not a claim about
all possible host locations. Readiness still reported ready, deliveredCount 2,
queuedCount 0, and the original post-reboot start time. The next operational
step is to locate/reuse the approved reader and public authority configuration,
then run a fresh short-lived signed Devnet observation assignment on B and
retain correlated polls/result/receipt. No such job was run in this check.

Retain a local/public sanitized bundle, reconcile provider/region/ASN and upstream
overlap limitations, update the admission contracts and status documents
together, run the full verification and secret audit, and complete PR review/CI
before formal admission and any Observer C provisioning. The successful soak
does not need to be repeated unless a later gate reveals invalid evidence or
a material runtime change requires requalification.
