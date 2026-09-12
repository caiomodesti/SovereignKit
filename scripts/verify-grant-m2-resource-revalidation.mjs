import { readFile } from "node:fs/promises";

import { validateResourceRevalidation } from "./lib/grant-m2-operational-controls.mjs";

const path = process.argv[2] ?? "fixtures/grant-m2/resource-revalidation-20260912.json";
const record = JSON.parse(await readFile(path, "utf8"));
process.stdout.write(`${JSON.stringify(validateResourceRevalidation(record))}\n`);
