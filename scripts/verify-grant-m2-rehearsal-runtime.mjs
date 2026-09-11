import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const hostPreparation = process.argv[2] === '--host-preparation';
const root = resolve((hostPreparation ? process.argv[3] : process.argv[2]) ?? (hostPreparation ? 'artifacts/grant-m2-host-runtime' : 'artifacts/grant-m2-rehearsal-runtime'));
const manifest = JSON.parse(await readFile(resolve(root, 'runtime-manifest.json'), 'utf8'));
const expectedStatus = hostPreparation ? 'STAGED_HOST_PREPARATION_NOT_ACTIVATED' : 'STAGED_INERT_NOT_AUTHORIZED';
if (manifest.schema_version !== 'GrantM2RehearsalRuntimeManifest@0.1.0' || manifest.status !== expectedStatus ||
    manifest.node_version !== '22.17.0' || manifest.contains_credentials !== false || manifest.contains_activation_unit !== hostPreparation ||
    manifest.host_preparation_package !== hostPreparation || manifest.activation_performed !== false ||
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
const units = actualPaths.filter(path => /systemd|\.service$/iu.test(path));
if ((!hostPreparation && units.length > 0) || (hostPreparation && (units.length !== 1 || units[0] !== 'deploy/systemd/sovereignkit-m2-observation-worker@.service'))) throw Error('M2 staged runtime activation-unit inventory is invalid');
process.stdout.write(`${JSON.stringify({ status: 'PASS', gate: hostPreparation ? 'GRANT_M2_HOST_PREPARATION_RUNTIME' : 'GRANT_M2_REHEARSAL_RUNTIME', files: actualPaths.length, sourceCommit: manifest.source_commit, containsActivationUnit: hostPreparation, activationPerformed: false, rehearsalAuthorized: false, milestone2Started: false })}\n`);

async function walk(directory, target) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path, target);
    else if (entry.isFile()) target.push(path);
    else throw Error(`unsupported runtime artifact entry ${path}`);
  }
}
