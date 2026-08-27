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
> Próximo passo: concluir a revisão zero-cost de benefícios e free tiers,
> validar um host canário e só então provisionar a topologia externa. A
> alternativa paga permanece bloqueada e sem cobrança autorizada.
>
> Atualização de rota: a primeira dependência RPC externa, Alchemy Solana
> Devnet, passou por um preflight secret-safe de saúde, identidade da rede,
> versão e slot finalizado. Isso valida uma rota lógica; não conta como observer
> independente nem altera o status do milestone.
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

Suggested clarification message:

> Kuka, revisei os três milestones aprovados do SovereignKit e quero evitar
> gastar o grant desnecessariamente sem enfraquecer a prova. Precisamos de duas
> coisas diferentes: (1) três rotas RPC Solana e (2) três ambientes Linux
> realmente separados, em provedores distintos, executando nossos observers e
> guardando suas próprias chaves. Os benefícios de Alchemy, GetBlock e Carbium
> cobrem RPC, mas aparentemente não fornecem uma VM Linux.
>
> Você consegue confirmar quatro pontos? (a) a nova parceria desta semana é só
> RPC/créditos ou inclui compute/VPS; (b) VMs em free tier de AWS, Google Cloud
> e Oracle contam como três provedores independentes se preservarmos toda a
> evidência; (c) o piloto oficial de 14 dias e 3.000 observações pode ser em
> Devnet ou precisa incluir Mainnet; e (d) existe algum benefício de hostname
> DNS convencional para HTTPS, além do domínio Web3 `.superteam`?
>
> Nosso fallback pago está limitado a USD 50/mês, mas não vou ativá-lo antes de
> esgotar essas opções gratuitas.
