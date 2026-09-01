import { lstat, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { verifyGrantM1CanaryEvidence } from "./lib/grant-m1-canary-evidence.mjs";

const args = parseArgs(process.argv.slice(2));
const observerId = required(args, "observer-id");
const rawPath = resolve(required(args, "raw"));
const summaryPath = resolve(required(args, "summary"));
if (rawPath === summaryPath) throw new Error("raw and summary must be different files");
await Promise.all([assertRegularNonSymlink(rawPath, "raw"), assertRegularNonSymlink(summaryPath, "summary")]);

const [rawJsonl, summaryText] = await Promise.all([readFile(rawPath, "utf8"), readFile(summaryPath, "utf8")]);
let summary;
try {
  summary = JSON.parse(summaryText);
} catch {
  throw new Error("canary summary is not valid JSON");
}
const verification = verifyGrantM1CanaryEvidence({ observerId, rawJsonl, rawBasename: basename(rawPath), summary });
process.stdout.write(`${JSON.stringify({ status: verification.admitted ? "PASS" : "FAIL", gate: "GRANT_M1_OBSERVER_CANARY_EVIDENCE", verification })}\n`);
if (!verification.admitted) process.exitCode = 1;

async function assertRegularNonSymlink(path, label) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
}

function parseArgs(values) {
  if (values.length % 2 !== 0) throw new Error("arguments must use --name value pairs");
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("arguments must use --name value pairs");
    const key = name.slice(2);
    if (parsed.has(key)) throw new Error(`duplicate argument --${key}`);
    parsed.set(key, value);
  }
  const allowed = new Set(["observer-id", "raw", "summary"]);
  for (const key of parsed.keys()) if (!allowed.has(key)) throw new Error(`unknown argument --${key}`);
  return parsed;
}

function required(values, key) {
  const value = values.get(key);
  if (!value) throw new Error(`--${key} is required`);
  return value;
}
