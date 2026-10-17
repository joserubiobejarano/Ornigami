import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runAdmission,verifyProtocol,validateResourceObservation,requestPath,workflowPath,branch} from '../scripts/framework-prototype/admission-only.mjs';
import {retainAdmissionEvidence} from '../scripts/framework-prototype/retain-db-admission-evidence.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const time=Date.parse('2026-10-17T12:00:00Z');
const sourceSha='a'.repeat(40);
const captureScript=path.resolve('scripts/framework-prototype/admission-only-capture.py');
const python=process.platform==='win32'?'python':'python3';
const save=(file,v)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof v==='string'?v:JSON.stringify(v));};
function temporary(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-admission-test-'));return Promise.resolve().then(()=>fn(root)).finally(()=>{assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'ornigami-admission-test-'));fs.rmSync(root,{recursive:true,force:true});});}
function capture(root){return spawnSync(python,[captureScript,'capture',path.join(root,'evidence')],{encoding:'utf8',timeout:15000});}
function baseEvidence(root){
  for(const [file,data] of Object.entries({'run-identity.json':{fictional:true},'protocol.json':{sourceSha},'bootstrap.json':{exit:0,result:'passed'},'step-outcomes.json':{fictional:true},'bootstrap.stdout':'fictional bootstrap stdout','bootstrap.stderr':'','host-tools.stdout':'fictional tool inventory','resources.json':{fictional:true},'controller.stdout':'fictional controller log','controller.stderr':''}))save(path.join(root,'evidence',file),data);
}
async function controllerFixture(root,mode){
  baseEvidence(root);save(path.join(root,'tools/trivy'),'fictional tool; never executed');
  const calls=[];
  const exit=await runAdmission({root,sourceSha,scannerHash:hash('fictional tool; never executed'),now:()=>time,execute:async(name,executable,args)=>{
    calls.push({name,executable,args});
    if(name==='download'&&mode!=='download-failure'){
      save(path.join(root,'cache/db/trivy.db'),'fictional DB bytes; not a real DB');
      save(path.join(root,'cache/db/metadata.json'),mode==='reject'?'{broken':{Version:2,UpdatedAt:'2026-10-17T11:00:00Z',NextUpdate:'2026-10-17T13:00:00Z',DownloadedAt:'2026-10-17T11:55:00Z'});
    }
    return {status:mode==='download-failure'?37:mode==='fixtures-failure'&&name==='fixtures'?12:0,stdout:`fictional ${name}`,stderr:name==='download'&&mode==='download-failure'?'fictional transport failure':''};
  }});
  return {exit,calls,phases:JSON.parse(fs.readFileSync(path.join(root,'evidence/phases.json'))).phases};
}
for(const mode of ['success','reject','download-failure','fixtures-failure'])test(`controller ${mode}: one download, one admission, explicit independent capture`,()=>temporary(async root=>{
  const r=await controllerFixture(root,mode);assert.equal(r.exit,mode==='success'?0:1);
  assert.equal(r.calls.filter(x=>x.name==='download').length,1);
  assert.deepEqual(r.calls[0].args,['image','--download-db-only','--no-progress','--db-repository','ghcr.io/aquasecurity/trivy-db:2','--cache-dir',path.join(root,'cache')]);
  assert.equal(r.phases.admission.result,['reject','download-failure'].includes(mode)?'failed':'passed');
  assert.equal(r.phases.fixtures.result,['reject','download-failure'].includes(mode)?'skipped':mode==='fixtures-failure'?'failed':'passed');
  assert.equal(r.calls.length,['reject','download-failure'].includes(mode)?1:2);
  const receipt=JSON.parse(fs.readFileSync(path.join(root,'evidence/database-admission/index.json')));assert.equal(receipt.phase,'complete');assert.equal(receipt.clock.epochMs,time);
  if(mode==='reject'){assert.ok(receipt.errors.some(e=>e.code==='metadata-malformed-json'));assert.equal(fs.readFileSync(path.join(root,'evidence/database-admission/metadata.original.bin'),'utf8'),'{broken');}
  if(mode==='download-failure')assert.equal(r.phases.download.exit,37);
  const c=capture(root);assert.equal(c.status,0,c.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'evidence/manifest.json')));assert.equal(manifest.capture,'passed');
  for(const file of manifest.files){const b=fs.readFileSync(path.join(root,'evidence',file.path));assert.equal(b.length,file.bytes);assert.equal(hash(b),file.sha256);}
  assert.ok(fs.statSync(path.join(root,'evidence/SUMMARY.md')).size>0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'evidence/capture.json'))).custody,'not-assessed');
}));
test('download executor exception still produces admission failure index and skips fixtures',()=>temporary(async root=>{
 baseEvidence(root);save(path.join(root,'tools/trivy'),'fake');
 assert.equal(await runAdmission({root,sourceSha,scannerHash:hash('fake'),now:()=>time,execute:async()=>{throw Error('fictional launch failure');}}),1);
 assert.match(fs.readFileSync(path.join(root,'evidence/download.stderr'),'utf8'),/fictional launch failure/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'evidence/database-admission/index.json'))).result,'failed');
 assert.equal(capture(root).status,0);
}));
test('bootstrap failure retains explicit skipped phases and a nonempty manifest',()=>temporary(root=>{
 baseEvidence(root);save(path.join(root,'evidence/bootstrap.json'),{exit:42,result:'failed'});
 assert.equal(capture(root).status,0);
 const phases=JSON.parse(fs.readFileSync(path.join(root,'evidence/phases.json'))).phases;
 assert.ok(Object.values(phases).every(p=>p.result==='skipped'&&p.reason));
 assert.ok(JSON.parse(fs.readFileSync(path.join(root,'evidence/manifest.json'))).files.length>5);
}));
for(const mutation of ['missing-summary-input','missing-original','tampered-original','tampered-clock','tampered-identity','incomplete-admission','missing-resource','missing-exit','dependent-after-rejection'])test(`capture refuses ${mutation} while retaining failure manifest`,()=>temporary(async root=>{
 await controllerFixture(root,mutation==='dependent-after-rejection'?'reject':'success');
 if(mutation==='missing-summary-input')fs.unlinkSync(path.join(root,'evidence/protocol.json'));
 if(mutation==='missing-original')fs.unlinkSync(path.join(root,'evidence/database-admission/metadata.original.bin'));
 if(mutation==='tampered-original')save(path.join(root,'evidence/database-admission/metadata.original.bin'),'tampered');
 if(mutation==='missing-resource')fs.unlinkSync(path.join(root,'evidence/resources.json'));
 if(mutation==='tampered-clock')save(path.join(root,'evidence/database-admission/validation-clock.json'),{epochMs:time+1});
 if(mutation==='tampered-identity')save(path.join(root,'evidence/database-admission/scannerIdentity.json'),{sha256:'0'.repeat(64)});
 if(mutation==='incomplete-admission'){const p=path.join(root,'evidence/database-admission/index.json'),r=JSON.parse(fs.readFileSync(p));r.phase='retained-before-parsing';save(p,r);}
 if(['missing-exit','dependent-after-rejection'].includes(mutation)){const p=path.join(root,'evidence/phases.json'),r=JSON.parse(fs.readFileSync(p));if(mutation==='missing-exit')delete r.phases.download.exit;else r.phases.fixtures={result:'passed',exit:0,data:'fictional fixtures only; independent of real DB'};save(p,r);}
 const c=capture(root);assert.equal(c.status,1,c.stderr);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'evidence/manifest.json'))).capture,'failed');assert.ok(fs.statSync(path.join(root,'evidence/SUMMARY.md')).size>0);
}));
function git(repo,...args){const r=spawnSync('git',['-c','core.autocrlf=false','-c','commit.gpgsign=false','-C',repo,...args],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
async function history(root,mutation){
 git(root,'init','-q');git(root,'config','user.name','Fictional Fixture');git(root,'config','user.email','fixture@example.invalid');
 const lock='{"fictional":true}\n';
 for(const [file,value] of Object.entries({[workflowPath]:'fictional workflow','.github/workflows/ornigami-image-rehearsal.yml':'fictional full workflow','.github/build-requests/ornigami.json':'unchanged full marker','package-lock.json':lock}))save(path.join(root,file),value);
 git(root,'add','.');git(root,'commit','-qm','fictional candidate');const parent=git(root,'rev-parse','HEAD');
 const request={purpose:'ornigami-db-admission-only-v1',sourceSha:parent,packageLockSha256:hash(lock)};
 if(mutation==='wrong-source')request.sourceSha='b'.repeat(40);
 if(mutation==='wrong-lock')request.packageLockSha256='0'.repeat(64);
 if(mutation==='extra-key')request.arbitraryWorkflow='other';
 if(mutation==='wrong-purpose')request.purpose='full-build';
 save(path.join(root,requestPath),request);
 if(mutation==='extra-file')save(path.join(root,'extra.txt'),'extra');
 if(mutation==='workflow-drift')save(path.join(root,workflowPath),'changed workflow');
 if(mutation==='full-marker-drift')save(path.join(root,'.github/build-requests/ornigami.json'),'changed full marker');
 git(root,'add','.');git(root,'commit','-qm','fictional request');return {parent,request:git(root,'rev-parse','HEAD')};
}
test('exact-source protocol accepts real local single request-only child',()=>temporary(async root=>{const h=await history(root);assert.equal(verifyProtocol(root,h.request).sourceSha,h.parent);}));
for(const mutation of ['wrong-source','wrong-lock','extra-key','wrong-purpose','extra-file','workflow-drift','full-marker-drift'])test(`exact-source protocol refuses ${mutation}`,()=>temporary(async root=>{const h=await history(root,mutation);assert.throws(()=>verifyProtocol(root,h.request));}));
test('exact-source protocol refuses merge request',()=>temporary(async root=>{
 const h=await history(root);const tree=git(root,'rev-parse',`${h.request}^{tree}`);
 const merge=git(root,'commit-tree',tree,'-p',h.parent,'-p',h.request,'-m','fictional merge');assert.throws(()=>verifyProtocol(root,merge),/exactly one parent/);
}));
for(const mutation of ['none','owner-drift','outside','symlink'])test(`cleanup ${mutation} is confined to run-owned direct child`,()=>temporary(root=>{
 const owned=path.join(root,'ornigami-db-only-1-1-fixture'),other=path.join(root,'preserve-other-project');fs.mkdirSync(owned);fs.mkdirSync(other);save(path.join(other,'keep'),'preserve');const identity={run:'1',attempt:'1',request:'a'.repeat(40)};save(path.join(owned,'owner.json'),identity);save(path.join(owned,'payload'),'fictional cache');
 if(mutation==='symlink')fs.symlinkSync(other,path.join(owned,'link'),process.platform==='win32'?'junction':'dir');
 const target=mutation==='outside'?other:owned,expected=mutation==='owner-drift'?{...identity,attempt:'2'}:identity;
 const r=spawnSync(python,[captureScript,'cleanup',target,root,JSON.stringify(expected)],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,mutation==='none'?0:1,r.stderr);assert.equal(fs.readFileSync(path.join(other,'keep'),'utf8'),'preserve');assert.equal(fs.existsSync(owned),mutation!=='none');
 if(mutation==='symlink')fs.unlinkSync(path.join(owned,'link'));
}));
test('restricted triggers isolate candidate publication, diagnostic request and full marker',()=>{
 const diagnostic=fs.readFileSync(workflowPath,'utf8'),full=fs.readFileSync('.github/workflows/ornigami-image-rehearsal.yml','utf8');
 const parse=text=>({branches:[...text.split('permissions:')[0].matchAll(/      - (codex\/[^\n]+)/g)].map(m=>m[1].trim()),paths:[...text.split('permissions:')[0].matchAll(/      - (\.github\/[^\n]+)/g)].map(m=>m[1].trim())});
 const d=parse(diagnostic),f=parse(full);assert.deepEqual(d,{branches:[branch],paths:[requestPath]});assert.deepEqual(f,{branches:[branch],paths:['.github/build-requests/ornigami.json']});
 const fires=(w,files)=>files.some(file=>w.paths.includes(file));
 assert.equal(fires(d,[workflowPath,'scripts/framework-prototype/admission-only.mjs']),false);assert.equal(fires(f,[workflowPath]),false);assert.equal(fires(d,[requestPath]),true);assert.equal(fires(f,[requestPath]),false);assert.equal(fires(d,f.paths),false);
 for(const file of ['.github/workflows/ci.yml','.github/workflows/security.yml'])assert.match(fs.readFileSync(file,'utf8').split('pull_request:')[0],new RegExp(branch));
 assert.match(diagnostic,/github\.event\.created == false/);assert.match(diagnostic,/github\.run_attempt == 1/);assert.doesNotMatch(diagnostic,/workflow_dispatch|pull_request:/);
 assert.equal((diagnostic.match(/    runs-on:/g)??[]).length,1);assert.match(diagnostic,/runs-on: ubuntu-24\.04/);
});
test('workflow source-admission failure fallback produces failed manifest and explicit skipped phases',()=>temporary(root=>{
 const workflow=fs.readFileSync(workflowPath,'utf8'),blocks=[...workflow.matchAll(/<<'PY'[^\n]*\n([\s\S]*?)\n          PY/g)];
 assert.equal(blocks.length,2);const script=blocks[1][1].split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
 const evidence=path.join(root,'evidence');fs.mkdirSync(evidence);save(path.join(evidence,'run-identity.json'),{fictional:true});
 const r=spawnSync(python,['-c',script,evidence],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'manifest.json'))).capture,'failed');assert.ok(Object.values(JSON.parse(fs.readFileSync(path.join(evidence,'phases.json'))).phases).every(p=>p.result==='skipped'&&p.reason));assert.ok(fs.statSync(path.join(evidence,'SUMMARY.md')).size>0);
}));
test('workflow resource, source binding, evidence, custody and no-image boundaries remain explicit',()=>{
 const w=fs.readFileSync(workflowPath,'utf8'),bootstrap=fs.readFileSync('scripts/framework-prototype/admission-only-bootstrap.sh','utf8'),worker=fs.readFileSync('scripts/framework-prototype/admission-only-worker.mjs','utf8');
 assert.equal((w.match(/MemoryMax=2147483648 -p MemorySwapMax=0 -p CPUQuota=100%/g)??[]).length,2);
 for(const text of [w,bootstrap,fs.readFileSync('scripts/framework-prototype/admission-only.mjs','utf8')])assert.match(text,/21474836480/);
 assert.match(w,/--max-old-space-size=512/);assert.match(worker,/360000/);assert.match(w,/\+ 600/);assert.match(w,/timeout-minutes: 25/);
 assert.match(w,/retention-days: 30/);assert.match(w,/git -C "\$repo" checkout --quiet --detach "\$SOURCE_SHA"/);
 assert.match(w,/RUN_WORKFLOW_SHA: \$\{\{ github\.workflow_sha \}\}/);assert.match(w,/\[\[ "\$RUN_WORKFLOW_SHA" == "\$GITHUB_SHA" \]\]/);assert.match(w,/RUN_WORKFLOW_REF: \$\{\{ github\.workflow_ref \}\}/);
 assert.match(w,/if \[\[ "\$CUSTODY_RESULT" != success/);assert.match(w,/creator.login==\$owner/);
 assert.doesNotMatch(w+bootstrap,/docker |buildx|npm (?:ci|install)|npx |--skip-db-update|--ignore-unfixed|--severity|curl --retry/);
 assert.match(bootstrap,/df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de/);assert.match(bootstrap,/e24b1c51293c1b15e4ba8d45bbc7891ba053f90278ec2698f3562c993e145fe7/);
});
for(const mutation of ['none','memory','swap','cpu','max','oom','oom_kill','oom_group_kill','missing-counter','disk'])test(`resource policy ${mutation} keeps exact bounded fail-closed limits`,()=>{
 const s={cgroup:{'memory.max':'2147483648','memory.swap.max':'0','cpu.max':'100000 100000','memory.events':'low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\noom_group_kill 0'},diskFreeBytes:'21474836480'};
 if(mutation==='memory')s.cgroup['memory.max']='max';if(mutation==='swap')s.cgroup['memory.swap.max']='1';if(mutation==='cpu')s.cgroup['cpu.max']='200000 100000';if(mutation==='disk')s.diskFreeBytes='21474836479';if(mutation==='missing-counter')s.cgroup['memory.events']='max 0';if(['max','oom','oom_kill','oom_group_kill'].includes(mutation))s.cgroup['memory.events']=s.cgroup['memory.events'].replace(`${mutation} 0`,`${mutation} 1`);
 if(mutation==='none')assert.doesNotThrow(()=>validateResourceObservation(s));else assert.throws(()=>validateResourceObservation(s));
});
for(const mutation of ['none','wrong-workflow','wrong-artifact','wrong-attempt','wrong-digest'])test(`diagnostic custody ${mutation} remains run-specific and independent`,()=>temporary(root=>{
 const bytes=Buffer.from('fictional zip; not evidence of any real DB result'),options={runId:'123',attempt:'1',requestSha:sourceSha,artifactId:'456',digest:hash(bytes),output:path.join(root,'retained'),acknowledge:true};let posts=0;
 const api=(endpoint,body)=>{
   if(body){assert.equal(fs.existsSync(path.join(options.output,'DOWNLOAD_RECEIPT.json')),true);assert.deepEqual(fs.readFileSync(path.join(options.output,'evidence.zip')),bytes);posts++;return Buffer.from(JSON.stringify({...body,creator:{login:'joserubiobejarano'}}));}
   if(endpoint==='user')return Buffer.from(JSON.stringify({login:'joserubiobejarano'}));
   if(endpoint.endsWith('/zip'))return mutation==='wrong-digest'?Buffer.from('corrupt'):bytes;
   if(endpoint.includes('/actions/artifacts/'))return Buffer.from(JSON.stringify({name:mutation==='wrong-artifact'?'wrong':'ornigami-db-admission-123-1',expired:false,workflow_run:{id:123,head_sha:sourceSha}}));
   return Buffer.from(JSON.stringify({path:mutation==='wrong-workflow'?'.github/workflows/ornigami-image-rehearsal.yml':workflowPath,run_attempt:mutation==='wrong-attempt'?2:1,head_sha:sourceSha,head_branch:branch,event:'push',repository:{full_name:'joserubiobejarano/Ornigami'}}));
 };
 if(mutation==='none'){assert.equal(retainAdmissionEvidence(options,api).sha256,options.digest);assert.equal(posts,1);}else{assert.throws(()=>retainAdmissionEvidence(options,api));assert.equal(posts,0);}
}));
