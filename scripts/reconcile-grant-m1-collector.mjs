import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const evidenceRoot = resolve(argument("--evidence"));
const outputPath = resolve(argument("--output"));
const collectorOrigin = "https://collector.sovereignkit.org";
const index = JSON.parse(await readFile(resolve(evidenceRoot, "evidence-index.json"), "utf8"));
const reconciled = [];

for (const observer of index.observers ?? []) {
  for (const reference of observer.signed_results ?? []) {
    const result = JSON.parse((await readFile(resolve(evidenceRoot, reference.path), "utf8")).trim());
    const response = await fetch(`${collectorOrigin}/v0/probe-results`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(result),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json();
    if (response.status !== 200 || body?.status !== "DUPLICATE" || !Number.isSafeInteger(body.storedCount) || body.storedCount < 3) {
      throw new Error(`${observer.observer_id} Collector reconciliation failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
    }
    reconciled.push({
      observer_id: observer.observer_id,
      result_id: result.result_id,
      http_status: response.status,
      collector_status: body.status,
      stored_count_at_reconciliation: body.storedCount,
    });
  }
}
if (reconciled.length !== 3) throw new Error(`expected three reconciled results, got ${reconciled.length}`);
const evidence = {
  schema_version: "GrantM1CollectorReconciliation@0.1.0",
  captured_at: new Date().toISOString(),
  collector_origin: collectorOrigin,
  expected_response: "DUPLICATE",
  reconciled,
  all_previously_durable_at_current_endpoint: true,
  public_health_endpoint_used: false,
  scope: "Replays the three exact signed M1 results over public TLS and requires idempotent DUPLICATE responses. It does not expose the private Collector health route or raw network addresses.",
};
await mkdir(dirname(outputPath), { recursive: true });
const handle = await open(outputPath, "wx", 0o600);
try { await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_COLLECTOR_RECONCILIATION", results: reconciled.length, output: outputPath })}\n`);

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}
