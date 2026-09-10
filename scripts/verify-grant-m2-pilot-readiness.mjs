import { readFile } from "node:fs/promises";

import { validateGrantM2PilotReadiness } from "./lib/grant-m2-pilot-readiness.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/m2-pilot-readiness.json";
const plan = JSON.parse(await readFile(path, "utf8"));
const precommitmentContent = await readFile(plan.freeze_evidence.path, "utf8");
console.log(JSON.stringify(validateGrantM2PilotReadiness(plan, precommitmentContent)));
