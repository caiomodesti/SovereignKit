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
- External clarification required: Devnet/Mainnet scope, free-tier independence acceptance, incoming partner scope, and controlled DNS availability.
- Status remains `IMPLEMENTED_NOT_VALIDATED`; no provider host exists and no billing is authorized.
- Next action: obtain written clarification, verify free-tier account eligibility, and test one free canary before considering paid infrastructure.

Milestone 2 has not started.
