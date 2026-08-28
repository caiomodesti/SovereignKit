# ADR-023 — Zero-cost-first funding policy for the grant pilot

Status: Accepted
Date: 2026-08-26

## Context

The approved grant defines evidence outcomes, not a requirement to purchase
specific vendors. ADR-022 selected a technically conservative paid topology,
but no resource has been provisioned and no billing has been authorized.

Superteam currently advertises several infrastructure benefits. Alchemy and
GetBlock offer time-limited Solana RPC credits; Carbium offers a free period for
its Solana infrastructure services; FluxRPC offers a discount; and OVHcloud
offers an infrastructure discount. RPC access and observer compute are
different resources: an RPC endpoint cannot count as an independent observer
unless our observer runtime actually executes in a separately evidenced
operational environment.

Public cloud free tiers may provide observer compute on distinct providers:
AWS advertises a time-limited Lightsail trial on selected bundles, Google Cloud
offers one `e2-micro` VM in selected US regions, and Oracle Cloud advertises
Always Free compute. These offers have eligibility, capacity, architecture,
egress, expiration, and reclamation risks and therefore are candidates, not
accepted deployments.

## Decision

SovereignKit adopts a zero-cost-first policy for Grant Milestones 1–3:

1. Do not provision the paid ADR-022 topology until current Superteam benefits,
   the incoming RPC partnership, and eligible cloud free tiers are checked.
2. Treat RPC credits only as route-cost relief. They do not satisfy the
   three-provider observer requirement.
3. A zero-cost compute candidate must still pass the exact host preflight,
   signing, restart, durable delivery, failure matrix, and evidence contracts.
4. Require a 24-hour canary soak before admitting any free-tier host into the
   official Milestone 1 topology.
5. Apply the approved milestone text directly: a free-tier VM is acceptable
   only when it is a real deployment on a distinct infrastructure provider and
   retains the same provider, runtime, health, failure, and recovery evidence.
   Price neither proves nor disproves independence.
6. Keep ADR-022 as a paid fallback capped at USD 50/month. Activating it still
   requires explicit operator approval after the zero-cost review is complete.
7. Free credits never justify hidden overages. Provider budget alerts and
   expiration dates must be recorded before a resource starts.

## Candidate zero-cost topology

- Observer A: eligible AWS Lightsail 2 GiB public-IPv4 free-trial bundle;
- Observer B: Google Cloud Free Tier `e2-micro` with 1 GiB memory, 30 GiB
  standard disk, and 1 GiB monthly external egress allowance;
- Observer C: Oracle Cloud Always Free Ampere A1 with 1 OCPU and 6 GiB memory;
- Collector: a second Oracle A1 instance with 1 OCPU and 6 GiB memory.

The machine-readable candidate plan is
`deploy/grant-pilot/zero-cost-candidate-plan.json`. It is not an accepted
topology. Google is exactly at the 1 GiB candidate floor and must prove runtime
stability plus egress sufficiency. Oracle may lack capacity and documents
possible reclamation of idle Always Free compute. Its two proposed instances
together stay within the documented aggregate 2 OCPU, 12 GiB memory, and 200
GiB block-volume allowances. ARM compatibility, disk, egress, clock
synchronization, stable operation, and account eligibility must all be proved.

## Consequences

- The target cash cost is USD 0.
- A prudent reserve remains USD 50/month, or USD 100 if setup and the 14-day
  window cross two billing months.
- Milestone 3 can normally use GitHub Releases and the existing static hosting
  at no incremental cost.
- No milestone claim changes: three real independent observers, 14 real days,
  3,000 qualifying signed observations, and the open evidence release remain
  mandatory.

## Implementation note — 2026-08-28

The first Oracle A1 Collector create attempt failed with an observed capacity
error in São Paulo AD-1. A `VM.Standard.E2.1.Micro` was provisioned as a
temporary Always Free-eligible Collector canary, not as an accepted replacement
for the 6 GiB A1 target. Its 1 GiB memory is below the original target and
therefore adds explicit memory-pressure, restart, recovery, and 24-hour soak
gates. If it fails any gate, the project will migrate the Collector to a
documented external free/discounted candidate or activate the bounded paid
fallback; it will not weaken an acceptance criterion to preserve zero cost.

## References checked on 2026-08-27

- Superteam member perks: https://superteam.fun/member-perks
- Alchemy Solana Fund: https://www.alchemy.com/blog/introducing-alchemy-solana-fund
- AWS Lightsail pricing: https://aws.amazon.com/lightsail/pricing/
- Google Cloud Free Tier: https://docs.cloud.google.com/free/docs/free-cloud-features
- Oracle Cloud Always Free compute: https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Google E2 machine resources: https://docs.cloud.google.com/compute/docs/general-purpose-machines
