import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setImmediate as turn } from 'node:timers/promises';
import { reconstruct } from '../scripts/canary/audit-brand-canary.mts';
import { observeCanary, guardBackgroundFetch } from '../scripts/canary/observe-brand-canary.mjs';
import { BOUNDS, oldHashes, reserve } from '../scripts/canary/run-brand-canary.mjs';
import { importBrandDraft } from '../src/lib/campaign-lab/brand-import/import-brand.ts';
import { fixture, cleaned } from './support/brand-tls.mts';
import { createSyntheticBrandUrlReader } from '../src/lib/campaign-lab/brand-import/url-synthetic.ts';

test('new canary reservation is exclusive, durable, and cannot reset old markers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'brand-live-reserve-'));
 await writeFile(join(dir,'EXECUTION_RESERVED'),'old marker');await writeFile(join(dir,'ledger.json'),'old ledger');
 const before=await oldHashes(dir);assert.equal(before.EXECUTION_RESERVED,createHash('sha256').update('old marker').digest('hex'));
 await assert.rejects(()=>reserve(dir,{attempt:'new'}),{code:'EEXIST'});assert.deepEqual(await oldHashes(dir),before);
 const fresh=await mkdtemp(join(tmpdir(),'brand-live-new-'));await reserve(fresh,{testedSha:'frozen',bounds:BOUNDS});await assert.rejects(()=>reserve(fresh,{attempt:2}),{code:'EEXIST'});
 const saved=JSON.parse(await readFile(join(fresh,'EXECUTION_RESERVED'),'utf8'));assert.equal(saved.bounds.seed,'https://www.iana.org/');assert.equal(saved.bounds.getAttempts,12);assert.equal(saved.bounds.sourceMs,10000);
});
test('passive observer records real parser events without replacing reader or changing supplied bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'brand-live-observe-'));const stop=observeCanary(dir);
 const f=createSyntheticBrandUrlReader();const result=await importBrandDraft('https://brand-url.example/rose',f.read,{resourcePolicy:'html-css'});await turn();stop();
 assert.equal(result.ledger.logicalReads,2);assert.deepEqual(f.observation.requests,['/rose','/theme.png']);
 const events=(await readFile(join(dir,`events-${process.pid}.jsonl`),'utf8')).trim().split('\n').map(s=>JSON.parse(s));
 const requests=events.filter(e=>e.type==='source-request');assert.equal(requests.length,2);assert(requests.every(e=>e.method==='GET'));
 const bodies=events.filter(e=>e.type==='source-body');assert.equal(bodies.length,2);
 for(let i=0;i<bodies.length;i++){const bytes=await readFile(join(dir,bodies[i].file));assert.equal(bodies[i].sha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(bytes,Buffer.from(result.resources[i].body));}
 assert((await readdir(dir)).some(p=>p.endsWith('.bin')));
});
test('observer sees redirects as headers without consuming redirect bodies',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'brand-live-redirect-'));const stop=observeCanary(dir);const f=createSyntheticBrandUrlReader();
 const result=await importBrandDraft('https://brand-url.example/redirect',f.read,{resourcePolicy:'html-css'});await turn();stop();assert.equal(result.ledger.status,'rejected');
 const events=(await readFile(join(dir,`events-${process.pid}.jsonl`),'utf8')).trim().split('\n').map(s=>JSON.parse(s));assert.equal(events.filter(e=>e.type==='source-request').length,1);assert(!events.some(e=>e.type==='source-body'));
});
test('canary launcher refuses absent/unknown options without starting server or reserving work',()=>{
 for(const args of [[],['--execute'],['--start-once','extra']]){const r=spawnSync(process.execPath,['scripts/canary/run-brand-canary.mjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/Only --start-once/);}
});

test('offline ledger reconstruction enforces one import, exact seed, GET-only and conservative caps',()=>{
 const make=(bytes=100)=>[{type:'local-request',path:'/api/campaign-lab/brand-evidence',at:'2026-11-19T00:00:00Z',pid:1,monotonic:0},{type:'source-request',method:'GET',key:'1-0',url:'https://www.iana.org/',at:'2026-11-19T00:00:00Z',pid:1,monotonic:1},{type:'source-headers',key:'1-0',status:200,contentType:'text/html',at:'2026-11-19T00:00:00Z',pid:1,monotonic:2},{type:'source-body',key:'1-0',bytes,sha256:'a'.repeat(64),file:'body.bin',complete:true,at:'2026-11-19T00:00:00Z',pid:1,monotonic:3}];
 assert.equal(reconstruct(make()).chargedBytes,100);assert.equal(reconstruct(make()).apiTransactions,1);
 assert.throws(()=>reconstruct([...make(),make()[0]]));assert.throws(()=>reconstruct(make(524289)));
 const wrong=make();wrong[1].url='https://example.com/';assert.throws(()=>reconstruct(wrong));
 const badMethod=make();badMethod[1].method='POST';assert.throws(()=>reconstruct(badMethod));
});

test('background fetch guard blocks update probes without changing the protected Node reader',async()=>{
 let calls=0;const restore=guardBackgroundFetch(async()=>{calls++;return new Response('local');});
 try {await assert.rejects(()=>fetch('https://registry.npmjs.org/-/package/next/dist-tags'),/protected reader/);assert.equal(calls,0);assert.equal(await(await fetch('http://127.0.0.1:3031/')).text(),'local');assert.equal(calls,1);}
 finally {restore();}
});

test('observer preserves real isolated TLS and records certificate authorization and closure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'brand-live-tls-'));const stop=observeCanary(dir);
 const reply='HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello';const f=fixture([{reply}]);
 const response=await f.read('https://brand.example/',{maxBytes:1024,timeoutMs:4000});assert.equal(Buffer.from(response.body).toString(),'hello');await cleaned(f);stop();
 const events=(await readFile(join(dir,`events-${process.pid}.jsonl`),'utf8')).trim().split('\n').map(s=>JSON.parse(s));
 const tls=events.find(e=>e.type==='tls');assert.equal(tls.authorized,true);assert.equal(tls.servername,'brand.example');assert.match(tls.protocol,/TLSv1/);assert(events.some(e=>e.type==='connection-close'));
});
