import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { analyzeWindow, renderSummary } from "../packages/analysis/dist/index.js";
import { verifyProbeResult } from "../packages/probes/dist/index.js";

const root = resolve("fixtures/integration/agave-4.0.0/controlled-experiment");
const manifest = JSON.parse(await readFile(resolve(root, "experiment-manifest.json"), "utf8"));
const publicEntry = manifest.observerAllowlist[0];
const allowlistEntry = {
  observerId: publicEntry.observerId,
  keyId: publicEntry.keyId,
  publicKeySpkiBase64: publicEntry.publicKeySpkiBase64,
  validFrom: "2026-01-01T00:00:00.000Z",
};
const phases = ["healthy", "degraded", "asymmetric", "insufficient_data"];
let verifiedSignatures = 0;

for (const phase of phases) {
  const directory = resolve(root, phase);
  const definition = JSON.parse(await readFile(resolve(directory, "experiment-definition.json"), "utf8"));
  const measurements = JSON.parse(await readFile(resolve(directory, "derived/measurements.json"), "utf8"));
  const results = (await readFile(resolve(directory, "raw/probe-results.jsonl"), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  for (const result of results) {
    if (!verifyProbeResult(result, allowlistEntry)) throw new Error(`invalid observer signature: ${result.result_id}`);
    verifiedSignatures += 1;
  }

  const rendered = renderSummary(analyzeWindow(definition, measurements));
  await assertExact(resolve(directory, "summary/experiment-summary.md"), rendered.markdown);
  await assertExact(resolve(directory, "summary/experiment-summary.json"), rendered.json);
  await assertExact(resolve(directory, "summary/experiment-summary.csv"), rendered.csv);
  const expected = manifest.scenarios[phase].expected;
  const actual = JSON.parse(rendered.json).classifications.map(value => value.classification);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${phase} classifications changed: ${actual.join(",")}`);
  }
  console.log(`${phase}: ${actual.join(",")} — summaries byte-identical`);
}

console.log(`verified observer signatures: ${verifiedSignatures}`);

async function assertExact(path, actual) {
  const expected = await readFile(path, "utf8");
  if (expected !== actual) throw new Error(`summary is not byte-reproducible: ${path}`);
}

