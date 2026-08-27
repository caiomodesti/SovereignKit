# Grant Milestone 1 provider onboarding gate

Status: `ACTION_REQUIRED` — no cloud resource has been provisioned.

ADR-023 adds a prior zero-cost review. Do not complete the paid-provider gate
or create an ADR-022 resource until current Superteam partner outcomes and
free-tier eligibility are recorded.

This runbook converts the operator-controlled prerequisites for Milestone 1
into an explicit gate. It does not authorize billing, create accounts, buy a
domain, deploy a host, or establish observer independence.

## Before any server exists

1. Create or verify accounts owned by the project operator at AWS,
   DigitalOcean, and Hetzner. Enable MFA on every account.
2. Add a billing method directly in each provider console. Never put payment
   details, passwords, recovery codes, API tokens, or full invoices in the
   repository, chat, screenshots, or evidence bundle.
3. Configure provider-side budget/usage alerts. The frozen plan estimates USD
   36.98/month before excluded costs and uses USD 50/month as the pilot ceiling.
4. Choose a hostname controlled by the operator for the Collector TLS edge.
   Do not publish an IP address or create DNS until the Collector address is
   known.
5. Confirm that observer private keys will be created on their own hosts, owned
   by the service account, mode `0600`, never copied to the Collector, CI, chat,
   or Git.
6. Record explicit provisioning approval only after the account, budget, DNS,
   and secret-custody checks are complete.

## Local gate file

Copy the public example into the ignored `.secrets` directory:

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

## Provisioning sequence after the gate

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

The Collector and Observer C share a Hetzner control plane. This coupling must
remain explicit and the Collector must never be counted as an independent
observer.

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
