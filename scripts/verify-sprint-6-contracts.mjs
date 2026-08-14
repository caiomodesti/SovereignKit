import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { DurableProbeResultCollector, ProbeResultSchemaValidator } from "../packages/collector/dist/index.js";
import { verifyProbeResult } from "../packages/probes/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = join(root, "fixtures", "integration", "agave-4.0.0", "controlled-experiment");
const schema = JSON.parse(await readFile(join(root, "spec", "probe-result.schema.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(fixtureRoot, "experiment-manifest.json"), "utf8"));
const manifestKey = manifest.observerAllowlist[0];
if (manifestKey === undefined) throw new Error("Sprint 5 fixture has no observer allowlist entry");
const allowlist = [{
  ...manifestKey,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
}];
const validator = new ProbeResultSchemaValidator(schema);
const results = [];
for (const scenario of ["healthy", "degraded", "asymmetric", "insufficient_data"]) {
  const text = await readFile(join(fixtureRoot, scenario, "raw", "probe-results.jsonl"), "utf8");
  for (const [index, line] of text.trimEnd().split("\n").entries()) {
    const value = JSON.parse(line);
    const validation = validator.validate(value);
    if (!validation.valid) throw new Error(`${scenario} result ${index} fails schema: ${validation.errors.join("; ")}`);
    if (!verifyProbeResult(validation.value, allowlist[0])) throw new Error(`${scenario} result ${index} has an invalid signature`);
    results.push(validation.value);
  }
}
if (results.length !== 600) throw new Error(`expected 600 retained ProbeResults, found ${results.length}`);

const temporaryDirectory = await mkdtemp(join(tmpdir(), "sovereignkit-sprint-6-verifier-"));
try {
  const acceptedLogPath = join(temporaryDirectory, "accepted.jsonl");
  const collectorTime = new Date(manifest.generatedAt);
  const collector = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
  for (const result of results) {
    const outcome = await collector.ingest(result, collectorTime);
    if (outcome.status !== "ACCEPTED") throw new Error(`fresh retained result was not accepted: ${JSON.stringify(outcome)}`);
  }
  await collector.close();

  const restarted = await DurableProbeResultCollector.open({ schema, allowlist, acceptedLogPath });
  for (const result of results) {
    const outcome = await restarted.ingest(result, collectorTime);
    if (outcome.status !== "DUPLICATE") throw new Error(`replayed retained result was not a duplicate: ${JSON.stringify(outcome)}`);
  }
  const storedCount = restarted.storedCount();
  await restarted.close();
  if (storedCount !== results.length) throw new Error(`restart restored ${storedCount} results instead of ${results.length}`);
  process.stdout.write(`${JSON.stringify({ schemaValidated: results.length, signaturesVerified: results.length, initiallyAccepted: results.length, replayedAsDuplicate: results.length, restoredAfterRestart: storedCount })}\n`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
