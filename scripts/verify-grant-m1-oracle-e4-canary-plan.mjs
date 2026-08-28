import { readFile } from "node:fs/promises";
import { validateGrantM1OracleE4CanaryPlan } from "./lib/grant-m1-oracle-e4-canary-plan.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/oracle-e4-collector-canary-plan.json";
const plan = JSON.parse(await readFile(path, "utf8"));
process.stdout.write(`${JSON.stringify(validateGrantM1OracleE4CanaryPlan(plan))}\n`);
