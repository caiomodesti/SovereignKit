import { open, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 4) throw new Error("usage: build-grant-m1-reader-registry <output> <reader-a-endpoint-file> <reader-b-endpoint-file> <reader-c-endpoint-file>");
const [outputText, ...endpointTexts] = args;
const secretsRoot = `${resolve(".secrets")}${sep}`;
const output = resolve(outputText);
const endpointPaths = endpointTexts.map(value => resolve(value));
if (!output.startsWith(secretsRoot) || endpointPaths.some(path => !path.startsWith(secretsRoot))) {
  throw new Error("reader registry and endpoint inputs must remain below .secrets");
}
const endpoints = await Promise.all(endpointPaths.map(async path => (await readFile(path, "utf8")).trim()));
for (const endpoint of endpoints) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("remote reader endpoints must use HTTPS");
}
const registry = {
  schemaVersion: "ObservationReaderRegistry@0.1.0",
  readers: endpoints.map((endpoint, index) => ({ readerId: `grant-m1-reader-${index + 1}`, endpoint })),
};
const handle = await open(output, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(registry)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
process.stdout.write(`${JSON.stringify({ status: "PASS", readerCount: registry.readers.length, output })}\n`);
