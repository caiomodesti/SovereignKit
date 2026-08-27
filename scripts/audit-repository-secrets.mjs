import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbiddenPaths = tracked.filter(path =>
  /(^|\/)(\.env(?:\.|$)|\.secrets(?:\/|$)|credentials?(?:\.|\/|$))/iu.test(path) && !path.endsWith(".env.example") ||
  /(?:keypair\.json|\.(?:pem|p12|pfx|key|secret))$/iu.test(path),
);

const fragments = [
  ["github", "pat", "_"].join("_"),
  ["gh", "p", "_"].join(""),
  ["gh", "o", "_"].join(""),
  ["xox", "b", "-"].join(""),
  ["xox", "p", "-"].join(""),
  ["sk", "live", "_"].join("_"),
  ["pk", "live", "_"].join("_"),
  ["al", "ch", "_"].join(""),
  ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
];
const findings = [];
for (const path of tracked) {
  const content = await readFile(path);
  if (content.includes(0)) continue;
  const text = content.toString("utf8");
  for (const fragment of fragments) {
    if (text.includes(fragment)) findings.push({ path, signature: fragment.slice(0, 8) });
  }
}

if (forbiddenPaths.length > 0 || findings.length > 0) {
  process.stderr.write(`${JSON.stringify({ status: "FAILED", forbiddenPaths, findings })}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ status: "PASSED", trackedFilesScanned: tracked.length, forbiddenPathCount: 0, signatureFindingCount: 0 })}\n`);
}
