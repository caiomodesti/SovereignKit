# ADR-022 — Grant pilot infrastructure topology and budget boundary

Status: Accepted
Date: 2026-08-26

## Context

Milestone 1 requires three operationally independent observers. RPC endpoint
diversity, multiple processes, or multiple instances in one provider account do
not establish that independence. Provisioning also creates recurring costs and
must not begin from an informal or shifting topology.

## Decision

The target canary topology is frozen in
`deploy/grant-pilot/infrastructure-plan.json`:

- Observer A: AWS Lightsail, South America (São Paulo), `sa-east-1`;
- Observer B: DigitalOcean, New York, `nyc3`;
- Observer C: Hetzner Cloud, Nuremberg, `nbg1`;
- Collector: a separate Hetzner Cloud instance in Helsinki, `hel1`.

The three observer provider IDs must remain distinct. The Collector is a
separate host but shares Hetzner's account/control plane with Observer C. This
is an explicit central-collection failure coupling and never counts as a fourth
independent observer.

The planned minimum host size is 2 GiB RAM for AWS and DigitalOcean and 4 GiB
RAM for the lower-cost Hetzner instances. The base estimate is USD 36.98/month,
before taxes, Hetzner IPv4 charges, backups, domain registration, or excess
traffic. The proposed pilot ceiling is USD 50/month. This ceiling is a planning
guard, not authorization to incur charges.

Provisioning order is Collector, Observer A canary, hostile/recovery audit, then
Observers B and C. No second observer is provisioned while the canary has an
unexplained critical failure.

Pricing and location references checked on 2026-08-26:

- AWS Lightsail bundles: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html
- AWS Lightsail regions: https://aws.amazon.com/about-aws/whats-new/2026/06/amazon-lightsail-aws-regions/
- DigitalOcean Droplet pricing: https://www.digitalocean.com/pricing/droplets
- Hetzner 2026 cloud price adjustment: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Hetzner locations: https://docs.hetzner.com/cloud/general/locations/

## Consequences

- Provider and region choices are reviewable before money is spent.
- Substitution requires an ADR amendment and must preserve three distinct
  observer providers, the evidence contract, and the budget guard.
- Provider signup, billing, KYC, OTP, domain purchase, and credential entry
  remain operator actions and cannot be automated from repository authority.
- A valid plan proves no infrastructure exists. Milestone status remains
  `IMPLEMENTED_NOT_VALIDATED` until real host evidence passes acceptance.
