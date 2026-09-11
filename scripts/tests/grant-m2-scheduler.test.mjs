import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advanceDryRun, createRehearsalSchedule, decideTick } from '../lib/grant-m2-scheduler.mjs';
const quota = JSON.parse(await readFile('deploy/grant-pilot/m2-resource-quota-estimate.json','utf8'));
const schedule = () => createRehearsalSchedule({ runId:'test-only',startAt:'2026-09-10T00:00:00.000Z',quota });
const dir = () => mkdtemp(join(tmpdir(),'sk-m2-scheduler-'));

test('twelve offset slots across two cycles never count toward grant KPI', () => {
  const plan = schedule();
  const records=[];
  for(const slot of plan.slots) {
    const tick = decideTick(plan,slot.due_at,records);
    assert.deepEqual(tick.decisions,[{slot_id:slot.slot_id,state:'DRY_RUN_DUE'}]);
    assert.equal(tick.qualifying_units,0);
    assert.equal(tick.window_elapsed,false);
    records.push(tick);
  }
  assert.equal(decideTick(plan,plan.end_at,records).window_elapsed,true);
});

test('late startup marks missed slots without catch-up; future slots remain scheduled', () => {
  const tick = decideTick(schedule(),'2026-09-10T00:01:01.001Z');
  assert.equal(tick.decisions.length,4);
  assert.ok(tick.decisions.every(item=>item.state==='MISSING'));
  assert.equal(decideTick(schedule(),'2026-09-09T23:59:59.000Z').decisions.length,0);
});

test('new scheduler invocation recomputes disk records and does not repeat a slot', async () => {
  const directory=await dir(),plan=schedule();
  const first=await advanceDryRun({directory,schedule:plan,nowAt:plan.start_at});
  const restarted=await advanceDryRun({directory,schedule:schedule(),nowAt:plan.start_at});
  assert.equal(first.decisions.length,1);
  assert.equal(restarted.decisions.length,0);
  assert.equal(restarted.sequence,1);
});

test('clock rollback and modified schedule fail closed with lock retained', async () => {
  const directory=await dir(),plan=schedule();
  await advanceDryRun({directory,schedule:plan,nowAt:plan.slots[1].due_at});
  await assert.rejects(advanceDryRun({directory,schedule:plan,nowAt:plan.start_at}),/backwards/);
  assert.ok((await readdir(directory)).includes('.scheduler.lock'));
  const second=await dir();
  await advanceDryRun({directory:second,schedule:plan,nowAt:plan.start_at});
  const changed=createRehearsalSchedule({runId:'different',startAt:plan.start_at,quota});
  await assert.rejects(advanceDryRun({directory:second,schedule:changed,nowAt:plan.start_at}),/binding changed/);
});

test('concurrent invocations allow only one writer', async () => {
  const directory=await dir(),plan=schedule();
  const results=await Promise.allSettled([1,2].map(()=>advanceDryRun({directory,schedule:plan,nowAt:plan.start_at})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'EEXIST');
});

test('partial journal and abandoned lock are never silently replayed or repaired', async () => {
  const directory=await dir(),plan=schedule();
  await advanceDryRun({directory,schedule:plan,nowAt:plan.start_at});
  await writeFile(join(directory,'tick-000001.json'),'{');
  await assert.rejects(advanceDryRun({directory,schedule:plan,nowAt:plan.slots[1].due_at}));
  assert.equal(await readFile(join(directory,'tick-000001.json'),'utf8'),'{');
  await assert.rejects(advanceDryRun({directory,schedule:plan,nowAt:plan.slots[1].due_at}),{code:'EEXIST'});
});

test('UTC and mode validation reject accidental live use', () => {
  assert.throws(()=>createRehearsalSchedule({runId:'x',startAt:'2026-09-10',quota}),/UTC/);
  const plan=schedule();plan.mode='LIVE';
  assert.throws(()=>decideTick(plan,plan.start_at),/dry-run/);
});
