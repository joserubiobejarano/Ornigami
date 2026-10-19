import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const cleanupDeadline = () => {
  const value=process.env.ORNIGAMI_CLEANUP_DEADLINE_EPOCH;
  if(value===undefined)return null;
  if(!/^\d{1,12}$/.test(value))return NaN;
  return Number(value)*1000;
};
function markCleanupUnproved(reason) {
  const file=process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;
  if(file){try{fs.appendFileSync(file,`docker_unproved=${reason}\n`,{mode:0o600});}catch{}}
}
function cleanupAlreadyUnproved() {
  const file=process.env.ORNIGAMI_CLEANUP_UNPROVED_FILE;
  if(!file)return false;
  try{return fs.readFileSync(file,'utf8').length>0;}catch{return true;}
}
export function workflowCleanupDocker(args,{invoke=spawnSync,now=Date.now}={}) {
  const deadline=cleanupDeadline();
  if(deadline!==null&&(!Number.isFinite(deadline)||cleanupAlreadyUnproved())){
    markCleanupUnproved('prior-timeout-or-invalid-deadline');
    return {status:null,signal:null,error:{code:'ORNIGAMI_CLEANUP_UNPROVED'},stdout:'',stderr:''};
  }
  const remaining=deadline===null?30000:deadline-now()-30000;
  const callSeconds=deadline===null?30:Math.min(10,Math.floor(remaining/1000)-3);
  if(callSeconds<1){
    markCleanupUnproved('insufficient-time-before-finalization-reserve');
    return {status:null,signal:null,error:{code:'ETIMEDOUT'},stdout:'',stderr:''};
  }
  const command=deadline===null?'docker':'timeout';
  const commandArgs=deadline===null?args:['--signal=TERM','--kill-after=2s',`${callSeconds}s`,'docker',...args];
  const timeout=deadline===null?30000:(callSeconds+3)*1000;
  const options={encoding:'utf8',timeout,maxBuffer:1024*1024,windowsHide:true};
  if(deadline!==null)options.killSignal='SIGKILL';
  const result=invoke(command,commandArgs,options);
  if(deadline!==null&&(result.error||result.signal||result.status===null))markCleanupUnproved('docker-client-timeout-or-interruption');
  return result;
}
const validId = value => /^sha256:[0-9a-f]{64}$/.test(value ?? '');

// A successful removal command is insufficient. Only a successful subsequent
// daemon inventory establishes absence; an inspect error never does.
export function cleanupOwnedImages(records, invoke = workflowCleanupDocker) {
  const results = [];
  const inventory = () => {
    const response = invoke(['image','ls','--all','--quiet','--no-trunc']);
    if (response.status !== 0 || response.error || response.signal) throw Error('Image inventory unavailable');
    const ids = response.stdout.trim().split(/\s+/).filter(Boolean);
    if (ids.some(id => !validId(id))) throw Error('Invalid image inventory');
    return new Set(ids);
  };
  for (const record of records.filter(value => value.ownedImage)) {
    const result = {stage:record.stage, imageId:record.imageId, reference:record.reference, result:'failed'};
    try {
      if (!validId(record.imageId) || typeof record.reference !== 'string' || !record.reference) throw Error('Claimed image identity missing');
      if (!inventory().has(record.imageId)) {
        result.result = 'already absent'; result.absenceVerified = true;
      } else {
        const inspected = invoke(['image','inspect',record.reference,'--format','{{.Id}}']);
        if (inspected.status !== 0 || inspected.error || inspected.signal) throw Error('Claimed image reference unavailable; preserved');
        if (inspected.stdout.trim() !== record.imageId) throw Error('Claimed image identity drift; preserved');
        // Remove by immutable ID, never a mutable reference that could drift.
        const removed = invoke(['image','rm',record.imageId]);
        result.removalExit = removed.status; result.removalSignal = removed.signal ?? null;
        result.absenceVerified = !inventory().has(record.imageId);
        if (removed.status !== 0 || removed.error || removed.signal) throw Error('Image removal failed');
        if (!result.absenceVerified) throw Error('Claimed image remains after removal');
        result.result = 'removed exact claimed image';
      }
    } catch (error) { result.error = error.message; }
    results.push(result);
  }
  return results;
}
