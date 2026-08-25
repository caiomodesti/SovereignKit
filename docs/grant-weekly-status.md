# SovereignKit grant weekly status

This append-only human-readable status log supports the grant's weekly communication requirement. Detailed evidence remains in versioned artifacts and milestone acceptance indexes.

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

Milestone 2 has not started.
