import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate as turn } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import { importBrandDraft, BRAND_TEXT_IMPORT_LIMITS } from "../src/lib/campaign-lab/brand-import/import-brand.ts";
import { createSyntheticBrandUrlReader } from "../src/lib/campaign-lab/brand-import/url-synthetic.ts";
import { ResourceReadError } from "../src/lib/campaign-lab/brand-import/public-resource-fetch.ts";
import { createBrandUrlHandler, brandUrlMode } from "../src/lib/campaign-lab/brand-url-api.ts";
import { BrandEvidenceSelection } from "../src/lib/campaign-lab/brand-url-client.ts";
import { parseBrandEvidence, BRAND_FILE_BYTES } from "../src/lib/campaign-lab/brand-review.ts";
import { offlineFixture, response, sequencedClock } from "./fixtures/brand-import/offline.ts";
const base="https://brand-url.example";
const env={NODE_ENV:"development",ORNIGAMI_BRAND_URL_MODE:"synthetic"};
function request(body:unknown={url:base+"/rose",requestId:"test"},headers:Record<string,string>={},signal?:AbortSignal) {
 return new Request("http://localhost:3029/api/campaign-lab/brand-evidence",{method:"POST",headers:{origin:"http://localhost:3029","content-type":"application/json",...headers},body:JSON.stringify(body),signal});
}
async function sample(path="/rose") {const f=createSyntheticBrandUrlReader();return {f,...await importBrandDraft(base+path,f.read,{resourcePolicy:"html-css"})};}
test("text-only protected pipeline skips every media/font/script reference and preserves healthy caveats",async()=>{
 const r=await sample();assert.equal(r.ledger.status,"complete");assert.deepEqual(r.f.observation.requests,["/rose","/theme.png"]);assert.equal(r.ledger.maxHttpAttempts,12);assert.deepEqual(r.ledger.limits,BRAND_TEXT_IMPORT_LIMITS);
 assert(r.resources.every(r=>r.kind==="html"||r.kind==="css"));assert(!r.draft!.candidates.some(c=>c.method==="raster-sample"));assert(r.draft!.candidates.some(c=>c.observed==="#6b2340ff"));assert(r.draft!.candidates.some(c=>c.observed.includes("font.woff2")));assert(r.draft!.gaps.some(g=>g.includes("not fetched")));parseBrandEvidence(JSON.stringify(r.draft));assert(Object.values(r.draft!.approvals).every(v=>v===false));
 await turn();assert.equal(r.f.observation.closed,r.f.observation.connections);
});
test("misleading extensions and MIME never invoke native raster decoding (with a positive trap control)",()=>{
 const child=spawnSync(process.execPath,["--experimental-strip-types","--experimental-test-module-mocks","--input-type=module","-e",`
 import { mock } from 'node:test';import assert from 'node:assert/strict';let calls=0;
 mock.module(new URL('./src/lib/campaign-lab/brand-import/raster-evidence.ts',import.meta.url).href,{namedExports:{collectRasterEvidence:async()=>{calls++;return {outcome:'unsupported',issues:['trap'],samples:[]};}}});
 const {importBrandDraft}=await import('./src/lib/campaign-lab/brand-import/import-brand.ts');const {createSyntheticBrandUrlReader}=await import('./src/lib/campaign-lab/brand-import/url-synthetic.ts');
 const f=createSyntheticBrandUrlReader();const r=await importBrandDraft('${base}/misleading',f.read,{resourcePolicy:'html-css'});assert.equal(calls,0);assert.equal(r.ledger.status,'partial');assert.deepEqual(f.observation.requests,['/misleading','/raster.css']);
 const {collectBrandKitDraft}=await import('./src/lib/campaign-lab/brand-import/brand-evidence.ts');await collectBrandKitDraft([{kind:'raster',requestedUrl:'${base}/x',finalUrl:'${base}/x',status:200,contentType:'image/png',body:new Uint8Array([1])}]);assert.equal(calls,1);
 `],{encoding:"utf8"});assert.equal(child.status,0,child.stderr);
});
test("partial CSS, missing/unsupported/JS-only seeds and forbidden redirects remain accurate",async()=>{
 const partial=await sample("/partial");assert.equal(partial.ledger.status,"partial");assert.equal(partial.ledger.entries.at(-1)!.error,"BLOCKED_DESTINATION");assert(partial.draft!.candidates.some(c=>c.category==="ui-color"));assert(!partial.f.observation.requests.includes("/no.css"));
 for(const [path,status] of [["/missing","rejected"],["/unsupported","rejected"],["/js-only","incomplete"],["/redirect","rejected"]]){const r=await sample(path);assert.equal(r.ledger.status,status);assert.equal(r.f.observation.connections,1);assert(!r.draft?.candidates.some(c=>c.category==="ui-color"));}
});
test("text policy preserves shared resource/byte/deadline limits and cancellation cleanup",async()=>{
 const html=Array.from({length:10},(_,i)=>`<link rel="stylesheet" href="/${i}">`).join("");
 const f=offlineFixture([response(html),...Array.from({length:10},()=>response("x{color:#123456}","text/css"))]);const r=await importBrandDraft(base,f.read,{resourcePolicy:"html-css"});assert.equal(r.ledger.logicalReads,4);assert.equal(f.sockets.length,4);assert(r.ledger.issues.includes("RESOURCE_LIMIT"));
 const limited=offlineFixture([response(html),response("x".repeat(100),"text/css")]);const b=await importBrandDraft(base,limited.read,{resourcePolicy:"html-css",limits:{totalBytes:Buffer.byteLength(html)+10}});assert.equal(limited.sockets.length,2);assert.equal(b.ledger.chargedBytes,Buffer.byteLength(html)+10);
 const time=sequencedClock();const timed=offlineFixture([response(html),response("x{color:#123456}","text/css")],{clock:time.clock,onWrite:(_s,i)=>{if(i===1)time.advance(10001);}});const d=await importBrandDraft(base,timed.read,{resourcePolicy:"html-css",clock:time.clock});assert.equal(d.ledger.status,"cancelled");assert.equal(timed.sockets.length,2);assert.equal(time.timers.size,0);
 const c=new AbortController();const slow=createSyntheticBrandUrlReader();const p=importBrandDraft(base+"/slow",slow.read,{resourcePolicy:"html-css",signal:c.signal});await turn();c.abort();assert.equal((await p).ledger.status,"cancelled");await turn();assert.equal(slow.observation.connections,slow.observation.closed);assert(!slow.observation.requests.includes("/theme.png"));
 await assert.rejects(()=>importBrandDraft(base,f.read,{resourcePolicy:"html-css",limits:{resources:5}}),/Invalid trusted/);
});
test("API default/unavailable/production gates reject before reader construction or body work",async()=>{
 let calls=0;for(const config of [{NODE_ENV:"production",ORNIGAMI_BRAND_URL_MODE:"synthetic"},{NODE_ENV:"test",ORNIGAMI_BRAND_URL_MODE:"live",ORNIGAMI_BRAND_URL_LIVE:"true"},{NODE_ENV:"development"},{...env,ORNIGAMI_BRAND_URL_MODE:"live"}]){const h=createBrandUrlHandler({env:config,reader:()=>{calls++;throw Error();}});const r=await h(request());assert([404,503].includes(r.status));}assert.equal(calls,0);assert.equal(brandUrlMode({...env,ORNIGAMI_BRAND_URL_MODE:"live",ORNIGAMI_BRAND_URL_LIVE:"true"}),"live");
});
test("API validates same-origin JSON, actual body bytes, strict fields and URL before protected reads",async()=>{
 let calls=0;const h=createBrandUrlHandler({env,reader:()=>{calls++;return createSyntheticBrandUrlReader().read;}});
 for(const [headers,status] of [[{origin:"https://evil.example"},403],[{"sec-fetch-site":"cross-site"},403],[{"content-type":"text/plain"},415]] as const)assert.equal((await h(request({},headers))).status,status);
 for(const body of [{url:"file:///x"},{url:"https://user:pass@brand-url.example/"},{url:base+":8080"},{url:"x".repeat(2049)},{url:base,transport:{}},{url:base,limits:{}},{url:base,html:"x"},{url:base,requestId:"x".repeat(81)}])assert.equal((await h(request(body))).status,400);
 assert.equal((await h(request({url:base,extra:"é".repeat(3000)},{"content-length":"2"}))).status,413);assert.equal(calls,0);
 assert.equal((await h(request({url:base+"/rose"},{host:"127.0.0.1:3029",origin:"http://127.0.0.1:3029"}))).status,200);calls=0;
 const good=await h(request());assert.equal(good.status,200);const result=await good.json();assert.equal(result.mode,"synthetic");assert.equal(result.requestId,"test");parseBrandEvidence(JSON.stringify(result.draft));assert.equal(calls,1);
 const part=await h(request({url:base+"/partial"}));assert.equal(part.status,200);assert((await part.json()).draft.gaps.some((v:string)=>v.includes("BLOCKED_DESTINATION")));
});
test("API caps active work, aborts on disconnect, times out a stalled body and releases slots",async()=>{
 const controllers=[new AbortController(),new AbortController()];const h=createBrandUrlHandler({env,reader:()=>async(_url,o)=>new Promise((_resolve,reject)=>o.signal!.addEventListener("abort",()=>reject(new ResourceReadError("CANCELLED")),{once:true}))});
 const pending=controllers.map(c=>h(request(undefined,{},c.signal)));await turn();assert.equal((await h(request())).status,429);controllers.forEach(c=>c.abort());for(const p of pending)assert.equal((await p).status,408);
 const stalled=createBrandUrlHandler({env,bodyMs:15});const stream=new ReadableStream<Uint8Array>({start(){}});const r=new Request("http://localhost:3029/api/campaign-lab/brand-evidence",{method:"POST",headers:{origin:"http://localhost:3029","content-type":"application/json"},body:stream,duplex:"half"} as RequestInit);assert.equal((await stalled(r)).status,408);assert.equal((await stalled(request())).status,200);
});
test("file/URL selections share authority; stale successes/errors cannot replace current evidence",async()=>{
 const d=(await sample()).draft!;const text=JSON.stringify(d);const session=new BrandEvidenceSelection();
 let finish!: (r:Response)=>void;let signal:AbortSignal|undefined;
 const delayed:typeof fetch=async(_url,init)=>{signal=init?.signal as AbortSignal;return new Promise(r=>{finish=r;});};
 const old=session.url(base+"/slow",delayed);const file=await session.file({size:text.length,text:async()=>text});assert(!file.stale&&file.draft);assert(signal!.aborted);finish(Response.json({message:"old error"},{status:400}));assert.deepEqual(await old,{stale:true});
 let finishFile!: (s:string)=>void;const oldFile=session.file({size:1,text:()=>new Promise(r=>{finishFile=r;})});const fetcher:typeof fetch=async(_url,init)=>Response.json({ok:true,draft:d,requestId:JSON.parse(init!.body as string).requestId,mode:"synthetic",summary:{status:"complete",logicalReads:2,chargedBytes:1000,retainedBytes:1000}});
 const current=await session.url(base+"/rose",fetcher);assert(!current.stale&&current.draft);finishFile("{");assert.deepEqual(await oldFile,{stale:true});
 for(let i=0;i<2;i++){const retry=await session.url(base+"/rose",fetcher);assert(!retry.stale&&retry.draft);}
 const oldSuccess=session.url(base,delayed);await session.file({size:text.length,text:async()=>text});finish(Response.json({ok:true,draft:d,requestId:"stale",mode:"synthetic",summary:{status:"complete",logicalReads:2,chargedBytes:1000,retainedBytes:1000}}));assert.deepEqual(await oldSuccess,{stale:true});
 const lateFile=session.file({size:1,text:()=>new Promise(r=>{finishFile=r;})});await session.url(base+"/rose",fetcher);finishFile(text);assert.deepEqual(await lateFile,{stale:true});
 const cancel=session.url(base,delayed);session.cancel();finish(Response.json({message:"late"},{status:400}));assert.deepEqual(await cancel,{stale:true});
});
test("response byte/schema validation cannot bypass saved-file limits",async()=>{
 const session=new BrandEvidenceSelection();for(const response of [new Response("x".repeat(BRAND_FILE_BYTES+8193),{headers:{"content-type":"application/json"}}),Response.json({ok:true,draft:{schemaVersion:"unknown"}})]){const r=await session.url(base,async()=>response);assert(!r.stale&&r.error);}
});

test("API rejects expanded evidence beyond the saved-file contract rather than truncating silently",async()=>{
 const html=Array.from({length:180},(_,i)=>`<link rel="icon" href="https://brand-url.example/${i}-${"x".repeat(1900)}">`).join("");
 assert(Buffer.byteLength(html)<512*1024);
 const f=offlineFixture([response(html)]);const h=createBrandUrlHandler({env,reader:()=>f.read});
 const result=await h(request());assert.equal(result.status,413);assert.equal(f.sockets.length,1);
});
