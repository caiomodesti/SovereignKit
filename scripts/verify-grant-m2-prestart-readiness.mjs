import { readFile } from "node:fs/promises";
import { validateGrantM2PrestartReadiness } from "./lib/grant-m2-prestart-readiness.mjs";

const path = process.argv[2] ?? "fixtures/grant-m2/prestart-readiness-20260912.json";
const snapshot = JSON.parse(await readFile(path, "utf8"));
const artifacts = Object.fromEntries(await Promise.all(
  Object.values(snapshot.evidence).map(async binding => [binding.path, await readFile(binding.path, "utf8")]),
));

process.stdout.write(`${JSON.stringify(validateGrantM2PrestartReadiness(snapshot, artifacts))}\n`);
