import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { SolanaKitObservationReader } from "@sovereignkit/telemetry";

import { executeObservationAssignment } from "./observation-worker.js";
import type { AssignmentAuthorityAllowlistEntry, SignedObservationAssignment } from "./observation-assignment.js";

interface ReaderRegistry {
  readonly schemaVersion: "ObservationReaderRegistry@0.1.0";
  readonly readers: readonly { readonly readerId: string; readonly endpoint: string }[];
}

const [assignmentPathText, authoritiesPathText, readersPathText, unsignedOutputText, rawLogText] = process.argv.slice(2);
if (assignmentPathText === undefined || authoritiesPathText === undefined || readersPathText === undefined || unsignedOutputText === undefined || rawLogText === undefined) {
  throw new Error("usage: sovereignkit-observation-worker <signed-assignment.json> <assignment-authorities.json> <readers.json> <unsigned-output.json> <raw-observations.jsonl>");
}
const assignmentPath = resolve(assignmentPathText);
const authoritiesPath = resolve(authoritiesPathText);
const readersPath = resolve(readersPathText);
const unsignedOutput = resolve(unsignedOutputText);
const rawLogPath = resolve(rawLogText);
const assignment = JSON.parse(await readFile(assignmentPath, "utf8")) as SignedObservationAssignment;
const authorities = JSON.parse(await readFile(authoritiesPath, "utf8")) as AssignmentAuthorityAllowlistEntry[];
if (!Array.isArray(authorities)) throw new Error("invalid assignment authority allowlist");
const authority = authorities.find(entry => entry.issuerId === assignment.issuerId && entry.keyId === assignment.issuerKeyId);
if (authority === undefined) throw new Error("assignment authority is not allowlisted");
const registry = JSON.parse(await readFile(readersPath, "utf8")) as ReaderRegistry;
if (registry.schemaVersion !== "ObservationReaderRegistry@0.1.0" || !Array.isArray(registry.readers)) throw new Error("invalid observation reader registry");
const readers = registry.readers.map(entry => {
  const endpoint = new URL(entry.endpoint);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && (endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost"))) {
    throw new Error(`reader ${entry.readerId} must use HTTPS outside loopback development`);
  }
  return new SolanaKitObservationReader(entry.readerId, endpoint.toString());
});
await mkdir(dirname(unsignedOutput), { recursive: true });
await mkdir(dirname(rawLogPath), { recursive: true });
const unsigned = await executeObservationAssignment({ assignment, authority, readers, rawLogPath });
const output = await open(unsignedOutput, "wx", 0o600);
try {
  await output.writeFile(`${JSON.stringify(unsigned)}\n`, "utf8");
  await output.sync();
} finally {
  await output.close();
}
process.stdout.write(`${JSON.stringify({ event: "OBSERVATION_JOB_COMPLETED", resultId: unsigned.result_id, terminalState: unsigned.terminal_state, unsignedOutput, rawLogPath })}\n`);
