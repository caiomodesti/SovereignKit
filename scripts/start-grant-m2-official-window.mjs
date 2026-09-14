import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { appendGrantM2OfficialEvent, initializeGrantM2OfficialJournal } from "./lib/grant-m2-official-journal.mjs";

const args = parseArgs(process.argv.slice(2));
const run = JSON.parse(await readFile(resolve(required("run")), "utf8"));
const quota = JSON.parse(await readFile(resolve(required("quota")), "utf8"));
const directory = resolve(required("journal-directory"));
const recordedAt = required("recorded-at");
await initializeGrantM2OfficialJournal({ directory, run, quota });
const state = await appendGrantM2OfficialEvent({ directory, run, quota, event: {
  event: "WINDOW_STARTED",
  recorded_at: recordedAt,
  run_id: run.run_id,
  preflight_sha256: run.authorization.preflight_sha256,
  official_window_started: true,
  milestone_2_started: true,
} });
process.stdout.write(`${JSON.stringify({ status: "WINDOW_STARTED", run_id: run.run_id, recorded_at: recordedAt, planned_units: state.plannedUnits, qualifying_units: 0, milestone_2_started: true })}\n`);

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("Invalid arguments");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--") || parsed.has(key.slice(2))) throw new Error("Invalid arguments");
    parsed.set(key.slice(2), value);
  }
  return parsed;
}
function required(name) { const value = args.get(name); if (typeof value !== "string" || value.length === 0) throw new Error(`--${name} is required`); return value; }
