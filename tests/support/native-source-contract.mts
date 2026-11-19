import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as net from 'node:net';
import type { ConnectionOptions } from 'node:tls';
import * as https from 'node:https';
import { spawnSync } from 'node:child_process';
import { setImmediate as turn } from 'node:timers/promises';
import windows from '../../scripts/support/source-window.cjs';
import native from '../../scripts/support/native-backend.cjs';
import seams from '../../scripts/support/native-fixtures.cjs';
import { createRehearsalReader } from '../../scripts/support/source-reader.mts';
import { isPublicAddress } from '../../src/lib/campaign-lab/brand-import/private-address.ts';
import { createBrandUrlHandler } from '../../src/lib/campaign-lab/brand-url-api.ts';
import bridge from '../../scripts/support/native-bridge.cjs';
import { validateSourcePlan, startSourceApplication } from '../../scripts/support/native-run-control.mjs';
import { fixture, cleaned } from './brand-tls.mts';
const checks: string[] = [], traces: unknown[] = [];
assert.equal(native.capturedForOfflineTests(),true,'Physical seams must precede native capture; refuse all source operations otherwise');
const sample = () => ({ dns: seams.stats.dns.length, tls: seams.stats.tls.length, tcp: seams.stats.tcp.length, wire: seams.stats.wire.length });
const setup = (clock?: { now():number; schedule(fn:()=>void, ms:number):()=>void }) => {
  const backend = native.createNativeBackend();
  const controller = windows.createSourceController({ backend, isPublicAddress, ...(clock ? { clock } : {}) });
  return { backend, controller, read: createRehearsalReader(controller) };
};
const options = { maxBytes: 4096, timeoutMs: 1000 };
const request = () => new Request('http://localhost/api/campaign-lab/brand-evidence', { method:'POST', headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({url:windows.POLICY.seed}) });
async function check(name:string, work:()=>Promise<void>) { seams.configure({}); await work(); checks.push(name); }
await check('native captures cannot execute without owned authority', async () => {
  const b = native.createNativeBackend(); const before = sample();
  await assert.rejects(b.resolve('www.iana.org',new AbortController().signal));
  assert.throws(()=>b.connectTls({host:'93.184.216.34',port:443})); assert.deepEqual(sample(),before);
});
await check('native resolver -> validated binding -> native TLS -> scoped TCP -> HTTP wire', async () => {
  const f=setup(); const before=sample();
  const result=await f.controller.transaction(()=>f.read(windows.POLICY.seed,options));
  assert.equal(result.contentType,'text/html');assert.equal(sample().dns-before.dns,2);assert.equal(sample().tls-before.tls,1);assert.equal(sample().tcp-before.tcp,1);assert.equal(sample().wire-before.wire,1);
  assert.deepEqual(f.backend.snapshot(),{resolve4:1,resolve6:1,tls:1});assert.equal(f.controller.snapshot().reason,'completed');
  traces.push({case:'positive native delegation, physical calls instrumented',controller:f.controller.snapshot(),delta:{dns:2,tls:1,tcp:1,wire:1}});
});
await check('full DNS answer set, native DNS failure and native TLS failure', async () => {
  for(const configuration of [{addresses:['93.184.216.34','10.0.0.1']},{dnsError:true},{tlsError:true}]) {
    seams.configure(configuration);const f=setup();const before=sample();await assert.rejects(f.controller.transaction(()=>f.read(windows.POLICY.seed,options)));
    assert.equal(sample().wire,before.wire);if(!('tlsError' in configuration))assert.equal(sample().tls,before.tls);
    traces.push({case:'native failure',configuration,state:f.controller.snapshot()});
  }
});
await check('wrong URL/method/TLS binding and background/child calls stop before captures', async () => {
  for(const url of ['http://www.iana.org/','https://outside.invalid/','https://u:p@www.iana.org/','https://www.iana.org:8443/','https://93.184.216.34/']) {
    const f=setup(),before=sample();await assert.rejects(f.controller.transaction(()=>f.read(url,options)));assert.deepEqual(sample(),before);
  }
  const f=setup();await f.controller.transaction(async()=>{
    const before=sample();assert.throws(()=>net.connect(443,'93.184.216.34'));assert.throws(()=>https.request('https://fonts.googleapis.com/'));assert.deepEqual(sample(),before);
    const p=spawnSync(process.execPath,['-e',"try{require('node:https').request('https://www.iana.org/');process.exit(2)}catch(e){process.exit(e.code==='ORNIGAMI_OFFLINE'?0:3)}"],{timeout:3000,env:{SystemRoot:process.env.SystemRoot,NODE_ENV:'test'}});assert.equal(p.status,0);
  });
  const g=setup();await g.controller.transaction(async()=>{
    await assert.rejects(g.controller.read(windows.POLICY.seed,options,async()=>{
      await g.controller.route('dns',{host:'www.iana.org'});const before=sample();
      assert.throws(()=>g.controller.route('https.request',{url:windows.POLICY.seed,method:'POST',injectedAgent:true}));
      g.controller.route('https.request',{url:windows.POLICY.seed,method:'GET',injectedAgent:true});
      assert.throws(()=>g.controller.route('tls.connect',{host:'8.8.8.8',family:4,port:443,servername:'www.iana.org',rejectUnauthorized:true,checkServerIdentity(){},ALPNProtocols:['http/1.1']}));assert.deepEqual(sample(),before);throw Error('fixture stop');
    }));
  });
});
await check('same-host redirects count admissions and stop at four; third party refused', async () => {
  seams.configure({redirect:'https://www.iana.org/again'});const f=setup(),before=sample();await assert.rejects(f.controller.transaction(()=>f.read(windows.POLICY.seed,{...options,maxRedirects:5})));
  assert.equal(f.controller.snapshot().gets,4);assert.equal(sample().wire-before.wire,4);assert.equal(f.controller.snapshot().open,false);
  seams.configure({redirect:'https://outside.invalid/'});const g=setup(),before2=sample();await assert.rejects(g.controller.transaction(()=>g.read(windows.POLICY.seed,options)));assert.equal(sample().wire-before2.wire,1);
  traces.push({case:'redirect cap',controller:f.controller.snapshot(),wireGets:4});
});
await check('exact 1 MiB budget and one-byte-over edge', async()=>{
  for(const extra of [0,1]) {
    seams.configure({body:'x'.repeat(1048576+extra)});const f=setup();const work=f.controller.transaction(()=>f.read(windows.POLICY.seed,{maxBytes:1048576,timeoutMs:1000}));
    if(extra)await assert.rejects(work);else assert.equal((await work).body.length,1048576);
    assert.equal(f.controller.snapshot().charged,1048576);assert.equal(f.controller.snapshot().reason,'budget');const before=sample();await assert.rejects(f.read(windows.POLICY.seed,options));assert.deepEqual(sample(),before);
  }
});
await check('cancellation/deadline cancel native DNS and close inherited continuations', async()=>{
  seams.configure({dnsHold:true});const f=setup();const abort=new AbortController();const work=f.controller.transaction(()=>f.read(windows.POLICY.seed,options),abort.signal);await turn();abort.abort();await assert.rejects(work);assert.equal(f.controller.snapshot().reason,'cancelled');
  let now=performance.now(),expire=()=>{};const g=setup({now:()=>now,schedule:fn=>{expire=fn;return()=>{};}});
  const deadline=g.controller.transaction(()=>g.read(windows.POLICY.seed,options));await turn();now+=10000;expire();await assert.rejects(deadline);assert.equal(g.controller.snapshot().reason,'deadline');
  await assert.rejects(g.controller.transaction(async()=>{}));
});
await check('real in-memory TLS engine rejects admitted fixture certificate for IANA identity', async()=>{
  const memory=fixture([{}],undefined,false,seams.inMemoryConnect);seams.setTlsEngine((options:ConnectionOptions)=>memory.connectTls(options));
  const f=setup();try {await assert.rejects(f.controller.transaction(()=>f.read(windows.POLICY.seed,{...options,timeoutMs:3000})));await cleaned(memory);
    assert.deepEqual(memory.attempts[0].sni,['www.iana.org']);assert(memory.attempts[0].clientErrors.includes('ERR_TLS_CERT_ALTNAME_INVALID'));assert.equal(memory.attempts[0].requests.length,0);
    traces.push({case:'real TLS over in-memory wire',sni:memory.attempts[0].sni,errors:memory.attempts[0].clientErrors,wireGets:0});
  } finally {seams.setTlsEngine(undefined);}
});
await check('missing/unapproved/wrong-source plans refuse before startup or reservation', async()=>{
  const sha='a'.repeat(40);for(const plan of [undefined,{kind:'unapproved',sourceSha:sha,seed:windows.POLICY.seed},{kind:'offline-native-simulation',sourceSha:sha,seed:'https://outside.invalid/'}])assert.throws(()=>validateSourcePlan(plan,sha));
  assert.throws(()=>validateSourcePlan({kind:'owner-approved-native',sourceSha:sha,seed:windows.POLICY.seed},sha));
  const before=sample();assert.throws(()=>startSourceApplication({plan:undefined}));assert.deepEqual(sample(),before);
});
await check('normal API factory receives installed bridge; production/off/live-env-only gates stay closed', async()=>{
  let calls=0;const blocked=createBrandUrlHandler({env:{NODE_ENV:'development',ORNIGAMI_BRAND_URL_MODE:'live',ORNIGAMI_BRAND_URL_LIVE:'true'},reader:()=>{calls++;throw Error();}});assert.equal((await blocked(request())).status,503);assert.equal(calls,0);
  const c=bridge.installNativeBridge({isPublicAddress,simulated:true,audit:(e:Record<string,unknown>)=>{traces.push({case:'bridge',...e});}});
  const handler=createBrandUrlHandler({env:{NODE_ENV:'development',ORNIGAMI_BRAND_URL_MODE:'synthetic'}});
  const before=sample();assert.equal((await handler(request())).status,400);assert.deepEqual(sample(),before);c.arm();
  const result=await handler(request());assert.equal(result.status,200,JSON.stringify(await result.clone().json()));const body=await result.json();assert.equal(body.mode,'synthetic');assert(body.draft.gaps.some((s:string)=>s.startsWith('SOURCE_NETWORK_SIMULATED')));assert.equal(c.snapshot().gets,2);assert.equal(c.snapshot().open,false);
  assert.equal((await handler(request())).status,400);
  for(const env of [{NODE_ENV:'production',ORNIGAMI_BRAND_URL_MODE:'synthetic'},{NODE_ENV:'development'}])assert([404,503].includes((await createBrandUrlHandler({env})(request())).status));
});
assert.equal(seams.stats.externalOSCalls,0);assert.equal(seams.stats.forbidden,0);
const evidence={checks,traces,nativeSeams:seams.stats,physicalExternalOSCalls:0};console.log(JSON.stringify(evidence,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));
