import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { signObservationAssignment, verifyObservationAssignment } from '../../packages/collector/dist/observation-assignment.js';
import { validateObservationJob } from '../../packages/collector/dist/observation-worker.js';
import { verifyAssignmentReceipt } from './grant-m2-assignment-receipt.mjs';

export const scheduleHash = schedule => createHash('sha256').update(JSON.stringify(schedule)).digest('hex');
const sha = value => createHash('sha256').update(value).digest('hex');
const readerIds = ['grant-m2-reader-public-a','grant-m2-reader-alchemy','grant-m2-reader-public-b'];
function time(value) {
  const n=Date.parse(value);
  if(!Number.isSafeInteger(n)||new Date(n).toISOString()!==value) throw Error('Canonical UTC required');
  return n;
}
function bindJob(schedule, slotId, job) {
  if(schedule.mode!=='DRY_RUN_ONLY'||schedule.rehearsal_started!==false||schedule.milestone_2_started!==false) throw Error('Only preparation schedules supported');
  const slot=schedule.slots.find(item=>item.slot_id===slotId);
  if(!slot || !/^[a-f0-9]{64}$/.test(slotId)) throw Error('Unknown slot');
  validateObservationJob(job, readerIds.map(readerId=>({readerId})));
  const u=job.unit;
  if(job.observerId!==slot.observer_id || u.route_id!==slot.route_id || u.probe_index!==slot.cycle_index ||
     u.experiment_id!==`m2-rehearsal-${schedule.run_id}` || u.experiment_version!=='1' || u.phase!=='healthy' || u.transaction_class!=='MATCHED_CONTROL' ||
     job.experimentDefinitionHash!==scheduleHash(schedule)) throw Error('Job does not bind rehearsal slot');
  const unitHash=sha([u.experiment_id,u.experiment_version,u.phase,u.observer_id,u.route_id,u.transaction_class,String(u.probe_index)].join('\u001f'));
  const submission=job.submission;
  if(u.unit_id!==unitHash || submission.attempt_id!==sha(`${unitHash}:attempt-1`) ||
     !['RPC_ACKNOWLEDGED','RPC_REJECTED'].includes(submission.outcome) ||
     ![submission.blockhash_context_slot,submission.last_valid_block_height,submission.serialized_size_bytes].every(n=>Number.isSafeInteger(n)&&n>0) ||
     time(submission.created_at)>time(submission.submitted_at) ||
     (submission.response_at!==undefined && time(submission.response_at)<time(submission.submitted_at))) throw Error('Invalid submission provenance');
  if(job.pollIntervalMs!==5000||job.observationDeadlineMs!==120000||job.readerRequestTimeoutMs!==10000) throw Error('Observation timing drift');
  return slot;
}

export function prepareRehearsalDispatch({schedule,slotId,job,signer,issuedAt,expiresAt,assignmentId}) {
  const slot=bindJob(schedule,slotId,job);
  if(time(issuedAt)<time(job.submission.submitted_at) || time(issuedAt)>time(slot.due_at)+10000 ||
     time(issuedAt)<time(slot.due_at) || time(expiresAt)-time(issuedAt)!==180000) throw Error('Dispatch timing invalid');
  const assignment=signObservationAssignment({schemaVersion:'ObservationAssignment@0.1.0',assignmentId,issuerId:signer.issuerId,issuerKeyId:signer.keyId,issuedAt,expiresAt,job},signer);
  return {schema_version:'GrantM2PreparedDispatch@0.1.0',schedule_sha256:scheduleHash(schedule),slot_id:slotId,assignment};
}

export async function prepareSequencedRehearsalDispatch({sequenceJournal,...input}) {
  if(typeof sequenceJournal?.reserve!=='function') throw Error('Sequence journal required');
  const slot=input.schedule.slots.find(item=>item.slot_id===input.slotId);
  if(slot===undefined||input.job?.observerId!==slot.observer_id) throw Error('Job does not bind rehearsal slot');
  const reservation=await sequenceJournal.reserve({slotId:input.slotId,unitId:input.job.unit?.unit_id,assignmentId:input.assignmentId,reservedAt:input.issuedAt});
  if(reservation.status!=='RESERVED') return {status:'RECONCILIATION_REQUIRED',slot_id:input.slotId};
  const job={...input.job,observerSequence:reservation.record.observer_sequence};
  return {status:'PREPARED',entry:prepareRehearsalDispatch({...input,job})};
}

async function writeOnce(path,value) {
  const handle=await open(path,'wx',0o600);
  try {await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}
  finally {await handle.close();}
}

// No built-in SSH or remote execution: adapter and run approval must be supplied.
// A reservation survives ambiguous transport outcomes; there is no auto retry.
export async function dispatchPrepared({directory,schedule,entry,authority,receiptAuthority,approval,nowAt,deliver}) {
  const now=time(nowAt);
  if(approval?.authorized!==true||approval.scope!=='PRE_M2_REHEARSAL_ONLY'||approval.schedule_sha256!==scheduleHash(schedule)||
     now<time(approval.not_before)||now>time(approval.not_after)) throw Error('Rehearsal dispatch not authorized');
  if(entry.schema_version!=='GrantM2PreparedDispatch@0.1.0'||entry.schedule_sha256!==scheduleHash(schedule)) throw Error('Dispatch schedule mismatch');
  const slot=bindJob(schedule,entry.slot_id,entry.assignment.job);
  if(now<time(slot.due_at)||now>time(slot.due_at)+10000) throw Error('Dispatch slot expired');
  verifyObservationAssignment(entry.assignment,authority,new Date(now));
  if(typeof deliver!=='function') throw Error('Transport adapter required');
  await mkdir(directory,{recursive:true});
  const attemptDir=join(directory,entry.slot_id);
  try {await mkdir(attemptDir);}
  catch(error) {if(error.code==='EEXIST') return {status:'RECONCILIATION_REQUIRED',slot_id:entry.slot_id};throw error;}
  await writeOnce(join(attemptDir,'reservation.json'),{entry,now_at:nowAt,status:'RESERVED_BEFORE_TRANSPORT'});
  let receipt;
  try {
    receipt=await deliver(structuredClone(entry));
    verifyAssignmentReceipt(receipt,entry,receiptAuthority,nowAt);
  } catch {
    await writeOnce(join(attemptDir,'outcome.json'),{status:'DELIVERY_UNCERTAIN',slot_id:entry.slot_id});
    return {status:'DELIVERY_UNCERTAIN',slot_id:entry.slot_id};
  }
  await writeOnce(join(attemptDir,'outcome.json'),{status:'TRANSPORT_RECEIPT_RECORDED',assignment_id:receipt.assignment_id,payload_hash:receipt.payload_hash});
  return {status:'TRANSPORT_RECEIPT_RECORDED',slot_id:entry.slot_id,qualifying_units:0};
}
