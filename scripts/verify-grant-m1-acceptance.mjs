import { verifyGrantM1Acceptance } from "./lib/grant-m1-acceptance.mjs";

const marker = process.argv.indexOf("--evidence");
const evidenceText = marker >= 0 ? process.argv[marker + 1] : undefined;
if (evidenceText === undefined) throw new Error("usage: node scripts/verify-grant-m1-acceptance.mjs --evidence <directory>");
const result = await verifyGrantM1Acceptance(evidenceText);
process.stdout.write(`${JSON.stringify(result)}\n`);
