import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateGrantM2OfficialPreflight } from "./lib/grant-m2-official-preflight.mjs";
import { GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT } from "./lib/grant-m2-official-run.mjs";
import { createGrantM2OfficialReplacementRun } from "./lib/grant-m2-official-replacement.mjs";
import { GRANT_M2_FROZEN_PRECOMMITMENT_SHA256 } from "./lib/grant-m2-official-schedule.mjs";

const sourceCommit = "2cbb5bac687879c7825facef9cf8a12ab48aa668";
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const separator = argument.indexOf("=");
  if (separator < 1) throw new Error(`invalid argument: ${argument}`);
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}));
const preflightPath = resolve(required("preflight"));
const authorizationText = required("authorization-text");
const authorizedAt = canonicalTimestamp(required("authorized-at"));
if (authorizationText !== GRANT_M2_OFFICIAL_AUTHORIZATION_TEXT) throw new Error("exact M2 authorization text is required");

const preflight = JSON.parse(await readFile(preflightPath, "utf8"));
const checkedPreflight = validateGrantM2OfficialPreflight(preflight, sourceCommit);
if (Date.parse(authorizedAt) < Date.parse(preflight.captured_at) || Date.parse(authorizedAt) - Date.parse(preflight.captured_at) > 15 * 60_000) {
  throw new Error("replacement authorization is before or too far after the immediate preflight");
}
const startAt = args["start-at"] ? canonicalTimestamp(args["start-at"]) : defaultStart(authorizedAt);
const runId = `m2-official-replacement-${startAt.replace(/[-:.]/gu, "").toLowerCase()}`;
const quota = JSON.parse(await readFile("deploy/grant-pilot/m2-resource-quota-estimate.json", "utf8"));
const run = createGrantM2OfficialReplacementRun({
  runId,
  startAt,
  authorizedAt,
  authorizationText,
  preflightCapturedAt: preflight.captured_at,
  preflightSha256: checkedPreflight.sha256,
  precommitmentSha256: GRANT_M2_FROZEN_PRECOMMITMENT_SHA256,
  sourceCommit,
  observerInitialSequences: preflight.observer_initial_sequences,
  quota,
});
const output = resolve("artifacts", `grant-m2-official-replacement-${runId}`);
await mkdir(output, { recursive: false, mode: 0o700 });
await writeFile(resolve(output, "preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`, { flag: "wx", mode: 0o600 });
await writeFile(resolve(output, "run.json"), `${JSON.stringify(run, null, 2)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: "AUTHORIZED_NOT_STARTED", output, runId, startAt, endAt: run.schedule.end_at, officialWindowStarted: false })}\n`);

function required(name) { const value = args[name]; if (!value) throw new Error(`missing ${name}`); return value; }
function canonicalTimestamp(value) { const parsed = Date.parse(value); if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`invalid timestamp: ${value}`); return value; }
function defaultStart(value) { const target = Date.parse(value) + 8 * 60_000; return new Date(Math.ceil(target / 60_000) * 60_000).toISOString(); }
