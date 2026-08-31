# Grant Milestone 1 provider onboarding gate

Status: `IN_PROGRESS` — the Oracle E4 Collector is admitted behind the controlled
public TLS hostname; no observer host has been provisioned.

ADR-023 added a prior zero-cost review. Oracle A1 capacity and E2 host fitness
failed concretely, so the operator approved a bounded Pay As You Go E4 Collector
canary. That canary passed frozen-runtime preflight, durable replay, a real
24-hour soak, reboot recovery, and the public TLS gate. Observer A is now the
only component eligible for the next provisioning attempt. Do not provision
Observers B or C until Observer A passes its own host and observation gates.

This runbook converts the operator-controlled prerequisites for Milestone 1
into an explicit gate. It does not authorize billing, create accounts, buy a
domain, deploy a host, or establish observer independence.

## Before any server exists

1. First create or verify project-operator accounts for the zero-cost candidates
   at AWS, Google Cloud, and Oracle Cloud. Enable MFA on every account. If the
   zero-cost path fails its recorded gates and paid fallback is explicitly
   approved, then create or verify the ADR-022 DigitalOcean and Hetzner accounts.
2. Add a billing method directly in each provider console. Never put payment
   details, passwords, recovery codes, API tokens, or full invoices in the
   repository, chat, screenshots, or evidence bundle.
3. Configure provider-side budget/usage guards even for free offers. A limit or
   alert is evidence of control, not a guarantee against charges. The paid
   fallback estimates USD 36.98/month before excluded costs and uses USD
   50/month as the pilot ceiling.
4. Choose a hostname controlled by the operator for the Collector TLS edge.
   Do not publish an IP address or create DNS until the Collector address is
   known.
5. Confirm that observer private keys will be created on their own hosts, owned
   by the service account, mode `0600`, never copied to the Collector, CI, chat,
   or Git.
6. Record explicit provisioning approval only after the account, budget, DNS,
   and secret-custody checks are complete.

## Local gate file

For the active zero-cost path, copy its public example into the ignored
`.secrets` directory:

```powershell
New-Item -ItemType Directory -Force .secrets | Out-Null
Copy-Item deploy/grant-pilot/zero-cost-account-readiness.example.json `
  .secrets/grant-m1-zero-cost-account-readiness.json
```

Edit only booleans, the approval timestamp, and the planned Collector hostname.
Do not add account IDs, payment data, credentials, recovery codes, tokens, or
screenshots. Validate it with:

```powershell
node scripts/verify-grant-m1-zero-cost-account-readiness.mjs `
  .secrets/grant-m1-zero-cost-account-readiness.json --require-ready
```

This gate can authorize only the zero-cost provisioning attempt; it cannot
activate the paid fallback.

If zero-cost qualification fails and paid fallback is separately approved,
copy the paid public example:

```powershell
New-Item -ItemType Directory -Force .secrets | Out-Null
Copy-Item deploy/grant-pilot/operator-readiness.example.json `
  .secrets/grant-m1-operator-readiness.json
```

Edit only booleans, timestamps, and the Collector hostname. Do not add account
IDs or credentials. Validate it with:

```powershell
node scripts/verify-grant-m1-operator-readiness.mjs `
  .secrets/grant-m1-operator-readiness.json --require-ready
```

`READY_TO_PROVISION` opens only the manual provisioning step. It is not
Milestone 1 acceptance and it does not permit the software to create or charge
resources automatically.

## Zero-cost provisioning sequence

1. Validate AWS, Google Cloud, and Oracle account eligibility without creating
   resources or activating paid continuation.
2. Create the Oracle home-region Collector candidate only if the console marks
   the selected A1 shape and boot volume as Always Free eligible.
3. Harden it, configure the loopback Collector plus TLS edge, and retain a
   sanitized deployment record.
4. Create the AWS Lightsail Observer A canary only if the console confirms that
   the account has current AWS Free Tier credits sufficient for the selected
   USD 12/month 2 GiB bundle and shows their expiration. The obsolete short-term
   Lightsail trial must not be assumed.
5. Require host preflight, signed observation, restart recovery, delivery
   recovery, 24-hour canary, and sanitized provider evidence.
6. Stop on any unexplained critical failure. Do not create Observers B or C.
7. Only after Observer A passes, create Google `e2-micro` Observer B and Oracle
   A1 Observer C, one at a time, preserving the same gates.
8. Execute the complete three-host failure matrix and acceptance bundle.

## Paid fallback sequence

This sequence remains blocked until the zero-cost attempt fails materially and
the operator explicitly authorizes spend:

1. Create the Hetzner Helsinki Collector only.
2. Harden it, configure the loopback Collector plus TLS edge, and retain a
   sanitized deployment record.
3. Create the AWS São Paulo Observer A canary only.
4. Require host preflight, a signed observation, restart recovery, delivery
   recovery, and sanitized provider evidence from the canary.
5. Stop on any unexplained critical failure. Do not create Observers B or C.
6. Only after the canary passes, create DigitalOcean NYC3 Observer B and
   Hetzner Nuremberg Observer C, one at a time.
7. Execute the complete three-host failure matrix and acceptance bundle.

In the zero-cost plan, the Collector and Observer C share the Oracle control
plane. In the paid fallback, they share Hetzner. Either coupling must remain
explicit, and the Collector must never be counted as an independent observer.

## Evidence that may be retained

- provider name, region, non-secret account fingerprint, sanitized instance
  identifier, ASN, provision timestamp, and frozen runtime commit;
- MFA/budget-control attestation without recovery codes or billing details;
- public observer identity and validity interval;
- sanitized console or invoice proof with personal and payment data removed;
- host preflight, health history, restart evidence, failure matrix, signed
  results, raw reader observations, and Collector receipts.

Until all three real observers pass the external acceptance verifier, the only
valid status is `IMPLEMENTED_NOT_VALIDATED` and Milestone 2 remains blocked.
