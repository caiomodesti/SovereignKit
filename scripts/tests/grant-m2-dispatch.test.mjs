import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { generateAssignmentAuthorityKeyPair } from '../../packages/collector/dist/observation-assignment.js';
import { executeObservationAssignment } from '../../packages/collector/dist/observation-worker.js';
import { createRehearsalSchedule } from '../lib/grant-m2-scheduler.mjs';
import { prepareRehearsalDispatch,dispatchPrepared,scheduleHash } from '../lib/grant-m2-dispatch.mjs';
import { createRpcBudget } from '../lib/grant-m2-rpc-budget.mjs';
const quota=JSON.parse(await readFile('deploy/grant-pilot/m2-resource-quota-estimate.json','utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
function fixture() {
  const schedule=createRehearsalSchedule({runId:'test-only',startAt:'2026-09-10T00:00:00.000Z',quota});
  const slot=schedule.slots[0],at=slot.due_at;
  const unit={experiment_id:'m2-rehearsal-test-only',experiment_version:'1',phase:'healthy',observer_id:slot.observer_id,route_id:slot.route_id,transaction_class:'MATCHED_CONTROL',probe_index:0};
  unit.unit_id=hash(Object.values(unit).join('\u001f'));
  const job={schemaVersion:'ObservationJob@0.1.0',resultId:randomUUID(),observerId:slot.observer_id,observerKeyId:'test-key',observerSequence:0,unit,experimentDefinitionHash:scheduleHash(schedule),signature:'2'.repeat(88),
    submission:{attempt_id:hash(`${unit.unit_id}:attempt-1`),attempt_number:1,outcome:'RPC_ACKNOWLEDGED',blockhash:'1'.repeat(32),blockhash_context_slot:1,last_valid_block_height:100,serialized_size_bytes:215,created_at:at,submitted_at:at,response_at:at},pollIntervalMs:5000,observationDeadlineMs:120000,readerRequestTimeoutMs:10000};
  const signer=generateAssignmentAuthorityKeyPair('test-issuer','test-key');
  const authority={issuerId:signer.issuerId,keyId:signer.keyId,publicKeySpkiBase64:signer.publicKeySpkiBase64,validFrom:at};
  const approval={authorized:true,scope:'PRE_M2_REHEARSAL_ONLY',schedule_sha256:scheduleHash(schedule),not_before:at,not_after:'2026-09-10T01:00:00.000Z'};
  const args={schedule,slotId:slot.slot_id,job,signer,issuedAt:at,expiresAt:'2026-09-10T00:03:00.000Z',assignmentId:randomUUID()};
  return {args,schedule,entry:prepareRehearsalDispatch(args),authority,approval,nowAt:at};
}
const dir=()=>mkdtemp(join(tmpdir(),'sk-m2-dispatch-'));
const receipt=entry=>({status:'RECEIVED',assignment_id:entry.assignment.assignmentId,payload_hash:entry.assignment.payloadHash});

test('signed assignment reaches injected transport once across restart; receipt is not a KPI',async()=>{
  const f=fixture(),directory=await dir();let calls=0;
  const deliver=async entry=>{calls++;return receipt(entry);};
  const result=await dispatchPrepared({...f,directory,deliver});
  assert.equal(result.status,'TRANSPORT_RECEIPT_RECORDED');assert.equal(result.qualifying_units,0);
  assert.equal((await dispatchPrepared({...f,directory,deliver})).status,'RECONCILIATION_REQUIRED');
  assert.equal(calls,1);
});
test('absent approval or a tampered signature prevents transport',async()=>{
  const f=fixture(),directory=await dir();let calls=0;const deliver=async e=>{calls++;return receipt(e);};
  await assert.rejects(dispatchPrepared({...f,directory,deliver,approval:{authorized:false}}),/not authorized/);
  f.entry.assignment.job.observerSequence++;
  await assert.rejects(dispatchPrepared({...f,directory,deliver}),/payload hash/);
  assert.equal(calls,0);
});
test('wrong observer, unsupported phase and stale slot are rejected',async()=>{
  const f=fixture();
  const wrong=structuredClone(f.args.job);wrong.unit.phase='public_pilot';
  assert.throws(()=>prepareRehearsalDispatch({...f.args,job:wrong}),/bind rehearsal/);
  wrong.unit.phase='healthy';wrong.observerId='different';
  assert.throws(()=>prepareRehearsalDispatch({...f.args,job:wrong}),/observer identity/);
  await assert.rejects(dispatchPrepared({...f,directory:await dir(),nowAt:'2026-09-10T00:00:10.001Z',deliver:receipt}),/expired/);
});
test('timeout after possible delivery retains reservation and never retries',async()=>{
  const f=fixture(),directory=await dir();let calls=0;
  const deliver=async()=>{calls++;throw Error('simulated lost response');};
  assert.equal((await dispatchPrepared({...f,directory,deliver})).status,'DELIVERY_UNCERTAIN');
  assert.equal((await dispatchPrepared({...f,directory,deliver})).status,'RECONCILIATION_REQUIRED');assert.equal(calls,1);
  assert.equal(JSON.parse(await readFile(join(directory,f.entry.slot_id,'outcome.json'))).status,'DELIVERY_UNCERTAIN');
});
test('receipt for another assignment cannot acknowledge delivery',async()=>{
  const f=fixture();
  assert.equal((await dispatchPrepared({...f,directory:await dir(),deliver:async()=>({status:'RECEIVED',assignment_id:randomUUID(),payload_hash:'x'})})).status,'DELIVERY_UNCERTAIN');
});
test('one shared owner gate budgets all five methods and survives restoration',async()=>{
  let at=1000,saved,calls=0;
  const options={owner:'coordinator',totalLimit:100,now:()=>at,persist:async state=>{saved=state;}};
  let gate=createRpcBudget(options);
  const results=await Promise.all(['getHealth','getSignatureStatuses','sendTransaction','getBlockHeight'].map(m=>gate.call(m,async()=>++calls)));
  assert.equal(results.filter(r=>r.allowed).length,3);assert.equal(calls,3);
  gate=createRpcBudget({...options,restored:saved});at=1999;
  assert.equal((await gate.call('getLatestBlockhash',async()=>++calls)).reason,'RATE_LIMIT');
  at=2000;await gate.call('getLatestBlockhash',async()=>++calls);await gate.call('getHealth',async()=>++calls);
  assert.equal((await gate.call('getBlockHeight',async()=>++calls)).reason,'TOTAL_QUOTA');assert.equal(calls,5);
});
test('failed RPC remains charged and failed persistence blocks subsequent calls',async()=>{
  let saved,calls=0;
  const gate=createRpcBudget({owner:'observer-aws-a',totalLimit:20,now:()=>1000,persist:async s=>{saved=s;}});
  await assert.rejects(gate.call('sendTransaction',async()=>{calls++;throw Error('timeout');}),/timeout/);
  assert.equal(saved.spent,20);assert.equal((await gate.call('sendTransaction',async()=>calls++)).reason,'TOTAL_QUOTA');
  const broken=createRpcBudget({owner:'coordinator',totalLimit:100,now:()=>1000,persist:async()=>{throw Error('disk');}});
  await assert.rejects(broken.call('getHealth',async()=>calls++),/persistence/);
  await assert.rejects(broken.call('getHealth',async()=>calls++),/reconciliation/);assert.equal(calls,1);
});
test('budget rejects unknown methods and backwards clock',async()=>{
  let at=1000;const gate=createRpcBudget({owner:'coordinator',totalLimit:100,now:()=>at,persist:async()=>{}});
  await assert.rejects(gate.call('unpricedMethod',async()=>{}),/Unbudgeted/);
  await gate.call('getHealth',async()=>{});at--;
  await assert.rejects(gate.call('getHealth',async()=>{}),/clock/);
});

test('prepared assignment is consumed by the existing worker with synthetic readers',async()=>{
  const f=fixture(),directory=await dir();let observed;
  const readers=['grant-m2-reader-public-a','grant-m2-reader-alchemy','grant-m2-reader-public-b'].map(readerId=>({
    readerId,getSignatureStatus:async()=>({status:'finalized',slot:42n,rpcContextSlot:43n}),getBlockHeight:async()=>50n,
  }));
  const result=await dispatchPrepared({...f,directory,deliver:async entry=>{
    observed=await executeObservationAssignment({assignment:entry.assignment,authority:f.authority,readers,rawLogPath:join(directory,'synthetic-raw.jsonl'),now:()=>new Date(f.nowAt)});
    return receipt(entry);
  }});
  assert.equal(result.status,'TRANSPORT_RECEIPT_RECORDED');
  assert.equal(observed.terminal_state,'FINALIZED');
  assert.equal(observed.result_id,f.entry.assignment.job.resultId);
  assert.equal(result.qualifying_units,0);
});

test('concurrent dispatch attempts invoke transport only once',async()=>{
  const f=fixture(),directory=await dir();let calls=0;
  const deliver=async entry=>{calls++;return receipt(entry);};
  const results=await Promise.all([1,2].map(()=>dispatchPrepared({...f,directory,deliver})));
  assert.equal(calls,1);assert.equal(results.filter(r=>r.status==='RECONCILIATION_REQUIRED').length,1);
});

test('slow in-flight calls retain rate reservations instead of allowing a delayed burst',async()=>{
  let at=1000;const releases=[];
  const gate=createRpcBudget({owner:'coordinator',totalLimit:200,now:()=>at,persist:async()=>{}});
  const pending=[1,2,3].map(()=>gate.call('getHealth',()=>new Promise(resolve=>releases.push(resolve))));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(releases.length,3);
  at=10000;assert.equal((await gate.call('getHealth',async()=>{})).reason,'RATE_LIMIT');
  releases.forEach(resolve=>resolve('ok'));await Promise.all(pending);
  at=10999;assert.equal((await gate.call('getHealth',async()=>{})).reason,'RATE_LIMIT');
  at=11000;assert.equal((await gate.call('getHealth',async()=>{})).allowed,true);
});

test('waits for capacity without repeating the RPC operation',async()=>{
  let at=1000,calls=0,waits=0;
  const gate=createRpcBudget({owner:'observer-google-e2-micro',totalLimit:200,now:()=>at,persist:async()=>{}});
  for(let index=0;index<3;index++) await gate.call('getHealth',async()=>++calls);
  const result=await gate.callWhenAvailable('getBlockHeight',async()=>++calls,{sleep:async milliseconds=>{waits++;at+=milliseconds;}});
  assert.equal(result.allowed,true);assert.equal(calls,4);assert.equal(waits,1);assert.equal(at,2000);
});

test('aborts a capacity wait before any delayed RPC starts',async()=>{
  const gate=createRpcBudget({owner:'observer-oracle-a1',totalLimit:200,now:()=>1000,persist:async()=>{}});
  for(let index=0;index<3;index++) await gate.call('getHealth',async()=>{});
  const controller=new AbortController();let delayedCalls=0;
  const waiting=gate.callWhenAvailable('getBlockHeight',async()=>++delayedCalls,{abortSignal:controller.signal,sleep:(_milliseconds,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))});
  controller.abort(new DOMException('deadline','AbortError'));
  await assert.rejects(waiting,/deadline/u);assert.equal(delayedCalls,0);
});
