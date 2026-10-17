import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';
import{admitFrozenDatabase,requireFrozenDatabase,validateMetadata,parseTimestamp,metadataLimit}from'../scripts/framework-prototype/frozen-db-admission.mjs';import{skipDependentStages}from'../scripts/framework-prototype/serial-scan-driver.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),time=Date.parse('2026-10-17T12:00:00Z'),valid={Version:2,UpdatedAt:'2026-10-17T11:00:00Z',NextUpdate:'2026-10-17T13:00:00Z',DownloadedAt:'2026-10-17T11:55:00Z'};
test('canonical fixture follows the actual Trivy 0.76.0 pinned Go metadata declaration',()=>{
 const contract=JSON.parse(fs.readFileSync(new URL('../scripts/framework-prototype/trivy-metadata-contract.json',import.meta.url))),fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/trivy-db/metadata.json',import.meta.url))),declaration=fs.readFileSync(new URL('./fixtures/trivy-db/metadata-schema.go.txt',import.meta.url),'utf8');
 assert.equal(contract.trivyCommit,'531360e5d2a88e732373f1614ba99a38738538b8');assert.equal(contract.trivyDbCommit,'cbebf2ecd6df42d36463844a45e689afee51c70f');assert.equal(contract.schemaVersion,2);assert.deepEqual(Object.keys(fixture).sort(),Object.keys(contract.fields).sort());for(const key of Object.keys(fixture))assert.ok(declaration.includes(key+' '));assert.equal(validateMetadata(fixture,time).result,'passed');
});
async function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-db-admit-'));try{fs.mkdirSync(path.join(root,'cache/db'),{recursive:true});fs.writeFileSync(path.join(root,'cache/db/trivy.db'),'fictional database; not a downloaded DB');const scanner=path.join(root,'scanner');fs.writeFileSync(scanner,'fictional scanner; never executed');const args={cacheDirectory:path.join(root,'cache'),outputDirectory:path.join(root,'admission'),sourceSha:'a'.repeat(40),scannerPath:scanner,scannerSha256:sha(fs.readFileSync(scanner)),now:()=>time};return await fn(root,args);}finally{assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir())+path.sep+'ornigami-db-admit-'));fs.rmSync(root,{recursive:true,force:true});}}
for(const c of [
 {name:'missing',raw:null,code:'metadata-missing'},
 {name:'malformed',raw:'{"Version":',code:'metadata-malformed-json'},
 {name:'BOM is not Go JSON metadata',raw:Buffer.concat([Buffer.from([239,187,191]),Buffer.from(JSON.stringify(valid))]),code:'metadata-malformed-json'},
 {name:'invalid UTF8',raw:Buffer.from([0xff]),code:'metadata-invalid-utf8'},
 {name:'wrong schema',raw:{...valid,Version:3},code:'schema-version-unsupported'},
 {name:'missing timestamp',raw:{Version:2,NextUpdate:valid.NextUpdate},code:'UpdatedAt-missing'},
 {name:'invalid calendar',raw:{...valid,UpdatedAt:'2026-02-30T11:00:00Z'},code:'UpdatedAt-invalid'},
 {name:'future updated time',raw:{...valid,UpdatedAt:'2026-10-17T12:00:00.001Z'},code:'UpdatedAt-future'},
 {name:'expired even freshly downloaded',raw:{...valid,NextUpdate:'2026-10-17T11:59:59Z',DownloadedAt:'2026-10-17T11:59:59Z'},code:'NextUpdate-expired'},
 {name:'deadline equality',raw:{...valid,NextUpdate:'2026-10-17T12:00:00Z'},code:'NextUpdate-expired'},
 {name:'oversized',raw:' '.repeat(metadataLimit+1),code:'metadata-too-large-or-short-read'},
 {name:'valid',raw:valid}
])test(`bounded original bytes/clock/hash and explicit ${c.name} decision survive admission`,()=>fixture(async(root,args)=>{
 const raw=c.raw===null?null:Buffer.isBuffer(c.raw)?c.raw:Buffer.from(typeof c.raw==='string'?c.raw:JSON.stringify(c.raw));if(raw)fs.writeFileSync(path.join(args.cacheDirectory,'db/metadata.json'),raw);
 const result=await admitFrozenDatabase(args);assert.equal(result.result,c.code?'failed':'passed');assert.equal(result.clock.epochMs,time);assert.ok(result.databaseIdentity.sha256);assert.equal(result.scannerIdentity.sha256,args.scannerSha256);
 if(raw){assert.deepEqual(fs.readFileSync(path.join(args.outputDirectory,'metadata.original.bin')),raw.subarray(0,metadataLimit));assert.equal(result.metadataIdentity.retainedSha256,sha(raw.subarray(0,metadataLimit)));if(raw.length<=metadataLimit)assert.equal(result.metadataIdentity.sha256,sha(raw));else assert.equal(result.metadataIdentity.sha256,null);}
 assert.ok(fs.statSync(path.join(args.outputDirectory,'clock.json')).size>0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(args.outputDirectory,'index.json'))),result);if(c.code)assert.ok(result.errors.some(e=>e.code===c.code),JSON.stringify(result.errors));else assert.equal(result.parsedTimestamps.NextUpdate.epochMs,time+3600000);
}));
test('metadata bytes and clock are durably written before JSON decoding begins',()=>fixture(async(root,args)=>{
 const raw=JSON.stringify(valid);fs.writeFileSync(path.join(args.cacheDirectory,'db/metadata.json'),raw);const original=JSON.parse;let observed=false;
 JSON.parse=function(text,...rest){if(text===raw){observed=true;assert.equal(fs.readFileSync(path.join(args.outputDirectory,'metadata.original.bin'),'utf8'),raw);assert.ok(fs.statSync(path.join(args.outputDirectory,'clock.json')).size);assert.ok(fs.statSync(path.join(args.outputDirectory,'metadata-identity.json')).size);const pending=original(fs.readFileSync(path.join(args.outputDirectory,'index.json')));assert.equal(pending.result,'failed');assert.equal(pending.phase,'retained-before-parsing');}return original(text,...rest);};
 try{assert.equal((await admitFrozenDatabase(args)).result,'passed');assert.equal(observed,true);}finally{JSON.parse=original;}
}));
test('Go RFC3339Nano offsets are interpreted, impossible dates and weak date-only parsing rejected',()=>{
 assert.equal(parseTimestamp('2026-10-17T14:00:00.123456789+02:00').epochMs,time+123);for(const bad of ['2026-10-17','2026-02-29T00:00:00Z','2026-10-17T24:00:00Z',123])assert.equal(parseTimestamp(bad).result,'invalid');
 assert.equal(validateMetadata({...valid,UpdatedAt:'2026-10-17T12:00:00Z'},time).result,'passed');
 assert.equal(validateMetadata({...valid,DownloadedAt:undefined},time).result,'failed');const omitted={...valid};delete omitted.DownloadedAt;assert.equal(validateMetadata(omitted,time).result,'passed');
 assert.equal(validateMetadata({...valid,DownloadedAt:null},time).result,'passed');assert.equal(validateMetadata({...valid,DownloadedAt:'0001-01-01T00:00:00Z'},time).result,'passed');
});
for(const change of ['metadata','database','scanner','receipt','expiry','backward'])test(`single shared admission refuses ${change} drift without re-admission`,()=>fixture(async(root,args)=>{
 fs.writeFileSync(path.join(args.cacheDirectory,'db/metadata.json'),JSON.stringify(valid));assert.equal((await admitFrozenDatabase(args)).result,'passed');const receipt=path.join(args.outputDirectory,'index.json'),proof={...args,admissionDirectory:args.outputDirectory,admissionSha256:sha(fs.readFileSync(receipt))};assert.equal((await requireFrozenDatabase(proof)).result,'passed');
 if(change==='metadata')fs.appendFileSync(path.join(args.cacheDirectory,'db/metadata.json'),' ');if(change==='database')fs.appendFileSync(path.join(args.cacheDirectory,'db/trivy.db'),'drift');if(change==='scanner')fs.appendFileSync(args.scannerPath,'drift');if(change==='receipt')fs.appendFileSync(receipt,' ');if(change==='expiry')proof.now=()=>time+3600000;if(change==='backward')proof.now=()=>time-1;
 await assert.rejects(requireFrozenDatabase(proof),/identity|drift|expired|backward/i);
}));
test('failed shared prerequisite skips all nine roles before invoking any external tool',()=>fixture(async(root,args)=>{
 const evidence=path.join(root,'evidence');fs.mkdirSync(evidence);const result=spawnSync(process.execPath,['scripts/framework-prototype/serial-scan-driver.mjs','parents'],{cwd:process.cwd(),env:{...process.env,RUNNER_TEMP:root,ORNIGAMI_EVIDENCE_DIR:evidence,SOURCE_SHA:args.sourceSha,PATH:''},encoding:'utf8'});assert.equal(result.status,1);const index=JSON.parse(fs.readFileSync(path.join(evidence,'stage-scans/index.json')));assert.equal(index.stages.length,9);assert.ok(index.stages.every(s=>s.result==='skipped'&&s.collectionComplete===false));assert.equal(index.result,'failed');
 const raw=fs.readFileSync(path.join(evidence,'stage-scans/original-base/driver.json'));skipDependentStages(path.join(evidence,'stage-scans'),args.sourceSha,'another failure');assert.deepEqual(fs.readFileSync(path.join(evidence,'stage-scans/original-base/driver.json')),raw);
}));
test('invalid clock, scanner mismatch and empty DB still retain independent diagnostics',()=>fixture(async(root,args)=>{fs.writeFileSync(path.join(args.cacheDirectory,'db/metadata.json'),JSON.stringify(valid));fs.writeFileSync(path.join(args.cacheDirectory,'db/trivy.db'),'');const r=await admitFrozenDatabase({...args,scannerSha256:'0'.repeat(64),now:()=>NaN});for(const code of ['clock-invalid','scanner-checksum-mismatch','database-empty'])assert.ok(r.errors.some(e=>e.code===code));assert.equal(r.result,'failed');}));
test('actual admit CLI failure retains raw evidence and immediately marks all dependent roles skipped',()=>fixture(async(root,args)=>{
 fs.cpSync(args.cacheDirectory,path.join(root,'trivy-cache'),{recursive:true});fs.writeFileSync(path.join(root,'trivy-cache/db/metadata.json'),'{');fs.copyFileSync(args.scannerPath,path.join(root,'trivy'));const evidence=path.join(root,'evidence');fs.mkdirSync(evidence);
 const r=spawnSync(process.execPath,['scripts/framework-prototype/serial-scan-driver.mjs','admit'],{cwd:process.cwd(),env:{...process.env,RUNNER_TEMP:root,ORNIGAMI_EVIDENCE_DIR:evidence,SOURCE_SHA:args.sourceSha,PATH:''},encoding:'utf8'});assert.equal(r.status,1);
 const base=path.join(evidence,'stage-scans'),proof=JSON.parse(fs.readFileSync(path.join(base,'database-admission/index.json')));assert.ok(proof.errors.some(e=>e.code==='metadata-malformed-json'));assert.equal(fs.readFileSync(path.join(base,'database-admission/metadata.original.bin'),'utf8'),'{');assert.equal(JSON.parse(fs.readFileSync(path.join(base,'index.json'))).stages.filter(s=>s.result==='skipped').length,9);
}));
