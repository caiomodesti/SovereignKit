import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { evaluateGrantM1ZeroCostAccountReadiness } from "./lib/grant-m1-zero-cost-account-readiness.mjs";

const args = process.argv.slice(2);
const requireReady = args.includes("--require-ready");
const fileArg = args.find(argument => !argument.startsWith("--"));
const file = resolve(fileArg ?? "deploy/grant-pilot/zero-cost-account-readiness.example.json");
const document = JSON.parse(await readFile(file, "utf8"));
const result = evaluateGrantM1ZeroCostAccountReadiness(document);

console.log(`GRANT_M1_ZERO_COST_ACCOUNT_READINESS ${result.status}`);
console.log(`file=${file}`);
console.log(`blockers=${result.blockers.length}`);
for (const blocker of result.blockers) console.log(`- ${blocker}`);
if (requireReady && !result.ready) process.exitCode = 1;
