# SovereignKit Grant Pilot Plan

Status: planning baseline only  
Grant decision: pending  
Grant scope: USD 1,500  
Target deadline: 2026-10-31  
Baseline reference: `pre-grant-pilot-v0.1` at `2f85184`  
Implementation gate: Milestone 1 MUST NOT start without explicit authorization after grant approval.

## Purpose and scope

The grant pilot is a bounded extension of SovereignKit v0.1. It will test whether the existing controlled transaction-accessibility proof can support a small public operational pilot without replacing the accepted telemetry, evidence, analysis, SDK, or reporting foundations.

The proposed scope is:

1. deploy and validate at least three operationally independent observers across distinct infrastructure providers;
2. operate the observer set for at least 14 days across multiple logical Solana transaction routes;
3. retain at least 3,000 qualifying signed transaction-accessibility observations;
4. publish the signed dataset, methodology, updated public observatory, reproducible outputs, and final technical report.

The pilot is not a production SLA, provider-ranking service, censorship oracle, decentralized network, generic transaction classifier, or rewrite of SovereignKit.

## Current baseline

The frozen baseline is Git tag `pre-grant-pilot-v0.1` at commit `2f85184`. It contains the accepted v0.1 controlled proof, the narrow Devnet integration proof, the static public evidence dashboard, and the Sprint 12 release gate.

Accepted baseline capabilities include:

- immutable telemetry events and deterministic lifecycle derivation;
- explicit separation of RPC acknowledgement from ledger observation;
- three logical readers and 2-of-3 observation quorum;
- unique methodologically matched transactions per route, class, and probe index;
- Ed25519 observer identities, signed `ProbeResult` evidence, allowlisting, and signature verification;
- durable local append-only collector ingestion, idempotency, duplicate rejection, and replay validation;
- explicit experiment windows, missingness handling, and `ClassificationPolicyV0Experimental`;
- versioned intelligence snapshots with provenance, TTL, hysteresis, developer override, and fail-open behavior;
- bounded primary/fallback SDK routing;
- accepted controlled fixtures, one finalized Devnet lifecycle, public dashboard data, and reproducible Markdown/JSON/CSV reports.

The three readers in the accepted controlled experiment share a validator and host. They prove logical redundancy only and are not evidence of operational infrastructure independence.

## Preservation rules

The following rules apply for the entire pilot:

- no clean rewrite;
- extend existing abstractions before adding replacements;
- no silent public contract changes;
- no removal or rewriting of accepted evidence;
- no weakening existing tests or acceptance checks;
- no deletion of fixtures because a later architecture differs;
- no silent schema changes;
- schema changes require explicit versioning and a documented migration or coexistence strategy;
- `main` must remain buildable;
- deterministic core tests must remain passing;
- accepted evidence verification must remain passing;
- `RPC_ACKNOWLEDGED` never means landing;
- classification must remain derived exclusively from retained measurements;
- no censorship, malicious-provider, or intent claim without evidence supporting exactly that claim;
- infrastructure independence cannot be simulated or inferred solely from self-reported metadata;
- three processes, containers, readers, or endpoint aliases on one host do not count as independent observers;
- code existence does not equal milestone acceptance;
- controlled, Devnet integration, and grant-pilot operational evidence must remain methodologically separate;
- private keys, cloud credentials, seed phrases, and provider tokens must never be committed or printed in logs.

## Primary KPI

Success requires all of the following:

- at least three operationally independent observers across distinct infrastructure providers;
- at least 14 days of real operation;
- at least 3,000 qualifying signed transaction-accessibility observations;
- multiple predefined logical Solana transaction routes;
- a publicly available evidence dataset and methodology.

A qualifying observation must be defined and frozen before the official observation window. At minimum it must originate from an authorized observer, have a valid signature and schema version, map to a frozen experiment/observer/route/class/probe unit, contain sufficient provenance, pass collector validation, not be a duplicate, preserve lifecycle and timestamps, and remain publicly verifiable.

## Milestone 1 — Independent Observation Layer

### Objective

Deploy and validate at least three real observer runtimes across distinct infrastructure providers while reusing the current identity, signing, telemetry, quorum, collector, and evidence model.

### Acceptance criteria

- three or more unique observer identities and signing keys;
- three or more live observer deployments on defensibly distinct providers;
- signature verification before ingestion;
- observer authorization/allowlist;
- health, readiness, and heartbeat/liveness evidence;
- retained provider, region, runtime, and deployment metadata;
- healthy, unavailable, delayed, invalid-signature, unknown-observer, duplicate, malformed, stale, disagreement, quorum-available, and quorum-unavailable tests;
- repeatable deployment and recovery documentation;
- retained evidence proving real operation and documented limitations of the independence claim.

Milestone 1 may be `IMPLEMENTED_NOT_VALIDATED` when software and deployment tooling are complete. It becomes `ACCEPTED` only after evidence from three real external deployments exists.

## Milestone 2 — Public Evidence Pilot

### Objective

Run the accepted observer topology for at least 14 days across multiple frozen routes and collect at least 3,000 qualifying signed observations.

### Acceptance criteria

- experiment definition, observer set, route set, schema versions, policy version, cadence, windows, inclusion/exclusion rules, and missing-data behavior frozen before collection;
- continuous operation for at least 14 days;
- at least 3,000 qualifying observations;
- participation from every accepted observer and route;
- signature and schema validation for every qualifying observation;
- retained raw evidence, health history, cumulative counts, daily summaries, and incident log;
- no unresolved evidence-integrity failure;
- dataset generated without cherry-picking, retroactive rule changes, or silent exclusions.

Until the real time requirement is met, the maximum status is `IN_PROGRESS`.

## Milestone 3 — Open Evidence Release

### Objective

Publish the pilot as an auditable public good without mixing its operational evidence with the controlled or Devnet integration proofs.

### Acceptance criteria

- versioned public signed dataset with checksums and provenance;
- complete public methodology and explicit claim boundaries;
- updated read-only observatory showing freshness, observer participation, route evidence, evidence strength, sample counts, incidents, methodology, and limitations;
- reproducible commands for schema validation, signature verification, analysis, summaries, and report generation;
- final technical report with target-versus-actual KPI results;
- one-page grant acceptance index mapping milestone, requirement, evidence, file/URL, and verification command;
- full regression, security, privacy, broken-link, dataset, dashboard, and SDK gates passing.

## Evidence requirements

Evidence is accepted only when retained and independently verifiable. Expected evidence includes:

- signed observer results and public keys;
- signed heartbeat/liveness records;
- append-only collector logs and deterministic ingestion outcomes;
- versioned observer and route registries;
- provider instance identifiers and sanitized billing/provisioning records;
- public IP, ASN, region, and topology observations where defensible;
- deployment manifests, software versions, configuration hashes, and service health history;
- incident records, daily summaries, cumulative qualifying counts, and missing/invalid counts;
- dataset manifests, SHA-256 checksums, report source hashes, public URLs, and reproduction commands.

Cryptographic identity authenticates the allowlisted key. It does not by itself prove truth, provider identity, geographic location, operational independence, or complete publication by a central collector.

## External dependencies

The following items cannot be satisfied solely inside the repository and remain `BLOCKED_BY_USER` until provided:

| Dependency | Required action | Needed by | Expected cost |
|---|---|---|---:|
| Three infrastructure providers | Create accounts, enable billing, and provision one supported VM per provider | Milestone 1 validation | Approximately USD 15–40/month total |
| Solana RPC routes | Create multiple Devnet RPC endpoints and retain provider/rate-limit metadata | Milestone 1 dry run | USD 0–49/month per endpoint depending on tier |
| DNS and TLS | Provide a controlled hostname or approved managed HTTPS endpoint | Remote ingestion validation | USD 0 with managed subdomain; domain typically USD 10–20/year |
| Secret custody | Configure provider/GitHub secrets or an approved secret manager without exposing values in chat or Git | Before external deployment | Approximately USD 0–5/month |
| Hosted collector/feed | Approve a deployment account/project and retention location | Milestones 1–2 | Approximately USD 5–20/month |
| Monitoring destination | Provide an alert destination and account if required | Before official pilot | Approximately USD 0–10/month |
| Public dataset hosting | Approve GitHub Release, object storage, or static-hosting destination | Milestones 2–3 | Approximately USD 0–5/month |
| Independence evidence | Preserve sanitized instance IDs, invoices, region records, and provider ownership evidence | Milestone 1 acceptance | No additional expected cost |
| Grant decision | Confirm grant approval and explicitly authorize Milestone 1 | Before implementation | External decision |

Credentials must be entered directly into the selected provider, secret manager, or GitHub Environment. Primary account passwords, seed phrases, private keys, and billing credentials must not be sent through chat.

## Acceptance matrix

Allowed status values are `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED_BY_USER`, `IMPLEMENTED_NOT_VALIDATED`, and `ACCEPTED`.

| Requirement | Implementation | Test | Evidence | Status |
|---|---|---|---|---|
| Frozen pre-pilot baseline | Annotated Git tag at current accepted `origin/main` | Full regression baseline | Tag, commit ID, clean-tree check, gate outputs | ACCEPTED |
| Three independent observers | Extend current observer process into deployable runtimes | Runtime, failure, restart, and cross-host validation | Three signed identities and real deployment records | BLOCKED_BY_USER |
| Distinct providers | Infrastructure-independent configuration | Provider/topology review | Sanitized instance/provider/ASN evidence | BLOCKED_BY_USER |
| Cryptographic identity | Existing Ed25519 identity and allowlist | Existing signing/ingestion tests plus rotation test | Public keys, key IDs, validity records | IMPLEMENTED_NOT_VALIDATED |
| Signed observations | Existing signed `ProbeResult` | Existing signature tests plus deployed observation verification | Signed payloads and hashes | IMPLEMENTED_NOT_VALIDATED |
| Signature verification | Existing collector verification | Invalid, unknown, expired, and altered payload tests | Collector outcomes and verifier output | IMPLEMENTED_NOT_VALIDATED |
| Observer health | Reuse collector health; add observer health/readiness | Healthy, degraded dependency, stale heartbeat | Health history | NOT_STARTED |
| Failure detection | Add signed heartbeat and timeout policy | Unavailable, delayed, stale, recovery | Failure timeline and incident record | NOT_STARTED |
| Remote authenticated ingestion | Keep collector core behind a secure remote boundary | TLS/auth, limits, retry, duplicate, outage | Ingress config and accepted/rejected evidence | NOT_STARTED |
| Multiple logical routes | Existing route model; configure external Devnet endpoints | Per-route submission/observation dry run | Frozen route registry | BLOCKED_BY_USER |
| Continuous operation | Add scheduler, supervisor, spool, and monitoring | Restart, missed cadence, collector outage, disk limit | Runtime and daily health records | NOT_STARTED |
| Fourteen-day window | Operate accepted topology for real elapsed time | Window-boundary validator | First/last timestamps and daily records | BLOCKED_BY_USER |
| 3,000 qualifying observations | Freeze validator and collect above target with margin | Qualification and cumulative-count checks | Public qualifying index and totals | BLOCKED_BY_USER |
| Public evidence feed | Extend existing versioned snapshot pipeline | Freshness, schema, rollback, aggregation, fail-open | Hosted machine-readable snapshots | NOT_STARTED |
| Public signed dataset | Extend accepted fixture/report conventions | Schema, signature, duplicate, checksum validation | Versioned release and manifest | NOT_STARTED |
| Public methodology | Extend current methodology with operational precommitment | Link/content/claim-boundary review | Published methodology and hash | NOT_STARTED |
| Updated observatory | Add a separately versioned grant-pilot view | Dashboard build, dataset validation, empty/error/stale states | Public URL and screenshots | NOT_STARTED |
| Reproducible outputs | Reuse deterministic report and verifier pipeline | Byte/checksum reproduction | Markdown/JSON/CSV and manifest | IMPLEMENTED_NOT_VALIDATED |
| Final technical report | Extend Sprint 11 report structure | Rebuild, link, KPI consistency checks | Public report and source manifest | NOT_STARTED |
| Infrastructure independence proof | Add topology evidence checklist and registry | Reviewer verification against external records | Provider/instance/ASN evidence with limitations | BLOCKED_BY_USER |
| Milestone completion proof | Reuse acceptance-report and evidence-index pattern | Requirement-to-evidence audit | Grant acceptance index | NOT_STARTED |

No milestone row may move to `ACCEPTED` merely because code exists.

## Regression baseline

The following current gates must remain passing throughout the pilot:

```powershell
corepack pnpm@11.16.0 install --frozen-lockfile --ignore-scripts
. .\scripts\use-pinned-toolchain.ps1
corepack pnpm env:doctor
corepack pnpm build
corepack pnpm check
corepack pnpm test
corepack pnpm test:coverage
corepack pnpm test:collector:process
corepack pnpm verify:sprint-5
corepack pnpm verify:sprint-6
corepack pnpm verify:sprint-7
corepack pnpm verify:sprint-8
corepack pnpm verify:sprint-9
corepack pnpm verify:sprint-10:static
corepack pnpm verify:sprint-11
corepack pnpm verify:sprint-12
```

Accepted fixtures and checks that must remain valid include:

- real local Agave healthy lifecycle;
- project-owned matched program evidence;
- controlled `HEALTHY`, `DEGRADED`, `ASYMMETRIC`, and `INSUFFICIENT_DATA` scenarios;
- collector process separation and restart replay protection;
- versioned intelligence snapshot evidence;
- dashboard dataset verification;
- probe-informed fail-open routing;
- accepted and blocked Devnet fixtures;
- deterministic Sprint 11 report generation;
- repository secret scan and locked Rust tests.

The baseline is critical. Milestone 1 must not start while any critical baseline gate is broken or unexplained.

## Baseline validation record

Validation date: 2026-08-23  
Validated reference: `pre-grant-pilot-v0.1` / `2f85184`  
Result: PASS

| Gate | Result |
|---|---|
| Pinned environment | PASS — Node.js 22.17.0, pnpm 11.16.0, Rust 1.97.1, Agave/Solana CLI 4.0.0 |
| Frozen dependency install | PASS — lockfile current, no version update |
| Build | PASS |
| Typecheck | PASS |
| Deterministic TypeScript tests | PASS — 85/85 |
| Coverage | PASS — 89.26% statements, 81.45% branches, 92.59% functions, 95.06% lines |
| Collector process separation | PASS — 1/1 integration test |
| Controlled classifications | PASS — all four scenarios reproduced byte-identically |
| Signed evidence | PASS — 600/600 signatures reverified |
| Collector replay/idempotency | PASS — 600 accepted, 600 duplicate replays, 600 restored after restart |
| Intelligence snapshot | PASS |
| Dashboard fixture | PASS — 4 scenarios, 3 routes, 600 signed results |
| Probe-informed routing | PASS |
| Devnet evidence | PASS — accepted finalized fixture and blocked fixture both verified |
| Public report | PASS — byte-reproducible from 42 source files |
| Repository secret scan | PASS — 309 tracked files, zero forbidden paths or signature findings |
| Production dependency audit | PASS — no known vulnerabilities found |
| Rust tests | PASS — 3/3 |

The first sandboxed typecheck attempt could not read installed AJV modules because of host filesystem permissions. The same pinned checkout, lockfile, and command passed after execution with normal host read access. No source, manifest, lockfile, or dependency version was changed to obtain the passing result.

## Known limitations and claim boundaries

- The current accepted observer is local and its readers are not operationally independent.
- Route is a logical submission perspective, not a guaranteed physical path.
- Provider labels and observer metadata are assertions until corroborated by external evidence.
- A valid observer signature proves authorship by an authorized key, not the truth of the observation.
- A central collector can suppress evidence even when it cannot forge observer signatures.
- The controlled classifier is experimental and is not a universal production algorithm.
- Devnet integration does not establish Mainnet performance, provider misconduct, or censorship.
- A 14-day, 3,000-observation pilot remains a bounded operational sample, not a decentralized network or universal Solana accessibility index.

## Execution gate

This document prepares the baseline and plan only. Because grant approval is pending, Milestone 1 remains gated. No observer runtime, remote collector, deployment infrastructure, hosted feed, or other milestone feature may begin until the user explicitly authorizes Milestone 1 after the grant decision.
