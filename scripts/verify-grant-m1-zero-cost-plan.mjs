import { readFile } from "node:fs/promises";

import { validateGrantM1ZeroCostPlan } from "./lib/grant-m1-zero-cost-plan.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/zero-cost-candidate-plan.json";
const plan = JSON.parse(await readFile(path, "utf8"));
process.stdout.write(`${JSON.stringify(validateGrantM1ZeroCostPlan(plan))}\n`);
