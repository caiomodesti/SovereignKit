import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const marker = process.argv.indexOf("--evidence");
const evidenceText = marker >= 0 ? process.argv[marker + 1] : undefined;
if (evidenceText === undefined) throw new Error("usage: node scripts/verify-grant-m1-recovery-drill.mjs --evidence <directory>");
const path = resolve(evidenceText, "recovery-evidence.json");
const evidence = JSON.parse(await readFile(path, "utf8"));
if (evidence.schema_version !== "GrantM1LocalRecoveryDrill@0.1.0" || evidence.evidence_scope !== "LOCAL_SOFTWARE_RECOVERY_ONLY" || evidence.infrastructure_independence !== false) throw new Error("recovery drill claim boundary is invalid");
if (evidence.outage_preserved_queue !== true || evidence.observer_restart_delivered !== true || evidence.collector_restart_recovered !== true || evidence.restart_succeeded !== true) throw new Error("recovery drill did not prove the required recovery transitions");
if (evidence.recovered_records !== 1 || evidence.duplicate_delivery_records !== 0) throw new Error("recovery drill record counts are invalid");
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_LOCAL_RECOVERY", evidence: path, recoveredRecords: 1, infrastructureIndependence: false })}\n`);
