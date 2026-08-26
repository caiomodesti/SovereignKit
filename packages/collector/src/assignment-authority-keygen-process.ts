import { open } from "node:fs/promises";
import { resolve } from "node:path";

import { exportAssignmentAuthorityPrivateKey, generateAssignmentAuthorityKeyPair } from "./observation-assignment.js";

const [issuerId, keyId, privatePathText, publicPathText, validFrom, validUntil] = process.argv.slice(2);
if ([issuerId, keyId, privatePathText, publicPathText, validFrom, validUntil].some(value => value === undefined)) {
  throw new Error("usage: sovereignkit-assignment-keygen <issuer-id> <key-id> <private-output.json> <public-output.json> <valid-from> <valid-until>");
}
const fromMs = Date.parse(validFrom!);
const untilMs = Date.parse(validUntil!);
if (!Number.isFinite(fromMs) || !Number.isFinite(untilMs) || untilMs <= fromMs) throw new Error("assignment authority validity interval is invalid");
const keyPair = generateAssignmentAuthorityKeyPair(issuerId!, keyId!);
const privateHandle = await open(resolve(privatePathText!), "wx", 0o600);
try {
  await privateHandle.writeFile(`${JSON.stringify(exportAssignmentAuthorityPrivateKey(keyPair))}\n`, "utf8");
  await privateHandle.sync();
} finally { await privateHandle.close(); }
const publicHandle = await open(resolve(publicPathText!), "wx", 0o644);
try {
  await publicHandle.writeFile(`${JSON.stringify({ issuerId: keyPair.issuerId, keyId: keyPair.keyId, publicKeySpkiBase64: keyPair.publicKeySpkiBase64, validFrom, validUntil })}\n`, "utf8");
  await publicHandle.sync();
} finally { await publicHandle.close(); }
process.stdout.write(`${JSON.stringify({ event: "ASSIGNMENT_AUTHORITY_CREATED", issuerId: keyPair.issuerId, keyId: keyPair.keyId, publicOutput: resolve(publicPathText!) })}\n`);
