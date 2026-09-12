import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('live rehearsal orchestrator is bounded, fail-closed and does not start the official window', async () => {
  const script = await readFile('scripts/run-grant-m2-live-rehearsal.ps1', 'utf8');
  assert.match(script, /foreach \(\$slot in \$slotsToRun\)/u);
  assert.match(script, /REHEARSAL_STOPPED_FAIL_CLOSED/u);
  assert.match(script, /Não haverá retry automático/u);
  assert.match(script, /qualifying_units=0/u);
  assert.match(script, /elapsed_seconds=3600/u);
  assert.match(script, /yyyy-MM-ddTHH:mm:ss\.fffZ/u);
  assert.match(script, /ConvertFrom-Json -DateKind String/u);
  assert.doesNotMatch(script, /\[int\]\$remaining/u);
  assert.match(script, /official_window_started=\$false/u);
  assert.match(script, /systemctl start --no-block/u);
  assert.match(script, /Complete-PendingSlot/u);
  assert.match(script, /Worker completion deadline exceeded before another transaction/u);
  assert.match(script, /\$newTransactionLimit = 12 - \$PriorRehearsalTransactions/u);
  assert.match(script, /maximum_total_transactions=12/u);
  assert.doesNotMatch(script, /requestAirdrop|--retries|Start-Job/u);
});

test('Google slot-critical transport uses direct PuTTY tools with a pinned host key', async () => {
  const script = await readFile('scripts/run-grant-m2-live-rehearsal.ps1', 'utf8');
  assert.match(script, /GoogleConnectionPath/u);
  assert.match(script, /\$googlePlink -batch -hostkey \$google\.host_key/u);
  assert.match(script, /\$googlePscp -batch -q -hostkey \$google\.host_key/u);
  assert.match(script, /\^ssh-ed25519 255 SHA256:/u);
  assert.doesNotMatch(script, /gcloud\.cmd/u);
});

test('live slot CLI resolves Solana Kit from the probes workspace package', async () => {
  const script = await readFile('scripts/run-grant-m2-rehearsal-slot.mjs', 'utf8');
  assert.match(script, /createRequire\(new URL\('\.\.\/packages\/probes\/package\.json'/u);
  assert.match(script, /requireFromProbes\('@solana\/kit'\)/u);
  assert.doesNotMatch(script, /from '@solana\/kit'/u);
});

test('remote receiver selects the assignment authority from the installed allowlist', async () => {
  const script = await readFile('scripts/receive-grant-m2-assignment.mjs', 'utf8');
  assert.match(script, /Array\.isArray\(assignmentAuthorityDocument\)/u);
  assert.match(script, /assignmentAuthorities\.find/u);
  assert.match(script, /issuerId === entry\?\.assignment\?\.issuerId/u);
  assert.match(script, /keyId === entry\?\.assignment\?\.issuerKeyId/u);
});

test('orchestrator transports only a public assignment authority to a host', async () => {
  const script = await readFile('scripts/run-grant-m2-live-rehearsal.ps1', 'utf8');
  assert.match(script, /Public assignment authority does not match the local signing key/u);
  assert.match(script, /Send-HostFile \$slot\.observer_id \$AssignmentAuthorityPublicPath \$remoteAuthority/u);
  assert.doesNotMatch(script, /Send-HostFile \$slot\.observer_id \$AssignmentAuthorityPath/u);
});
