import { readFile } from "node:fs/promises";
import { validateGrantM2RehearsalPlan } from "./lib/grant-m2-rehearsal-plan.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/m2-rehearsal-plan.json";
const plan = JSON.parse(await readFile(path, "utf8"));
const artifacts = new Map();
for (const binding of Object.values(plan.bindings ?? {})) artifacts.set(binding.path, await readFile(binding.path, "utf8"));
console.log(JSON.stringify(validateGrantM2RehearsalPlan(plan, artifacts)));
