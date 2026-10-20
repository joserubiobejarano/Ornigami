import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadToolchainRecipe,downloadPinnedFile} from '../scripts/framework-prototype/toolchain-contract.mjs';
import {contractDigest,writeFrontendImage,sha256} from '../scripts/framework-prototype/tool-image.mjs';
import {loadToolchainOutput} from '../scripts/framework-prototype/toolchain-runtime.mjs';
import {compilerSdkData} from '../scripts/framework-prototype/analyze-docker-archive.mjs';
import {compatibilityDockerfile} from '../scripts/framework-prototype/toolchain-probe.mjs';
import {requiredStages} from '../scripts/framework-prototype/scan-image-stages.mjs';

const recipeDirectory=fileURLToPath(new URL('../deploy/coolify/toolchain/',import.meta.url));
const save=(file,x)=>fs.writeFileSync(file,JSON.stringify(x));
function sandbox(callback){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-tool-contract-'));try{return callback(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function fixture(root){
  const recipeDir=path.join(root,'recipe');fs.cpSync(recipeDirectory,recipeDir,{recursive:true});
  const recipe=loadToolchainRecipe(recipeDir),sourceSha='a'.repeat(40),runId='123',attempt='1';
  const evidence=path.join(root,'evidence');fs.mkdirSync(path.join(evidence,'toolchain'),{recursive:true});
  const owned=fs.mkdtempSync(path.join(root,'ornigami-toolchain-123-1-'));fs.chmodSync(owned,0o700);
  const binary=Buffer.alloc(64);binary.write('7f454c46',0,'hex');binary[4]=2;binary[5]=1;binary[6]=1;binary.writeUInt16LE(62,18);
  // Synthetic ELF tests controller identity/serialization, not native closure or Linux execution.
  const frontend=writeFrontendImage(binary,recipe.contract,path.join(owned,'frontend'),'ornigami-tool-frontend:'+sourceSha);
  recipe.expectedFrontend=Object.fromEntries(['binarySha256','configDigest','manifestDigest','layerDigest'].map(k=>[k,frontend[k]]));
  recipe.trialScope='tooling'; // Preserve the historical tooling-only gate CLI behavior at the fixture boundary; the real candidate recipe selects full scope.
  save(path.join(recipeDir,'recipe.json'),recipe);
  const imageId='sha256:'+'b'.repeat(64);
  const state={root:owned,sourceSha,runId,attempt,contractSha256:recipe.buildContractSha256,result:'constructed-not-security-accepted',containers:['prepare','compile','runtime'].map(role=>({role,running:false,stopVerified:true})),binaries:recipe.contract.binaries.map(b=>({name:b.name,sha256:'c'.repeat(64),bytes:64}))};
  const output={schema:1,root:owned,sourceSha,runId,attempt,contractSha256:recipe.buildContractSha256,securityAcceptance:false,coverageHold:true,buildkit:{reference:'ornigami-tool-buildkit:'+sourceSha,imageId,ownedImage:true},frontend:{reference:'ornigami-tool-frontend:'+sourceSha,imageId:frontend.configDigest,ownedImage:true,ociDirectory:path.join(owned,'frontend/oci'),manifestDigest:frontend.manifestDigest,binarySha256:frontend.binarySha256},supplemental:['toolchain-go-base','toolchain-compiler','toolchain-runtime-base','toolchain-runtime-base-installed'].map(stage=>({stage,result:'passed',scanResult:{result:'passed',counts:{HIGH:0,CRITICAL:0}}}))};
  state.images=[output.buildkit,output.frontend];state.binaries.find(x=>x.name==='dockerfile-frontend').sha256=frontend.binarySha256;
  save(path.join(evidence,'toolchain/state.json'),state);save(path.join(evidence,'toolchain/output.json'),output);
  return {recipeDir,recipe,state,output,evidence,owned,options:{temp:root,evidence,sourceSha,runId,attempt,recipeDirectory:recipeDir}};
}
test('reviewed actual recipe pins full combined scope, eight binaries and compiler/runtime roles',()=>{
  const recipe=loadToolchainRecipe(recipeDirectory);assert.equal(recipe.trialScope,'full');assert.equal(recipe.contract.binaries.length,8);assert.equal(recipe.contract.compiler.memoryBytes,8589934592);assert.equal(recipe.apk.packages.length,75);
  const expat=recipe.apk.packages.find(p=>p.name==='libexpat');assert.equal(expat.version,'2.9.0-r0');assert.equal(expat.bytes,62181);assert.equal(expat.sha256,'42a1cb48e3ef0b5d1744f2b341120369d0c045038cdb6c9d5a6dd5ba7d421910');assert.equal(expat.indexChecksum,'Q1RiVCXcS1QhgNt9xnZpcYRTnjglY=');assert.deepEqual(expat.dependencies,['so:libc.musl-x86_64.so.1']);assert.deepEqual(expat.provides,['so:libexpat.so.1=1.13.0']);assert.ok(recipe.apk.runtimeClosure.includes('libexpat'));assert.deepEqual(recipe.apk.packages.filter(p=>p.dependencies.includes('so:libexpat.so.1')).map(p=>p.name),['git']);assert.ok(recipe.apk.packages.find(p=>p.name==='musl').provides.some(p=>p.startsWith('so:libc.musl-x86_64.so.1=')));
});
test('contract rejects tampered module bytes even when outer recipe is untouched',()=>sandbox(root=>{
  const f=fixture(root);fs.appendFileSync(path.join(f.recipeDir,'locks/buildkit.go.mod'),'\n// drift\n');assert.throws(()=>loadToolchainRecipe(f.recipeDir),/lock identity/);
}));
test('contract rejects a source/package substitution despite recomputed contract hash',()=>sandbox(root=>{
  const f=fixture(root);f.recipe.contract.binaries[0].package='./cmd/buildctl';f.recipe.buildContractSha256=contractDigest(f.recipe.contract);save(path.join(f.recipeDir,'recipe.json'),f.recipe);assert.throws(()=>loadToolchainRecipe(f.recipeDir),/source\/package/);
}));
test('output binds stopped compiler, complete bootstrap scans, source and OCI content',()=>sandbox(root=>{
  const f=fixture(root),loaded=loadToolchainOutput(f.options);assert.equal(loaded.frontendBuildArguments.length,2);assert.match(loaded.frontendBuildArguments[1],/^ornigami-frontend=oci-layout:\/\//);
  f.state.containers[1].running=true;save(path.join(f.evidence,'toolchain/state.json'),f.state);assert.throws(()=>loadToolchainOutput(f.options),/compiler stop/);
  f.state.containers[1].running=false;save(path.join(f.evidence,'toolchain/state.json'),f.state);
  f.state.pendingImage={operation:'commit'};save(path.join(f.evidence,'toolchain/state.json'),f.state);assert.throws(()=>loadToolchainOutput(f.options),/Incomplete construction/);delete f.state.pendingImage;save(path.join(f.evidence,'toolchain/state.json'),f.state);
  f.output.supplemental[0].scanResult.counts.HIGH=1;save(path.join(f.evidence,'toolchain/output.json'),f.output);assert.throws(()=>loadToolchainOutput(f.options),/bootstrap/);
  f.output.supplemental[0].scanResult.counts.HIGH=0;save(path.join(f.evidence,'toolchain/output.json'),f.output);
  assert.throws(()=>loadToolchainOutput({...f.options,sourceSha:'d'.repeat(40)}),/binding/);
  const blob=path.join(f.owned,'frontend/oci/blobs/sha256',f.output.frontend.manifestDigest.slice(7));fs.appendFileSync(blob,' ');assert.throws(()=>loadToolchainOutput(f.options),/content drift/);
}));
test('output rejects malformed source/run before loading evidence',()=>{
  assert.throws(()=>loadToolchainOutput({sourceSha:undefined,runId:undefined,attempt:undefined}),/source\/run/);
});
test('tooling gate CLI writes tooling prerequisites and skips dependent stages without accepting aggregate',()=>sandbox(root=>{
  const f=fixture(root),repo=path.join(root,'repo'),scripts=path.join(repo,'scripts/framework-prototype'),toolchain=path.join(repo,'deploy/coolify/toolchain');
  fs.mkdirSync(path.dirname(scripts),{recursive:true});fs.cpSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../scripts/framework-prototype'),scripts,{recursive:true});
  fs.mkdirSync(path.dirname(toolchain),{recursive:true});fs.cpSync(f.recipeDir,toolchain,{recursive:true});
  const scans=path.join(f.evidence,'stage-scans');
  const parentStages=['original-base','original-runtime-base','buildkit','dockerfile-frontend'];
  const records=parentStages.map(stage=>({stage,result:'passed',collectionComplete:true,scanResult:{result:'passed'}}));
  for(const record of records){const dir=path.join(scans,record.stage);fs.mkdirSync(dir,{recursive:true});save(path.join(dir,'driver.json'),record);}
  save(path.join(scans,'index.json'),{schema:1,sourceSha:f.options.sourceSha,result:'passed',stages:records});
  const env={...process.env,RUNNER_TEMP:root,ORNIGAMI_EVIDENCE_DIR:f.evidence,SOURCE_SHA:f.options.sourceSha,GITHUB_RUN_ID:f.options.runId,GITHUB_RUN_ATTEMPT:f.options.attempt};
  const cli=path.join(scripts,'toolchain-runtime.mjs');
  const result=spawnSync(process.execPath,[cli,'gate'],{encoding:'utf8',env,timeout:15000,windowsHide:true});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.equal(result.signal,null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.evidence,'toolchain/prerequisites.json'))),{
    sourceSha:f.options.sourceSha,runId:f.options.runId,attempt:f.options.attempt,contractSha256:f.recipe.buildContractSha256,
    result:'passed tooling prerequisites only',securityAcceptance:false,coverageHold:true,scope:'tooling'
  });
  const skipped=['build-base','deps','builder','prod-deps','runner'];
  for(const stage of skipped){
    const record=JSON.parse(fs.readFileSync(path.join(scans,stage,'driver.json')));
    assert.equal(record.result,'skipped');
    assert.match(record.reason,/tooling-only preflight/);
  }
  const index=JSON.parse(fs.readFileSync(path.join(scans,'index.json')));
  assert.equal(index.result,'failed');
  assert.deepEqual(index.expectedStages,requiredStages);
  assert.deepEqual(index.stages.filter(x=>x.result==='skipped').map(x=>x.stage).sort(),skipped.sort());
  assert.deepEqual(index.stages.filter(x=>x.result==='passed').map(x=>x.stage).sort(),parentStages.sort());
  fs.rmSync(path.join(f.evidence,'toolchain/prerequisites.json'));
  save(path.join(scans,'index.json'),{...index,stages:index.stages.filter(x=>x.stage!=='original-runtime-base')});
  const missingParent=spawnSync(process.execPath,[cli,'gate'],{encoding:'utf8',env,timeout:15000,windowsHide:true});
  assert.equal(missingParent.status,1,`${missingParent.stdout}\n${missingParent.stderr}`);
  assert.match(missingParent.stderr,/parent scan\/native\/resource gates/);
  assert.equal(fs.existsSync(path.join(f.evidence,'toolchain/prerequisites.json')),false);
}));
test('SDK data classification is restricted to supplemental compiler roles',()=>{
  const sample='usr/local/go/src/debug/elf/testdata/foreign';assert.equal(compilerSdkData('toolchain-go-base',sample),true);assert.equal(compilerSdkData('toolchain-compiler','usr/local/go/src/runtime/race_linux_arm64.syso'),true);
  for(const stage of ['runner','builder','buildkit','dockerfile-frontend','toolchain-runtime-base'])assert.equal(compilerSdkData(stage,sample),false);
  assert.equal(compilerSdkData('toolchain-compiler','usr/local/go/pkg/tool/linux_amd64/compile'),false);
});
test('compatibility probe exercises external frontend and a network-free native RUN',()=>{
  const content=compatibilityDockerfile('sha256:'+'e'.repeat(64));assert.match(content,/^# syntax=ornigami-frontend\n/);assert.match(content,/RUN --network=none/);assert.match(content,/uname -m/);assert.match(content,/FROM scratch\nCOPY --from=probe/);assert.throws(()=>compatibilityDockerfile('alpine:latest'),/Pinned/);
});
test('bounded input download refuses content drift and existing destination',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-tool-download-'));try{
    const bytes=Buffer.from('official pinned bytes'),input={url:'https://example.invalid/pinned',bytes:bytes.length,sha256:sha256(bytes)};
    const fetcher=async()=>new Response(bytes);
    await downloadPinnedFile(input,path.join(root,'good'),{fetcher});assert.deepEqual(fs.readFileSync(path.join(root,'good')),bytes);
    await assert.rejects(downloadPinnedFile(input,path.join(root,'good'),{fetcher}),/EEXIST/);
    await assert.rejects(downloadPinnedFile({...input,sha256:'0'.repeat(64)},path.join(root,'bad'),{fetcher}),/digest mismatch/);
    await assert.rejects(downloadPinnedFile({...input,bytes:1},path.join(root,'oversized'),{fetcher}),/byte bound/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
