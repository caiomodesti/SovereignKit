import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'artifacts/grant-m2-rehearsal-runtime');
const manifest = JSON.parse(await readFile(resolve(root, 'runtime-manifest.json'), 'utf8'));
if (manifest.schema_version !== 'GrantM2RehearsalRuntimeManifest@0.1.0' || manifest.status !== 'STAGED_INERT_NOT_AUTHORIZED' ||
    manifest.node_version !== '22.17.0' || manifest.contains_credentials !== false || manifest.contains_activation_unit !== false ||
    manifest.authorizes_rehearsal !== false || manifest.milestone_2_started !== false || !/^[a-f0-9]{40}$/u.test(manifest.source_commit)) {
  throw Error('M2 runtime manifest safety contract is invalid');
}
const actual = [];
await walk(root, actual);
const actualPaths = actual.map(path => relative(root, path).split(sep).join('/')).filter(path => path !== 'runtime-manifest.json').sort();
const declaredPaths = manifest.files.map(entry => entry.path);
if (new Set(declaredPaths).size !== declaredPaths.length || JSON.stringify(declaredPaths) !== JSON.stringify(actualPaths)) throw Error('M2 runtime manifest file set mismatch');
for (const entry of manifest.files) {
  if (!/^[a-f0-9]{64}$/u.test(entry.sha256) || createHash('sha256').update(await readFile(resolve(root, entry.path))).digest('hex') !== entry.sha256) throw Error(`M2 runtime hash mismatch: ${entry.path}`);
  if (/secret|private-key|\.env/iu.test(entry.path)) throw Error(`forbidden credential path in M2 runtime: ${entry.path}`);
}
if (actualPaths.some(path => /systemd|\.service$/iu.test(path))) throw Error('M2 staged runtime must not contain activation units');
process.stdout.write(`${JSON.stringify({ status: 'PASS', gate: 'GRANT_M2_REHEARSAL_RUNTIME', files: actualPaths.length, sourceCommit: manifest.source_commit, rehearsalAuthorized: false, milestone2Started: false })}\n`);

async function walk(directory, target) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path, target);
    else if (entry.isFile()) target.push(path);
    else throw Error(`unsupported runtime artifact entry ${path}`);
  }
}

