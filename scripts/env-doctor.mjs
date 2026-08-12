import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const expected = Object.freeze({
  node: "22.17.0",
  pnpm: "11.16.0",
  rust: "1.97.1",
  agave: "4.0.0",
});

const coreOnly = process.argv.includes("--core");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const checks = [];

function commandVersion(command, args = ["--version"]) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function addCheck(name, actual, wanted, matches) {
  checks.push({ name, actual: actual ?? "MISSING", expected: wanted, ok: actual !== null && matches(actual) });
}

addCheck("Node.js", process.versions.node, expected.node, value => value === expected.node);
const pnpmFromUserAgent = /(?:^|\s)pnpm\/([^\s]+)/u.exec(process.env.npm_config_user_agent ?? "")?.[1] ?? null;
addCheck("pnpm", pnpmFromUserAgent ?? commandVersion("pnpm"), expected.pnpm, value => value === expected.pnpm);

if (!coreOnly) {
  addCheck("Rust", commandVersion("rustc"), expected.rust, value => value === `rustc ${expected.rust}` || value.startsWith(`rustc ${expected.rust} `));
  addCheck("Agave/Solana CLI", commandVersion("solana"), expected.agave, value => value.includes(expected.agave));
}

const manifestMatches = packageJson.packageManager === `pnpm@${expected.pnpm}` && packageJson.volta?.node === expected.node;
checks.push({ name: "package.json pins", actual: manifestMatches ? "consistent" : "mismatch", expected: "consistent", ok: manifestMatches });

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.actual} (expected ${check.expected})`);
}

if (checks.some(check => !check.ok)) {
  process.exitCode = 1;
}
