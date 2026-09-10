import { readFile } from "node:fs/promises";

import { validateGrantM2AlertPolicy } from "./lib/grant-m2-alert-policy.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/m2-alert-policy.json";
const policy = JSON.parse(await readFile(path, "utf8"));
const artifacts = new Map([[policy.delivery.evidence_path, await readFile(policy.delivery.evidence_path, "utf8")]]);
console.log(JSON.stringify(validateGrantM2AlertPolicy(policy, artifacts)));
