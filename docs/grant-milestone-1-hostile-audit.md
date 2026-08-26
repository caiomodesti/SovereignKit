# Grant Milestone 1 hostile audit — in progress

Verdict: `CONDITIONAL GO` for continued Milestone 1 engineering; `NO-GO` for milestone acceptance or Milestone 2.

## What is genuinely proven

- an observer host can derive a result from three reader interfaces, retain raw polls, form a 2/3 terminal decision, sign with a dedicated Ed25519 identity, and submit to an allowlisted durable Collector;
- malformed, unknown, stale, invalid-signature, duplicate, conflicting, delayed, unavailable, and disagreement cases have deterministic local coverage;
- signed delivery receipts and accepted Collector records are append-only and synchronized before in-memory commitment;
- remote Collector configuration requires HTTPS, while health surfaces remain loopback-only in the shipped process templates.
- one retained local Agave run now proves the complete job, raw polling, quorum derivation, temporary-key signing, delivery, health, durable collection, and Collector replay path; its public anchor explicitly denies infrastructure independence.
- the external acceptance verifier now rejects existence-only evidence: every observer artifact is path-scoped and SHA-256 bound, signed results are cryptographically checked, raw polls are correlated, operational records are content-validated, and private-key markers are forbidden.
- observation jobs now require a short-lived Ed25519-signed assignment; raw polls bind to its ID and payload hash, and the external verifier correlates assignment, polls, and ProbeResult.
- a local outage/restart drill proves queued evidence survives Observer restart, delivers after Collector recovery, reconstructs one accepted record after Collector restart, and creates no duplicate delivery record.

## Blocking findings before external acceptance

1. No three real observer hosts exist. Process count, containers, or aliases cannot substitute for providers under distinct control planes.
2. The observation worker and signing/delivery runtime are separate stages. Their handoff and recovery now have local executable evidence, but the procedure still requires real-host execution and evidence.
3. Signed assignment provenance now proves who authorized submission metadata and that it was not altered afterward. Raw reader calls corroborate ledger observation, but neither mechanism independently proves every submission fact is truthful; stronger submission-receipt evidence remains residual.
4. The three logical readers inside one observer may share upstream infrastructure. Reader overlap must be documented and cannot be described as three independent infrastructures.
5. Ed25519 authenticates the observer key, not the truth, location, provider, or completeness of its report.
6. A central Collector can omit valid evidence even though it cannot forge an observer signature. Public omission detection is outside Milestone 1 and remains a follow-on risk.
7. TLS terminates at an external edge. Rate limiting, firewalling, certificate issuance, clock synchronization, disk monitoring, retention, and backup have templates but no real-host evidence.
8. File-based signing keys are appropriate for this bounded pilot only after OS ACL verification. They are not HSM-backed and must never be confused with payer wallets.
9. Observer and Collector clocks affect validity and chronology. No cross-provider clock-drift evidence exists yet.
10. Linux systemd hardening is reviewed statically but has not been exercised on the chosen provider images.

## Residual methodological risks

- Devnet behavior will not establish Mainnet performance or provider intent;
- provider labels, regions, ASNs, and account ownership remain assertions until corroborated;
- a 14-day future sample will remain bounded and cannot establish a universal Solana accessibility index;
- public route naming could create legal and reputational risk, so remediation-oriented disclosure and explicit claim limits remain mandatory.

## Required next evidence

1. deployment and recovery on three real provider hosts;
2. sanitized independence records and public identities;
3. real cross-host healthy, delayed, unavailable, disagreement, and quorum tests;
4. clock, TLS, firewall, disk, restart, and secret-permission evidence;
5. successful `verify-grant-m1-acceptance.mjs` execution against the retained evidence directory.

Milestone 2 MUST NOT start while any blocking item remains.
