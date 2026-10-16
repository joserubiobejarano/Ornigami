// Future approved trial only. CLI requires --acknowledge; importing has no I/O.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = 'joserubiobejarano/Ornigami';
const OWNER = 'joserubiobejarano';
const BRANCH = 'codex/ornigami-sri-local-prototype-f-20261016';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function durable(file, bytes) {
  const fd = fs.openSync(file,'wx',0o600);
  try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
}
function ghApi(endpoint, body) {
  const args=['api','--hostname','github.com',endpoint];
  if(body) args.push('--method','POST','--input','-');
  const result=spawnSync('gh',args,{input:body?JSON.stringify(body):undefined,maxBuffer:256*1024*1024,windowsHide:true});
  assert.equal(result.status,0,`GitHub API failed for ${endpoint}; no acknowledgment permitted`);
  return result.stdout;
}
export function retainAndAcknowledge({runId,attempt,requestSha,artifactId,digest,output,acknowledge},api=ghApi) {
  assert.equal(acknowledge,true,'Explicit future approval and --acknowledge are required');
  for (const number of [runId,attempt,artifactId]) assert.match(String(number),/^[1-9][0-9]*$/);
  assert.match(requestSha,/^[a-f0-9]{40}$/);assert.match(digest,/^[a-f0-9]{64}$/);
  const json = endpoint=>JSON.parse(api(endpoint).toString('utf8'));
  assert.equal(json('user').login,OWNER,'Only the repository owner can acknowledge local custody');
  const run=json(`repos/${REPO}/actions/runs/${runId}`);
  assert.equal(String(run.run_attempt),String(attempt));assert.equal(run.head_sha,requestSha);
  assert.equal(run.head_branch,BRANCH);assert.equal(run.event,'push');assert.equal(run.repository.full_name,REPO);
  const artifact=json(`repos/${REPO}/actions/artifacts/${artifactId}`);
  assert.equal(artifact.expired,false);assert.equal(String(artifact.workflow_run.id),String(runId));
  assert.equal(artifact.workflow_run.head_sha,requestSha);
  const bytes=api(`repos/${REPO}/actions/artifacts/${artifactId}/zip`);
  assert.ok(bytes.length>0 && bytes.length<=256*1024*1024,'Evidence archive size must be bounded');
  assert.equal(hash(bytes),digest,'Downloaded zip must match the upload-artifact digest');
  const directory=path.resolve(output);assert.equal(fs.existsSync(directory),false,'Use a new evidence directory');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const archive=path.join(directory,'evidence.zip');durable(archive,bytes);
  assert.equal(hash(fs.readFileSync(archive)),digest,'Read-back of durable local copy must match');
  const receipt={repo:REPO,runId:String(runId),attempt:String(attempt),requestSha,artifactId:String(artifactId),sha256:digest,bytes:bytes.length,downloadedAtUtc:new Date().toISOString()};
  durable(path.join(directory,'DOWNLOAD_RECEIPT.json'),JSON.stringify(receipt,null,2)+'\n');
  const status={state:'success',context:`ornigami/evidence-local/${runId}/${attempt}`,description:`artifact=${artifactId};sha256=${digest}`};
  const ack=JSON.parse(api(`repos/${REPO}/statuses/${requestSha}`,status).toString('utf8'));
  assert.equal(ack.creator.login,OWNER);assert.equal(ack.context,status.context);assert.equal(ack.state,'success');
  durable(path.join(directory,'STATUS_ACK.json'),JSON.stringify(ack,null,2)+'\n');
  return receipt;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [runId,attempt,requestSha,artifactId,digest,output,flag]=process.argv.slice(2);
  assert.equal(flag,'--acknowledge','Usage: retain-external-evidence.mjs RUN ATTEMPT REQUEST_SHA ARTIFACT_ID ZIP_SHA256 NEW_OUTPUT --acknowledge');
  console.log(JSON.stringify(retainAndAcknowledge({runId,attempt,requestSha,artifactId,digest,output,acknowledge:true})));
}
