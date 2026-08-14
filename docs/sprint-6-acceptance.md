# Sprint 6 acceptance audit

| # | Criterion | Result | Evidence |
|---:|---|---|---|
| 1 | Observer and Collector run as separate processes | PASS | child-process integration uses distinct PIDs and HTTP |
| 2 | Each observer uses its own Ed25519 key identity | PASS | versioned private-key document and public allowlist entry |
| 3 | Private key is not persisted in evidence or Git | PASS | ephemeral temp file, `.secrets/` ignored, cleanup after run; Windows ACL remains operational work |
| 4 | Collector is centrally allowlisted | PASS | observer/key lookup and validity interval checked before acceptance |
| 5 | Complete versioned schema is enforced | PASS | Ajv Draft 2020-12 validates unknown input; additional properties fail |
| 6 | Semantic invariants remain enforced | PASS | derived unit/idempotency, distinct readers, claim references and terminal decision checks |
| 7 | Signature and payload hash are verified | PASS | Ed25519 verification; 600/600 retained signatures pass |
| 8 | Accepted raw evidence is append-only | PASS | one JSONL envelope per first acceptance; exact replay adds no line |
| 9 | Persistence precedes in-memory acceptance | PASS | append + `fsync` occurs before replay indexes commit |
| 10 | Restart reconstructs replay protection | PASS | one-process fixture and 600-result verifier rebuild indexes from JSONL |
| 11 | Exact replay is idempotent | PASS | `DUPLICATE`, stored count unchanged before and after restart |
| 12 | Conflicting identifiers fail closed | PASS | result, idempotency and definition-scoped observer sequence conflicts rejected |
| 13 | Partial/corrupt log fails closed | PASS | partial trailing record test; no automatic evidence repair |
| 14 | Network boundary is controlled | PASS | explicit loopback bind/client check, JSON content type, 256 KiB cap |
| 15 | Historical signed evidence remains valid | PASS | all 600 Sprint 5 results schema-valid, signature-valid, accepted and restored |
| 16 | Toolchain checks pass | PASS | strict typecheck, build, 54 unit tests and one process integration test |
| 17 | Coverage remains measured | PASS | 89.63% statements, 80.65% branches, 92.50% functions, 94.78% lines |
| 18 | No Sprint 7/dashboard/public infrastructure began | PASS | no snapshot feed, dashboard, remote listener, PostgreSQL or hosted service |

Sprint 6 is accepted for the narrow local hardening claim. It does not establish geographic/infrastructure independence or production Collector readiness.
