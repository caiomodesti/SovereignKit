import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { exportObserverPrivateKey, generateObserverKeyPair, type ObserverAllowlistEntry } from "@sovereignkit/probes";

const [observerId, keyId, privatePathText, publicPathText, validFrom, validUntil] = process.argv.slice(2);
if (observerId === undefined || keyId === undefined || privatePathText === undefined || publicPathText === undefined || validFrom === undefined) {
  throw new Error("usage: sovereignkit-observer-keygen <observer-id> <key-id> <private-key.json> <allowlist-entry.json> <valid-from> [valid-until]");
}
if (!Number.isFinite(Date.parse(validFrom)) || (validUntil !== undefined && (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) < Date.parse(validFrom)))) {
  throw new Error("observer key validity interval is invalid");
}
const privatePath = resolve(privatePathText);
const publicPath = resolve(publicPathText);
if (privatePath === publicPath) throw new Error("private and public identity paths must differ");
await mkdir(dirname(privatePath), { recursive: true });
await mkdir(dirname(publicPath), { recursive: true });
const keyPair = generateObserverKeyPair(observerId, keyId);
const entry: ObserverAllowlistEntry = {
  observerId,
  keyId,
  publicKeySpkiBase64: keyPair.publicKeySpkiBase64,
  validFrom,
  ...(validUntil === undefined ? {} : { validUntil }),
};
const privateHandle = await open(privatePath, "wx", 0o600);
try {
  await privateHandle.writeFile(`${JSON.stringify(exportObserverPrivateKey(keyPair))}\n`, "utf8");
  await privateHandle.sync();
} finally {
  await privateHandle.close();
}
const publicHandle = await open(publicPath, "wx", 0o644);
try {
  await publicHandle.writeFile(`${JSON.stringify(entry)}\n`, "utf8");
  await publicHandle.sync();
} finally {
  await publicHandle.close();
}
process.stdout.write(`${JSON.stringify({ event: "OBSERVER_IDENTITY_CREATED", observerId, keyId, privatePath, publicPath })}\n`);
