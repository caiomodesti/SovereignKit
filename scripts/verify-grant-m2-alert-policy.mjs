import { readFile } from "node:fs/promises";

import { validateGrantM2AlertPolicy } from "./lib/grant-m2-alert-policy.mjs";

const path = process.argv[2] ?? "deploy/grant-pilot/m2-alert-policy.json";
console.log(JSON.stringify(validateGrantM2AlertPolicy(JSON.parse(await readFile(path, "utf8")))));
