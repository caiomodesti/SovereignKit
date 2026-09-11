import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactsRoot = resolve(repositoryRoot, 'artifacts');
const hostPreparation = process.argv[2] === '--host-preparation';
const outputArgument = hostPreparation ? process.argv[3] : process.argv[2];
if (process.argv.length > (hostPreparation ? 4 : 3)) throw Error('usage: stage-grant-m2-rehearsal-runtime [--host-preparation] [output-below-artifacts]');
const outputRoot = resolve(repositoryRoot, outputArgument ?? (hostPreparation ? 'artifacts/grant-m2-host-runtime' : 'artifacts/grant-m2-rehearsal-runtime'));
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
if (trackedChanges.length > 0) throw Error('M2 runtime staging requires a clean tracked Git tree');
if (outputRoot !== artifactsRoot && !outputRoot.startsWith(`${artifactsRoot}${sep}`)) throw Error('M2 runtime output must remain inside artifacts');

const copies = [
  ['packages/collector/dist', 'packages/collector/dist'],
  ['packages/probes/dist', 'packages/probes/dist'],
  ['deploy/grant-pilot/probes-observer-runtime-package.json', 'packages/probes/package.json'],
  ['packages/probes/dist', 'vendor/probes/dist'],
  ['deploy/grant-pilot/probes-observer-runtime-package.json', 'vendor/probes/package.json'],
  ['packages/telemetry/dist', 'packages/telemetry/dist'],
  ['deploy/grant-pilot/telemetry-observer-runtime-package.json', 'packages/telemetry/package.json'],
  ['packages/telemetry/dist', 'vendor/telemetry/dist'],
  ['deploy/grant-pilot/telemetry-observer-runtime-package.json', 'vendor/telemetry/package.json'],
  ['scripts/run-grant-m2-observation-worker.mjs', 'scripts/run-grant-m2-observation-worker.mjs'],
  ['scripts/receive-grant-m2-assignment.mjs', 'scripts/receive-grant-m2-assignment.mjs'],
  ['scripts/lib/grant-m2-assignment-inbox.mjs', 'scripts/lib/grant-m2-assignment-inbox.mjs'],
  ['scripts/lib/grant-m2-assignment-receipt.mjs', 'scripts/lib/grant-m2-assignment-receipt.mjs'],
  ['scripts/lib/grant-m2-budgeted-readers.mjs', 'scripts/lib/grant-m2-budgeted-readers.mjs'],
  ['scripts/lib/grant-m2-rpc-budget-journal.mjs', 'scripts/lib/grant-m2-rpc-budget-journal.mjs'],
  ['scripts/lib/grant-m2-rpc-budget.mjs', 'scripts/lib/grant-m2-rpc-budget.mjs'],
];
if (hostPreparation) copies.push(['deploy/grant-pilot/systemd/sovereignkit-m2-observation-worker@.service', 'deploy/systemd/sovereignkit-m2-observation-worker@.service']);

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const [source, destination] of copies) {
  const target = resolve(outputRoot, destination);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(repositoryRoot, source), target, { recursive: true, force: true });
}

const runtimePackage = {
  name: 'sovereignkit-grant-m2-rehearsal-runtime', version: '0.1.0', private: true, type: 'module',
  engines: { node: '22.17.0' },
  dependencies: { '@sovereignkit/probes': 'file:vendor/probes', '@sovereignkit/telemetry': 'file:vendor/telemetry', '@solana/kit': '7.0.0' },
};
await writeFile(resolve(outputRoot, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, { flag: 'wx' });
const lock = JSON.parse(await readFile(resolve(repositoryRoot, 'deploy/grant-pilot/observer-runtime-package-lock.json'), 'utf8'));
lock.name = runtimePackage.name; lock.version = runtimePackage.version;
lock.packages[''].name = runtimePackage.name; lock.packages[''].version = runtimePackage.version;
await writeFile(resolve(outputRoot, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' });

const files = [];
await walk(outputRoot, files);
files.sort((left, right) => left.localeCompare(right));
const manifest = {
  schema_version: 'GrantM2RehearsalRuntimeManifest@0.1.0',
  status: hostPreparation ? 'STAGED_HOST_PREPARATION_NOT_ACTIVATED' : 'STAGED_INERT_NOT_AUTHORIZED',
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(),
  node_version: '22.17.0',
  dependency_install: 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
  contains_credentials: false,
  contains_activation_unit: hostPreparation,
  host_preparation_package: hostPreparation,
  activation_performed: false,
  authorizes_rehearsal: false,
  milestone_2_started: false,
  files: await Promise.all(files.map(async path => ({ path: relative(outputRoot, path).split(sep).join('/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))),
};
await writeFile(resolve(outputRoot, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ status: manifest.status, output: relative(repositoryRoot, outputRoot).split(sep).join('/'), source_commit: manifest.source_commit, file_count: manifest.files.length })}\n`);

async function walk(directory, target) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path, target);
    else if (entry.isFile()) target.push(path);
    else throw Error(`unsupported runtime artifact entry ${path}`);
  }
}
