import { readFile } from "node:fs/promises";

const requiredFiles = [
  "docs/project-master-plan.md",
  "docs/grant-pilot-plan.md",
  "docs/grant-milestone-1-status.md",
  "deploy/grant-pilot/README.md",
  "deploy/grant-pilot/Caddyfile.example",
  "deploy/grant-pilot/observer-runtime.example.json",
  "deploy/grant-pilot/reader-registry.example.json",
  "deploy/grant-pilot/systemd/sovereignkit-observer.service",
  "deploy/grant-pilot/systemd/sovereignkit-observation-worker@.service",
  "deploy/grant-pilot/systemd/sovereignkit-collector.service",
  "spec/grant-observer-registry.schema.json",
  "packages/collector/src/observation-worker.ts",
  "packages/collector/src/observer-runtime.ts",
];

const contents = new Map(await Promise.all(requiredFiles.map(async path => [path, await readFile(path, "utf8")])));
const packageDocument = JSON.parse(await readFile("packages/collector/package.json", "utf8"));
for (const executable of ["sovereignkit-observer-keygen", "sovereignkit-observation-worker", "sovereignkit-observer-runtime", "sovereignkit-collector"]) {
  if (typeof packageDocument.bin?.[executable] !== "string") throw new Error(`collector package is missing ${executable}`);
}
const observerConfig = JSON.parse(contents.get("deploy/grant-pilot/observer-runtime.example.json"));
if (observerConfig.schemaVersion !== "ObserverRuntimeConfig@0.1.0" || !String(observerConfig.collectorUrl).startsWith("https://")) {
  throw new Error("observer runtime example must use the versioned config and HTTPS");
}
if (!contents.get("deploy/grant-pilot/systemd/sovereignkit-observer.service").includes("NoNewPrivileges=true") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-collector.service").includes("ProtectSystem=strict") ||
    !contents.get("deploy/grant-pilot/systemd/sovereignkit-observation-worker@.service").includes("Type=oneshot")) {
  throw new Error("grant systemd templates are missing required hardening");
}
if (!contents.get("docs/grant-milestone-1-status.md").includes("Milestone 2 has not started")) {
  throw new Error("Milestone 1 status must preserve the Milestone 2 gate");
}
process.stdout.write(`${JSON.stringify({ status: "PASS", gate: "GRANT_M1_SOFTWARE", requiredFiles: requiredFiles.length })}\n`);
