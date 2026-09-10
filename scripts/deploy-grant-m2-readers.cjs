// Run on the approved observer as root: node script.cjs <expected-current-sha256>.
// Reuses credentials already present on that host; never prints endpoints.
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const path = '/etc/sovereignkit/readers.json';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/.test(expected || '')) throw Error('Expected current hash required');
if (process.getuid() !== 0) throw Error('Root required');
const stat = fs.lstatSync(path);
const serviceUid = Number(cp.execFileSync('id', ['-u', 'sovereignkit'], {encoding:'utf8'}).trim());
const mode = stat.mode & 0o777;
if (!stat.isFile() || stat.isSymbolicLink() || ![0,serviceUid].includes(stat.uid) || ![0o600,0o640].includes(mode)) throw Error('Unexpected file ownership or permissions');
const original = fs.readFileSync(path);
if (hash(original) !== expected) throw Error('Current configuration changed; stop');
const config = JSON.parse(original);
if (config.schemaVersion !== 'ObservationReaderRegistry@0.1.0' || config.readers?.length !== 3) throw Error('Invalid current registry');
const origins = config.readers.map(reader => new URL(reader.endpoint).origin);
if (origins[0] !== 'https://api.devnet.solana.com' || origins[1] !== 'https://solana-devnet.g.alchemy.com') throw Error('Unexpected upstream order');
const workers = cp.execFileSync('systemctl', ['list-units', '--state=running,activating', '--no-legend', 'sovereignkit-observation-worker@*'], {encoding:'utf8'}).trim();
if (workers) throw Error('Observation job active; stop');
cp.execFileSync('systemctl', ['is-active', '--quiet', 'sovereignkit-observer.service']);
const ids = ['grant-m2-reader-public-a', 'grant-m2-reader-alchemy', 'grant-m2-reader-public-b'];
const replacement = {
  schemaVersion: 'ObservationReaderRegistry@0.1.0',
  readers: [config.readers[0], config.readers[1], config.readers[0]].map((r, i) => ({readerId:ids[i],endpoint:new URL(r.endpoint).toString()})),
  independence: 'LOGICAL_REDUNDANCY_WITH_CORRELATED_PUBLIC_UPSTREAM',
  limitation: 'Readers public-a and public-b are distinct logical clients over the same Solana Public Devnet upstream and are not independent witnesses.',
};
const bytes = Buffer.from(JSON.stringify(replacement)+'\n');
const run = crypto.randomUUID();
const backup = path+'.before-m2-'+run;
const staging = path+'.pending-m2-'+run;
function exclusiveWrite(target, data, mode) {
  const fd = fs.openSync(target, 'wx', mode);
  try { fs.writeFileSync(fd, data); fs.fchownSync(fd, stat.uid, stat.gid); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
exclusiveWrite(backup, original, 0o600);
exclusiveWrite(staging, bytes, mode);
if (hash(fs.readFileSync(path)) !== expected) throw Error('Concurrent registry change; staged files retained');
fs.renameSync(staging,path);
const fd = fs.openSync('/etc/sovereignkit','r');
try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
if (hash(fs.readFileSync(path)) !== hash(bytes)) throw Error('Installed hash mismatch');
cp.execFileSync('systemctl', ['is-active', '--quiet', 'sovereignkit-observer.service']);
console.log(JSON.stringify({status:'PASS',captured_at:new Date().toISOString(),previous_sha256:expected,installed_sha256:hash(bytes),backup_path:backup,backup_retained:true,service_active:true,reader_ids:ids,mode:mode.toString(8).padStart(4,'0'),rehearsal_started:false,milestone_2_started:false}));
