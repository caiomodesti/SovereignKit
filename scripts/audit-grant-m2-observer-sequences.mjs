import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) throw new Error('at least one evidence root is required');

const hits = [];

function inspect(value, file) {
  if (value === null || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if ((key === 'observerSequence' || key === 'observer_sequence') && Number.isSafeInteger(nested)) {
      hits.push({ file: basename(file), sequence: nested });
    }
    inspect(nested, file);
  }
}

async function inspectDirectory(directory) {
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const name of names) {
    const path = join(directory, name);
    const metadata = await stat(path);
    if (metadata.isDirectory()) {
      await inspectDirectory(path);
      continue;
    }
    if (metadata.size >= 5_000_000) continue;
    const text = await readFile(path, 'utf8');
    for (const line of text.trim().split('\n')) {
      if (line.length === 0) continue;
      try {
        inspect(JSON.parse(line), path);
      } catch {
        // Non-JSON operational files are outside this audit.
      }
    }
  }
}

for (const root of roots) await inspectDirectory(root);
hits.sort((left, right) => left.sequence - right.sequence);
const maximum = hits.at(-1) ?? null;
console.log(JSON.stringify({
  status: 'PASS',
  recordsInspected: hits.length,
  maximum,
  nextSequence: maximum === null ? 0 : maximum.sequence + 1,
  lastRecords: hits.slice(-10),
}));
