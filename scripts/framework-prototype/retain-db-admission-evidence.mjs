// Future run-specific owner authorization required. Import has no side effects.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {retainAndAcknowledge} from './retain-external-evidence.mjs';
import {workflowPath} from './admission-only.mjs';
export function retainAdmissionEvidence(options,api){
  const guarded=(endpoint,body)=>{
    const bytes=api(endpoint,body);
    if(endpoint.endsWith(`/actions/runs/${options.runId}`)){
      const run=JSON.parse(bytes.toString('utf8'));assert.equal(run.path,workflowPath,'Wrong diagnostic workflow');assert.equal(String(run.run_attempt),'1','No rerun permitted');
    }
    if(endpoint.endsWith(`/actions/artifacts/${options.artifactId}`)){
      const artifact=JSON.parse(bytes.toString('utf8'));assert.equal(artifact.name,`ornigami-db-admission-${options.runId}-${options.attempt}`,'Wrong diagnostic artifact');
    }
    return bytes;
  };
  return retainAndAcknowledge(options,guarded);
}
function gh(endpoint,body){const args=['api','--hostname','github.com',endpoint];if(body)args.push('--method','POST','--input','-');const result=spawnSync('gh',args,{input:body?JSON.stringify(body):undefined,maxBuffer:256*1024*1024,timeout:60000,windowsHide:true});assert.equal(result.status,0,'GitHub evidence API failed; no acknowledgment');return result.stdout;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [runId,attempt,requestSha,artifactId,digest,output,flag]=process.argv.slice(2);assert.equal(flag,'--acknowledge');
  console.log(JSON.stringify(retainAdmissionEvidence({runId,attempt,requestSha,artifactId,digest,output,acknowledge:true},gh)));
}
