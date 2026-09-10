import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { deriveGrantM1TerminalFromClaims } from "./lib/grant-m1-acceptance.mjs";

const args = process.argv.slice(2);
const valueFor = name => {
  const index = args.indexOf(name);
  if (index < 0 || index === args.length - 1) throw new Error(`${name} is required`);
  return args[index + 1];
};
const runtimeCommit = valueFor("--runtime-commit");
const output = resolve(valueFor("--output"));
if (!/^[a-f0-9]{40}$/u.test(runtimeCommit)) throw new Error("--runtime-commit must be a full lowercase Git commit");

const claim = (id, overrides = {}) => ({
  claim_id: `claim-${id}`,
  reader_id: `reader-${id}`,
  observed_at: "2026-09-09T00:00:00.000Z",
  signature_status: "finalized",
  transaction_slot: 900,
  observed_block_height: 1_000,
  ...overrides,
});
const terminal = (claims, lastValidBlockHeight = 1_500) => deriveGrantM1TerminalFromClaims(claims, lastValidBlockHeight)?.terminal;
const checks = {
  HEALTHY: terminal([claim("a"), claim("b"), claim("c")]) === "FINALIZED",
  DELAYED: terminal([
    claim("a", { signature_status: null, transaction_slot: undefined }),
    claim("b", { signature_status: null, transaction_slot: undefined }),
    claim("c", { signature_status: null, transaction_slot: undefined }),
  ]) === undefined && terminal([claim("a"), claim("b"), claim("c")]) === "FINALIZED",
  ONE_READER_UNAVAILABLE: terminal([
    claim("a"), claim("b"), claim("c", { signature_status: null, transaction_slot: undefined, reader_error: "RPC_UNAVAILABLE" }),
  ]) === "FINALIZED",
  TWO_READERS_UNAVAILABLE: terminal([
    claim("a"),
    claim("b", { signature_status: null, transaction_slot: undefined, reader_error: "RPC_UNAVAILABLE" }),
    claim("c", { signature_status: null, transaction_slot: undefined, reader_error: "RPC_UNAVAILABLE" }),
  ]) === undefined,
  DISAGREEMENT: terminal([
    claim("a", { signature_status: "confirmed" }),
    claim("b", { execution_error: { custom: 1 } }),
    claim("c", { signature_status: null, transaction_slot: undefined, reader_error: "RPC_UNAVAILABLE" }),
  ]) === undefined,
  EXPIRED_CLEAN_NEGATIVE: terminal([
    claim("a", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000 }),
    claim("b", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000 }),
    claim("c", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000 }),
  ]) === "EXPIRED",
  EXPIRY_WITH_READER_ERROR_INCONCLUSIVE: terminal([
    claim("a", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000, reader_error: "RPC_UNAVAILABLE" }),
    claim("b", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000, reader_error: "RPC_UNAVAILABLE" }),
    claim("c", { signature_status: null, transaction_slot: undefined, observed_block_height: 2_000 }),
  ]) === undefined,
  QUORUM_UNAVAILABLE_INCONCLUSIVE: terminal([
    claim("a", { signature_status: null, transaction_slot: undefined, observed_block_height: 1_000 }),
    claim("b", { signature_status: null, transaction_slot: undefined, observed_block_height: 1_000 }),
    claim("c", { signature_status: null, transaction_slot: undefined, reader_error: "RPC_UNAVAILABLE" }),
  ]) === undefined,
};
if (Object.values(checks).some(value => value !== true)) throw new Error(`semantic failure matrix failed: ${JSON.stringify(checks)}`);
const derivationModuleUrl = new URL("./lib/grant-m1-acceptance.mjs", import.meta.url);

const record = {
  schema_version: "GrantM1SemanticFailureMatrix@0.1.0",
  evidence_protocol_version: "GrantM1EvidenceProtocol@0.1.0",
  generated_at: new Date().toISOString(),
  runtime_commit_under_test: runtimeCommit,
  derivation_module: "scripts/lib/grant-m1-acceptance.mjs",
  derivation_module_sha256: createHash("sha256").update(await readFile(derivationModuleUrl)).digest("hex"),
  cases: Object.fromEntries(Object.keys(checks).map(name => [name, "PASS"])),
  scope: "Deterministic semantic recomputation of terminal quorum and fail-closed inconclusive cases; not a live network observation.",
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: "PASS", output, cases: Object.keys(checks).length })}\n`);
