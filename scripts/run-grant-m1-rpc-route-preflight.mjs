import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { runGrantRpcRoutePreflight } from "./lib/grant-m1-rpc-route-preflight.mjs";

const args = parseArgs(process.argv.slice(2));
const endpointFile = resolve(args["endpoint-file"] ?? ".secrets/alchemy-devnet-endpoint.txt");
const secretsRoot = `${resolve(".secrets")}${sep}`;
if (!endpointFile.startsWith(secretsRoot)) {
  throw new Error("endpoint file must be stored below the Git-ignored .secrets directory");
}
try {
  execFileSync("git", ["check-ignore", "--quiet", relative(process.cwd(), endpointFile)], { stdio: "ignore" });
} catch {
  throw new Error("endpoint file is not protected by the repository ignore rules");
}

const endpoint = (await readFile(endpointFile, "utf8")).trim();
const evidence = await runGrantRpcRoutePreflight({
  endpoint,
  routeId: args["route-id"] ?? "alchemy-solana-devnet",
  providerLabel: args["provider-label"] ?? "Alchemy",
});

if (args.output !== undefined) {
  const outputPath = resolve(args.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  gate: "GRANT_M1_SINGLE_RPC_ROUTE_PREFLIGHT",
  routeId: evidence.route_id,
  origin: evidence.logical_endpoint_origin,
  health: evidence.health,
  finalizedSlot: evidence.finalized_slot,
  evidence: args.output === undefined ? null : resolve(args.output),
  operationalIndependenceEstablished: false,
  milestoneAcceptanceEffect: "NONE",
})}\n`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) throw new Error(`unexpected argument at position ${index + 1}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}
