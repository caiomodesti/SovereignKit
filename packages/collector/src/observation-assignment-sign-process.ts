import { randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  importAssignmentAuthorityPrivateKey,
  signObservationAssignment,
  type AssignmentAuthorityPrivateKeyDocument,
} from "./observation-assignment.js";
import type { ObservationJob } from "./observation-worker.js";

const [privatePathText, jobPathText, outputPathText, issuedAt, expiresAt] = process.argv.slice(2);
if ([privatePathText, jobPathText, outputPathText, issuedAt, expiresAt].some(value => value === undefined)) {
  throw new Error("usage: sovereignkit-assignment-sign <authority-private.json> <job.json> <signed-output.json> <issued-at> <expires-at>");
}
const privateDocument = JSON.parse(await readFile(resolve(privatePathText!), "utf8")) as AssignmentAuthorityPrivateKeyDocument;
const job = JSON.parse(await readFile(resolve(jobPathText!), "utf8")) as ObservationJob;
const keyPair = importAssignmentAuthorityPrivateKey(privateDocument);
const assignment = signObservationAssignment({
  schemaVersion: "ObservationAssignment@0.1.0",
  assignmentId: randomUUID(),
  issuerId: keyPair.issuerId,
  issuerKeyId: keyPair.keyId,
  issuedAt: issuedAt!,
  expiresAt: expiresAt!,
  job,
}, keyPair);
const output = await open(resolve(outputPathText!), "wx", 0o600);
try {
  await output.writeFile(`${JSON.stringify(assignment)}\n`, "utf8");
  await output.sync();
} finally { await output.close(); }
process.stdout.write(`${JSON.stringify({ event: "OBSERVATION_ASSIGNMENT_SIGNED", assignmentId: assignment.assignmentId, payloadHash: assignment.payloadHash, output: resolve(outputPathText!) })}\n`);
