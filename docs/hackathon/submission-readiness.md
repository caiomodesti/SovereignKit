# QuantumHacks submission readiness

Updated: 2026-08-15

| Deliverable | Status | Evidence / next action |
|---|---|---|
| Security, secrets, dependencies, privacy | PASS | `docs/sprint-12-security-audit.md`; 0 npm and 0 crates.io OSV findings |
| Public read-only fixture demo | PASS | `https://sovereignkit-observatory.samuel-rramos.chatgpt.site` |
| Guided HEALTHY → DEGRADED → ASYMMETRIC replay | PASS | dashboard derives all rates/classifications from accepted fixtures |
| Real Devnet Explorer proof | PASS | public link is derived from the accepted Sprint 10 fixture |
| Dashboard/architecture/lifecycle/results screenshots | PASS | committed under `docs/hackathon/screenshots/` |
| English Devpost description | DRAFTED | `docs/hackathon/devpost-submission-draft.md` |
| Professional/non-student eligibility | PENDING ORGANIZER | message prepared; requires sending and written response |
| Public GitHub repository | READY, AUTH BLOCKED | security gate passed; expired GitHub CLI session must be renewed before visibility change |
| 2:30–3:00 English video | PENDING CREATIVE APPROVAL | mandatory creative interview and storyboard approval remain |
| External human comprehension test under five minutes | PENDING HUMAN | use the protocol below with someone who has not followed development |

## Five-minute external test protocol

Give the tester only the public demo URL. Do not explain the product first.

At minute five, ask them to answer without prompts:

1. What is the problem SovereignKit solves?
2. Why is `RPC_ACKNOWLEDGED` not the same as landing?
3. What changed between DEGRADED and ASYMMETRIC?
4. Which part is controlled local evidence and which part is Devnet proof?
5. What would a wallet or protocol do with the failover evidence?

Pass threshold: at least four correct answers, including questions 2 and 3;
the tester can reach the asymmetric replay and Devnet Explorer without help;
and no unsupported censorship/provider-ranking interpretation survives one
clarifying question. Record role, start/end time, answers, confusion points,
and whether the tester would know what to click next. Do not collect a name,
email, recording, or other personal data unless the tester explicitly agrees.

