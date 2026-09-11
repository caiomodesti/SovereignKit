import { open, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { createGrantM2ReaderRegistry } from "./lib/grant-m2-reader-quota-proposal.mjs";

const args = process.argv.slice(2);
if (args.length !== 4) throw new Error("usage: build-grant-m2-reader-registry <output> <public-a-endpoint-file> <alchemy-endpoint-file> <public-b-endpoint-file>");
const [outputText, ...endpointTexts] = args;
const secretsRoot = `${resolve(".secrets")}${sep}`;
const output = resolve(outputText);
const endpointPaths = endpointTexts.map(value => resolve(value));
if (!output.startsWith(secretsRoot) || endpointPaths.some(path => !path.startsWith(secretsRoot))) {
  throw new Error("M2 reader registry and endpoint inputs must remain below .secrets");
}
const endpoints = await Promise.all(endpointPaths.map(async path => (await readFile(path, "utf8")).trim()));
const registry = createGrantM2ReaderRegistry(endpoints);
const handle = await open(output, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(registry)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
process.stdout.write(`${JSON.stringify({ status: "PASS", readerCount: registry.readers.length, independence: registry.independence, output })}\n`);
