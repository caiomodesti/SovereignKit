import { readFile } from "node:fs/promises";

import { validateGrantM1InfrastructurePlan } from "./lib/grant-m1-infrastructure-plan.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/infrastructure-plan.json";
const plan = JSON.parse(await readFile(path, "utf8"));
process.stdout.write(`${JSON.stringify(validateGrantM1InfrastructurePlan(plan))}\n`);
