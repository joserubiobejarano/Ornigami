import fs from'node:fs';import path from'node:path';import{execFileSync,spawnSync}from'node:child_process';import assert from'node:assert/strict';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),repo='repos/joserubiobejarano/Ornigami',requestSha='97fc2b86f2efe55683242e8b20a38a79fdebfb1e',runId=process.argv[2],save=(n,j)=>fs.writeFileSync(path.join(dir,n),JSON.stringify(j,null,2)+'\n'),get=p=>JSON.parse(execFileSync('gh',['api',p],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:60000,windowsHide:true}));
assert.match(runId,/^[1-9][0-9]*$/);assert.equal(fs.existsSync(path.join(dir,'CUSTODY_ATTEMPTED.json')),false,'No second custody helper invocation');
let invoked=false;const started=Date.now();
try{
 while(Date.now()-started<25*60*1000){
  const run=get(repo+'/actions/runs/'+runId);assert.equal(run.head_sha,requestSha);assert.equal(run.run_attempt,1);assert.equal(run.path,'.github/workflows/ornigami-db-admission-only.yml');assert.equal(run.head_branch,'codex/ornigami-sri-local-prototype-f-20261016');save('run-current.json',run);
  const artifacts=get(repo+'/actions/runs/'+runId+'/artifacts');save('artifacts-current.json',artifacts);fs.appendFileSync(path.join(dir,'custody-watch.jsonl'),JSON.stringify({at:new Date().toISOString(),runStatus:run.status,artifactCount:artifacts.total_count})+'\n');
  if(artifacts.total_count){
   assert.equal(artifacts.total_count,1);const a=artifacts.artifacts[0];assert.equal(a.name,'ornigami-db-admission-'+runId+'-1');assert.equal(a.expired,false);assert.match(a.digest??'',/^sha256:[a-f0-9]{64}$/);assert.ok(a.size_in_bytes>0&&a.size_in_bytes<=256*1024*1024);save('artifact-metadata.json',a);
   assert.equal(invoked,false);invoked=true;save('CUSTODY_ATTEMPTED.json',{at:new Date().toISOString(),runId,attempt:1,requestSha,artifactId:a.id,sha256:a.digest.slice(7),automaticRetry:false});
   const result=spawnSync(process.execPath,['--max-old-space-size=512',path.resolve('.local/framework-prototype/ornigami-db-admission-only/scripts/framework-prototype/retain-db-admission-evidence.mjs'),runId,'1',requestSha,String(a.id),a.digest.slice(7),path.join(dir,'custody'),'--acknowledge'],{encoding:'utf8',maxBuffer:1024*1024,timeout:180000,windowsHide:true});fs.writeFileSync(path.join(dir,'custody-helper.stdout'),result.stdout??'');fs.writeFileSync(path.join(dir,'custody-helper.stderr'),result.stderr??'');assert.equal(result.status,0,'Custody helper failed; no retry');
   const receipt=JSON.parse(fs.readFileSync(path.join(dir,'custody/DOWNLOAD_RECEIPT.json')));save('CUSTODY_COMPLETED.json',{...receipt,status:'exactly one owner-authenticated acknowledgment after identity/digest/durable save/read-back verification',completeness:'not assessed; independently required',securityAcceptance:false});console.log(JSON.stringify(receipt));break;
  }
  if(run.status==='completed')throw Error('Completed without artifact; no acknowledgment');
  await new Promise(r=>setTimeout(r,10000));
 }
 if(!invoked)throw Error('Artifact wait deadline ended; no retry');
}catch(error){save('CUSTODY_FAILURE.json',{at:new Date().toISOString(),message:error.message,helperInvoked:invoked,automaticRetry:false});console.error(error.message);process.exitCode=1;}
