import { readFile } from "node:fs/promises";

import { validateGrantM2PilotPrecommitment } from "./lib/grant-m2-pilot-precommitment.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/m2-pilot-precommitment.json";
const plan = JSON.parse(await readFile(path, "utf8"));
const contents = new Map();
contents.set(plan.m1_observer_registry.path, await readFile(plan.m1_observer_registry.path, "utf8"));
for (const route of plan.routes ?? []) contents.set(route.preflight_path, await readFile(route.preflight_path, "utf8"));
contents.set(plan.route_candidate_failures.path, await readFile(plan.route_candidate_failures.path, "utf8"));
console.log(JSON.stringify(validateGrantM2PilotPrecommitment(plan, contents)));
