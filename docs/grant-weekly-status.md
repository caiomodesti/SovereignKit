# SovereignKit grant weekly status

This append-only human-readable status log supports the grant's weekly communication requirement. Detailed evidence remains in versioned artifacts and milestone acceptance indexes.

Communication cadence and claim boundaries are defined in
[Grant progress communications](grant-progress-communications.md). The normal
cadence is one concise public update per week, plus an additional update only
when a milestone is accepted or a material blocker changes. Daily engineering
activity belongs in commits and CI rather than promotional status claims.

## 2026-08-24 — Grant activation

- Grant: approved for USDG 1,500.
- KYC: founder reported completion.
- Active milestone: Milestone 1 — Independent Observation Layer.
- Baseline: `pre-grant-pilot-v0.1` at `2f85184`.
- Planning commit: `9180064`.
- Current status: `IMPLEMENTED_NOT_VALIDATED`.
- Completed: grant plan, frozen baseline, project master plan, milestone sequencing, claim boundaries, and implementation authorization.
- Engineering completed this week: local observation worker, raw reader log, explicit quorum derivation, dedicated key generation, long-running signing/delivery runtime, durable delivery receipts, health/readiness, structured heartbeats, TLS-edge and hardened service templates, topology registry contract, software and acceptance verifiers, and local failure matrix.
- Validation: full typecheck passed; 92/92 deterministic tests passed; separate Observer/Collector process test passed; dashboard production build passed; grant software contract passed; tracked-file secret audit passed.
- Defect found and fixed: a failed-execution confirmation could be counted as successful confirmation at the observation deadline. The hostile disagreement test now prevents regression.
- Environment note: the source checkout's pnpm store and global shim became inconsistent during a sandboxed reinstall. Verification was repeated in a clean temporary checkout with the pinned lockfile; source-controlled code and the secret audit remained in the canonical repository.
- Local software boundary: the observation job, raw log, signed delivery, schema/signature validation, and durable collection path is integrated and tested. This is deterministic local evidence, not a real-provider observation.
- External blockers for acceptance: three real provider accounts/hosts, secret custody, collector hosting, and retained independence evidence.
- Cost incurred for Milestone 1 infrastructure: none recorded in this repository.
- Next action: integrate and retain one local end-to-end observation-to-Collector run, complete the hostile audit, then provision three external hosts only with approved accounts and billing.

## 2026-08-25 — Local deployment-readiness proof

- Runtime commit: `450eb90576307b1975ed525c8365406c25749913`.
- Executed one real legacy System Program transfer against the pinned local Agave 4.0.0 validator.
- Transaction reached `FINALIZED` after 280 retained raw observation polls from three logical reader clients.
- Observer used a temporary dedicated Ed25519 identity; the private key was deleted and the evidence verifier found no private key material.
- Signed ProbeResult was accepted by the durable Collector; reopening the Collector recovered exactly one record.
- Public secret-free evidence anchor: `fixtures/grant-m1/local-readiness-20260825.json`.
- Claim boundary: this is `LOCAL_SOFTWARE_READINESS_ONLY`; all readers and processes shared one machine and validator, so infrastructure independence remains unproven.
- Status remains `IMPLEMENTED_NOT_VALIDATED`; external provider deployments are still required.
- Next action: select benefits/provider accounts, then deploy one observer per distinct infrastructure provider plus the hosted Collector.

## 2026-08-26 — First external Devnet RPC route preflight

- Configured the grant pilot's first external logical RPC route using Alchemy Solana Devnet.
- Rotated the provider API credential after screen exposure and retained the final credential only in the Git-ignored local `.secrets/` directory.
- Added a fail-closed route preflight covering `getHealth`, `getGenesisHash`, `getVersion`, and finalized `getSlot`.
- Live result: health `ok`, expected Devnet genesis hash, Solana core `4.2.1`, and finalized slot `488624802` at capture time.
- Public secret-free evidence anchor: `fixtures/grant-m1/alchemy-devnet-route-20260826.json`.
- Validation: build PASS, typecheck PASS, 93/93 deterministic tests PASS, 18/18 focused grant contracts PASS, grant software gate PASS, tracked-file secret audit PASS.
- Claim boundary: Alchemy is currently one logical RPC dependency. This preflight does not prove an independent observer deployment, provider diversity, quorum independence, or Milestone 1 acceptance.
- Status remains `IMPLEMENTED_NOT_VALIDATED`.
- Next action: complete the zero-cost partner/free-tier review before provisioning the first real observer host and hosted HTTPS Collector.

## 2026-08-26 — Zero-cost-first infrastructure review

- Re-read the immutable Milestones 1–3 and separated required outcomes from implementation choices.
- Verified current public Superteam benefits for Alchemy, GetBlock, Carbium, FluxRPC, and OVHcloud.
- Decision: RPC credits may remove route costs but do not count as independent observer hosts.
- Added ADR-023: free/credit-funded infrastructure must be attempted and validated before the paid ADR-022 fallback can be activated.
- Candidate free compute spans AWS, Google Cloud, and Oracle Cloud; every candidate remains unaccepted until eligibility, host preflight, and a 24-hour canary soak pass.
- Target cash cost: USD 0. Prudential reserve: USD 50/month, maximum USD 100 if two billing months are required.
- Cost incurred: USD 0.
- Contract interpretation: Devnet multiple-route operation, real provider evidence, and controlled Collector HTTPS follow the approved milestone text; no additional Superteam clarification blocks development.
- Status remains `IMPLEMENTED_NOT_VALIDATED`; no provider host exists and no billing is authorized.
- Next action: verify free-tier account eligibility and test one 24-hour canary before considering paid infrastructure.

## 2026-08-27 — Zero-cost candidate topology frozen

- Reverified current official AWS Lightsail, Google Cloud Free Tier, Google E2,
  and Oracle Always Free terms.
- Froze a machine-readable USD 0 candidate topology: AWS Lightsail Observer A,
  Google `e2-micro` Observer B, Oracle A1 Observer C, and a second Oracle A1
  instance as the non-observer Collector.
- Preserved the Oracle Collector/Observer control-plane coupling explicitly;
  the Collector contributes nothing to observer independence.
- Google remains conditional because 1 GiB memory and 1 GiB monthly egress are
  tight. Oracle remains conditional on capacity, ARM64 compatibility, home
  region, and idle-reclamation behavior. AWS remains conditional on actual
  account entitlement and trial expiration controls.
- Added a fail-closed validator that rejects fake eligibility, hidden spend,
  provider overlap, missing 24-hour canaries, unofficial offer references,
  resource-floor violations, Oracle allowance drift, or hidden coupling.
- Cost incurred: USD 0. No account eligibility, provisioning, or host admission
  is claimed.
- Next action: operator account/MFA checks, then Oracle Collector and AWS
  Observer A only; do not create B or C until A passes.

## 2026-08-28 — Oracle Collector canary provisioned, not admitted

- Attempted the frozen Oracle A1 Collector candidate first. Oracle returned a
  concrete AD-1 capacity failure; no A1 instance was created.
- Provisioned an Always Free-eligible Oracle `VM.Standard.E2.1.Micro` only as a
  constrained Collector canary: 1 GiB memory, a documented 1/8 OCPU baseline
  with burst capacity, Oracle Linux 9, and a 46.6 GiB boot volume in
  `sa-saopaulo-1`.
- Restricted SSH to the operator's then-current `/32` address and kept public
  Collector ingestion closed. No secret or provider resource identifier was
  committed.
- Preserved local SSH key permissions after a Windows process-identity mismatch
  prevented direct authentication. Added a single-instance dynamic group and a
  least-privilege Run Command execution policy instead of weakening the key.
- The read-only host preflight is control-plane accepted but not yet observed as
  executed while IAM propagation completes. Acceptance and execution remain
  separate evidence states.
- Live operator record: `docs/grant-m1-live-infrastructure-log.md`.
- Rechecked current Superteam perks. Alchemy, GetBlock, Carbium, and discounted
  RPC offers can reduce route cost; OVHcloud is a discounted compute fallback;
  security and legal benefits are reserved for later acceptance/release work.
  None of these benefits replaces the requirement for three independently
  hosted observer runtimes.
- Cost incurred: USD 0 recorded. Status remains
  `IMPLEMENTED_NOT_VALIDATED`; the canary is
  `PROVISIONED_CANARY_NOT_ADMITTED`.
- Next action: observe a real Run Command execution, run host preflight, deploy
  the loopback Collector, then start its recovery and 24-hour canary gates.

## 2026-08-28 — Oracle E2 micro canary rejected

- Real SSH preflight exposed only 498 MiB physical memory, below the frozen
  1 GiB candidate floor.
- A locally staged Collector-only runtime removed the unnecessary Solana SDK
  dependency and passed 22 focused tests, but the host had already entered
  heavy swap during the earlier install attempt.
- The VM did not restore SSH within the bounded recovery check after a Console
  reboot. Decision: `CANARY_REJECTED_RESOURCE_FLOOR_AND_RECOVERY`.
- No milestone credit is claimed. The next Collector candidate moves outside
  this Oracle micro path; Superteam RPC benefits remain route resources, while
  OVHcloud or the bounded paid topology remain compute alternatives.
- PR 36 passed all required CI and security checks and was merged.

## 2026-08-28 — Oracle E4 Collector replacement running

- Activated Pay As You Go with BRL 1,500 in displayed trial credits and created
  a BRL 60 monthly budget with an 80% actual-spend alert before provisioning.
- Provisioned one `VM.Standard.E4.Flex` Collector canary in São Paulo: 1 OCPU,
  12.5% burstable baseline, 4 GiB memory, Oracle Linux 9, and encrypted boot
  storage. No public Collector ingestion was opened.
- Preserved the Console's BRL 131.21 full-rate estimate and the documented
  burstable calculation of BRL 45.326306625. The project does not present either
  value as a settled bill.
- Real SSH preflight confirmed x86-64, approximately 3.45 GiB visible memory,
  approximately 22 GiB free disk, synchronized UTC time, and no active swap use.
- Deployed the frozen Collector-only runtime at commit
  `d2e5e09c01d890c0f142b0cf22010280c38b366c` with Node.js 22.17.0. Loopback
  health passed and controlled service restart recovery passed.
- Controlled full-VM reboot recovery passed in approximately 49 seconds: SSH,
  enabled service, loopback health, and the protected evidence file recovered.
- Status remains `PROVISIONED_CANARY_NOT_ADMITTED`; durable replay recovery,
  versioned preflight, and 24-hour soak remain pending. Observer queue recovery
  remains an observer-host gate. Milestone 2 has not started.

Milestone 2 has not started.

## 2026-08-28 — Oracle E4 preflight and replay passed; 24-hour soak started

- Corrected the Run Command dynamic group to authorize only the active E4;
  the rejected E2 no longer matches. Preserved the existing least-privilege
  self-consumption policy and did not claim `Accepted` commands as execution.
- The fail-closed preflight exposed an older installed runtime manifest at
  commit `3c904a64b0303c7bd8aad9e37f07fc26f69ab254`. Rebuilt the 124-file
  runtime at frozen commit `d2e5e09c01d890c0f142b0cf22010280c38b366c`,
  deployed it with rollback, and then passed the versioned live-host preflight.
- Passed the real-host Collector durability drill with a short-lived,
  schema-valid synthetic fixture: one accepted append, restart reconstruction,
  duplicate replay, one retained record, and mode-`0600` evidence. This is not
  Solana observation or observer-independence evidence.
- Started the fail-closed 24-hour soak at `2026-08-28T16:26:04.321Z`. The first
  sample was healthy with `stored_count=1`; the Oracle-hosted systemd unit runs
  without requiring the operator PC. Admission remains blocked until the final
  summary passes.
- Status remains `PROVISIONED_CANARY_NOT_ADMITTED`. Milestone 2 has not started.
