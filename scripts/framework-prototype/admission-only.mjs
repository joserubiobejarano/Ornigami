// Admission diagnostics only. No image/scan/build interfaces and no network on import.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {admitFrozenDatabase} from './frozen-db-admission.mjs';

export const requestPath='.github/build-requests/ornigami-db-admission.json';
export const workflowPath='.github/workflows/ornigami-db-admission-only.yml';
export const branch='codex/ornigami-sri-local-prototype-f-20261016';
export const scannerSha='1f889576636db0623539cb339df7d06c40ebf39e7919489eafa1160e29808f19';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function validateResourceObservation({cgroup,diskFreeBytes}){
  const events=Object.fromEntries(cgroup['memory.events'].split('\n').map(s=>s.split(/\s+/)));
  if(cgroup['memory.max']!=='2147483648'||cgroup['memory.swap.max']!=='0'||cgroup['cpu.max']!=='100000 100000'||['max','oom','oom_kill','oom_group_kill'].some(k=>events[k]!=='0'))throw Error('Resource admission failed: limits drift or nonzero limit/OOM event');
  if(BigInt(diskFreeBytes)<21474836480n)throw Error('20 GiB disk reserve exhausted');
}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const fd=fs.openSync(file,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function git(repo,...args){const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});if(r.status!==0)throw Error('Git identity check failed: '+args[0]);return r.stdout.trim();}

// Also exercised against real local Git histories. The workflow independently
// enforces this protocol before executing any candidate-owned code.
function verifySingleParent(repo,requestSha,sourceSha,parents){
  // Kept separate to make accidental merge commits fail closed.
  if(parents.length!==2)throw Error('Request must have exactly one parent');
  const changed=git(repo,'diff','--name-only',sourceSha,requestSha).split('\n');
  if(changed.length!==1||changed[0]!==requestPath)throw Error('Request-only commit required');
  const request=JSON.parse(git(repo,'show',`${requestSha}:${requestPath}`));
  if(JSON.stringify(Object.keys(request).sort())!==JSON.stringify(['packageLockSha256','purpose','sourceSha'])||request.purpose!=='ornigami-db-admission-only-v1'||request.sourceSha!==sourceSha||!/^[a-f0-9]{64}$/.test(request.packageLockSha256))throw Error('Invalid request protocol/source');
  for(const file of [workflowPath,'.github/workflows/ornigami-image-rehearsal.yml','.github/build-requests/ornigami.json'])if(git(repo,'rev-parse',`${sourceSha}:${file}`)!==git(repo,'rev-parse',`${requestSha}:${file}`))throw Error('Workflow/full marker drift');
  const lock=spawnSync('git',['-C',repo,'show',`${sourceSha}:package-lock.json`],{timeout:10000,maxBuffer:4*1024*1024});
  if(lock.status!==0||hash(lock.stdout)!==request.packageLockSha256)throw Error('Lock mismatch');
  return {requestSha,sourceSha,packageLockSha256:request.packageLockSha256,workflowBlob:git(repo,'rev-parse',`${sourceSha}:${workflowPath}`)};
}
export function verifyProtocol(repo,requestSha){
  if(!/^[a-f0-9]{40}$/.test(requestSha))throw Error('Invalid request SHA');
  const parents=git(repo,'rev-list','--parents','-n1',requestSha).split(' ');
  return verifySingleParent(repo,requestSha,parents[1],parents);
}

export async function runAdmission({root,sourceSha,execute,now=Date.now,scannerHash=scannerSha}){
  const evidence=path.join(root,'evidence'),cache=path.join(root,'cache'),scanner=path.join(root,'tools/trivy');
  const phases={download:{result:'skipped',reason:'not reached'},admission:{result:'skipped',reason:'not reached'},fixtures:{result:'skipped',reason:'shared prerequisite not passed'}};
  const save=()=>write(path.join(evidence,'phases.json'),{sourceSha,phases,imageWork:'out-of-scope',custody:'not-assessed'});
  save();
  async function command(name,executable,args){
    phases[name]={result:'failed',startedAt:new Date(now()).toISOString(),command:path.basename(executable),arguments:args};save();
    let r;try{r=await execute(name,executable,args);}catch(error){r={status:null,stdout:'',stderr:error.message,error:error.message};}
    fs.writeFileSync(path.join(evidence,`${name}.stdout`),r.stdout??'');fs.writeFileSync(path.join(evidence,`${name}.stderr`),r.stderr??'');
    phases[name]={...phases[name],result:r.status===0?'passed':'failed',exit:r.status??null,signal:r.signal??null,error:r.error?.message??r.error??null,finishedAt:new Date(now()).toISOString()};save();return r.status===0;
  }
  // Exactly one download invocation, never retried or substituted. Even failure
  // proceeds to the single diagnostic admission to retain partial/missing bytes.
  const downloaded=await command('download',scanner,['image','--download-db-only','--no-progress','--db-repository','ghcr.io/aquasecurity/trivy-db:2','--cache-dir',cache]);
  phases.admission={result:'failed',startedAt:new Date(now()).toISOString()};save();
  try{
    const r=await admitFrozenDatabase({cacheDirectory:cache,outputDirectory:path.join(evidence,'database-admission'),sourceSha,scannerPath:scanner,scannerSha256:scannerHash,now});
    phases.admission={...phases.admission,result:r.result,errors:r.errors,finishedAt:new Date(now()).toISOString()};
  }catch(error){phases.admission={...phases.admission,error:error.message,finishedAt:new Date(now()).toISOString()};}
  save();
  if(downloaded&&phases.admission.result==='passed'){
    await command('fixtures',process.execPath,['--max-old-space-size=512','--test','tests/frozen-db-admission.test.mjs']);
    phases.fixtures.data='fictional fixtures only; independent of real DB';save();
  }else{phases.fixtures.reason='download or shared admission failed; no dependent work';save();}
  return Object.values(phases).every(p=>p.result==='passed')?0:1;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,sourceSha]=process.argv.slice(2);
  const execute=(name,executable,args)=>spawnSync(executable,args,{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,NODE_OPTIONS:'--max-old-space-size=512'}});
  process.exitCode=await runAdmission({root,sourceSha,execute});
}
