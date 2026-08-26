# Grant progress communications

This document defines how SovereignKit reports grant progress without
overstating operational evidence.

## Cadence

- Publish one concise progress update every seven days while grant work is
  active. Friday is the preferred publishing day unless Superteam requests a
  different cadence.
- Publish an additional update when a milestone becomes `ACCEPTED`, a material
  blocker changes, or an externally verifiable artifact is released.
- Do not publish daily status posts. Commits, pull requests, CI, and the
  append-only [weekly status](grant-weekly-status.md) retain engineering detail.
- Use the grant listing's tranche/update flow only after the operator's stated
  threshold for significant progress is met. A social post is not a tranche
  claim.

## Channels

| Channel | Purpose | Content |
|---|---|---|
| GitHub | Primary technical record | commits, tests, evidence anchors, reproduction commands, limitations |
| Superteam `proof-of-work` | Short community update | result, honest status, link, next action |
| Grant listing/update page | Formal funding progress | accepted evidence mapped to the approved milestone |
| Direct message to grant operator | Clarification only | blockers involving benefits, payment, eligibility, or reporting procedure |

## Required fields

Every public update must state:

1. active milestone;
2. concrete result since the previous update;
3. validation or retained evidence;
4. current status using the official status vocabulary;
5. blockers and claim limits;
6. next action;
7. public link.

Costs may be included when external infrastructure starts. Secrets, private
keys, wallet material, provider credentials, billing identifiers, private IPs,
and unsanitized instance records must never appear.

## Claim rules

- `IMPLEMENTED_NOT_VALIDATED` means the software exists but required external
  operational evidence does not.
- `ACCEPTED` may be used only after the milestone acceptance verifier and the
  hostile audit pass against retained evidence.
- Three logical readers or processes on one host are not three operationally
  independent observers.
- `RPC_ACKNOWLEDGED` is not ledger observation, confirmation, or finalization.
- A local validator run is deployment-readiness evidence, not a public-network
  or infrastructure-independence result.
- Missing and failed runs remain visible. Do not cherry-pick only successful
  evidence.

## Current ready-to-publish update

> 🔭 **SovereignKit — Grant Milestone 1 progress**
>
> Estamos construindo a camada de observação independente de acessibilidade de
> transações na Solana. Nesta etapa concluímos o runtime de observer com
> identidade Ed25519 própria, resultados assinados, quorum lógico 2/3, entrega
> durável ao Collector, health/readiness, heartbeats e templates de deployment.
>
> ✅ 93/93 testes determinísticos
> ✅ 7/7 testes hostis do contrato de evidência
> ✅ transação real em Agave local chegou a `FINALIZED`
> ✅ 280 polls brutos preservados
> ✅ ProbeResult assinado, aceito e recuperado pelo Collector
> ✅ evidência pública sem chave privada
>
> Status honesto: `IMPLEMENTED_NOT_VALIDATED`. Esse run prova prontidão local do
> software, mas ainda não prova independência de infraestrutura. O Milestone 1
> só será aceito depois de três observers reais em provedores distintos, com
> evidência de operação, falhas e recuperação.
>
> Próximo passo: provisionar os três ambientes externos e o Collector HTTPS
> assim que o acesso aos provedores estiver definido.
>
> Código e metodologia: https://github.com/caiomodesti/SovereignKit

## Milestone acceptance template

> 🔭 **SovereignKit — Milestone [N] [status]**
>
> **Objetivo:** [approved milestone objective]
>
> **Entregue:** [concrete outcome]
>
> **Verificação:** [tests, evidence index, hashes, reproduction command]
>
> **Limitações:** [what this evidence does not prove]
>
> **Status:** `[official status]`
>
> **Próximo passo:** [next gated action]
>
> **Evidência:** [public URL]

## Operator questions still open

The project can continue locally while these questions await Superteam's
answer:

- whether member infrastructure benefits require a referral, promotional code,
  or membership NFT;
- how the membership NFT is issued and which official wallet flow is used;
- whether RPC credits may support an open-source multi-route observability
  pilot;
- whether Superteam prefers a different reporting cadence or channel.

None of these unanswered questions changes the milestone acceptance criteria.
