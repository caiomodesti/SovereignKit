import { readFile } from "node:fs/promises";

const fixtureRoot = new URL(
  "../fixtures/sprint-10/devnet-blocked-run-20260814T040134Z/",
  import.meta.url,
);
const [cluster, failure] = await Promise.all([
  readJson(new URL("cluster-metadata.json", fixtureRoot)),
  readJson(new URL("setup-failure.json", fixtureRoot)),
]);

assert(cluster.health === "ok", "cluster health must be retained as ok");
assert(typeof cluster.genesisHash === "string" && cluster.genesisHash.length > 0, "genesis hash is required");
assert(typeof cluster.version?.["solana-core"] === "string", "RPC core version is required");
assert(failure.stage === "DEVNET_FAUCET", "failure stage must remain explicit");
assert(failure.classification === "EXTERNAL_SETUP_FAILURE", "setup failure must not become a transaction outcome");
assert(failure.transactionCreated === false, "blocked run must not claim a transaction");
assert(failure.methodologicalFinding === null, "blocked run must not claim a methodological finding");
assert(failure.transactionSignature === undefined, "blocked run must not contain a transaction signature");

process.stdout.write(`${JSON.stringify({
  verified: true,
  fixture: "devnet-blocked-run-20260814T040134Z",
  transactionCreated: false,
  methodologicalFinding: null,
})}\n`);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
