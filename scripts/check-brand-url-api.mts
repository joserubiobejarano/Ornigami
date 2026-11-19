/** Built/dev-server checks. Only loopback app requests; target evidence stays synthetic. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const [raw,mode,out]=process.argv.slice(2);
const base=new URL(raw);
assert(["127.0.0.1","localhost","[::1]"].includes(base.hostname) && base.protocol==="http:","Only a local app server is permitted");
assert(["synthetic","off","production"].includes(mode));
const records:unknown[]=[];
async function post(label:string,body:unknown,expected:number,headers:Record<string,string>={}) {
 const r=await fetch(new URL('/api/campaign-lab/brand-evidence',base),{method:'POST',headers:{origin:base.origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,expected,`${label}: ${JSON.stringify(data).slice(0,150)}`);
 records.push({label,status:r.status,summary:data.summary ?? null,mode:data.mode ?? null});return data;
}
if(mode!=="synthetic") {
 const code=mode==="production"?404:503;
 await post('disabled-before-source-work',{url:'https://brand-url.example/slow'},code);
 await post('disabled-before-body-validation',{url:'https://brand-url.example/rose',transport:'forbidden'},code);
} else {
 const good=await post('healthy',{url:'https://brand-url.example/rose',requestId:'built-check'},200);assert.equal(good.mode,'synthetic');assert.equal(good.summary.logicalReads,2);assert(!good.draft.candidates.some((c:{method:string})=>c.method==='raster-sample'));
 const partial=await post('partial-css-cdn',{url:'https://brand-url.example/partial'},200);assert.equal(partial.summary.status,'partial');
 for(const [path,status] of [['js-only','incomplete'],['missing','rejected'],['unsupported','rejected'],['misleading','partial']]){const d=await post(path,{url:`https://brand-url.example/${path}`},200);assert.equal(d.summary.status,status);}
 await post('private-redirect',{url:'https://brand-url.example/redirect'},422);
 await post('invalid-url',{url:'file:///etc/passwd'},400);
 await post('client-transport',{url:'https://brand-url.example/rose',transport:{}},400);
 await post('oversized-utf8',{url:'https://brand-url.example/rose',extra:'é'.repeat(3000)},413);
 await post('foreign-origin',{url:'https://brand-url.example/rose'},403,{origin:'https://foreign.example'});
 const statuses=await Promise.all([0,1,2].map(async()=>{const r=await fetch(new URL('/api/campaign-lab/brand-evidence',base),{method:'POST',headers:{origin:base.origin,'content-type':'application/json'},body:JSON.stringify({url:'https://brand-url.example/slow'})});await r.arrayBuffer();return r.status;}));
 assert.deepEqual(statuses.sort(),[200,200,429]);records.push({label:'active-cap',statuses});
}
const report={mode,server:base.origin,externalRequests:0,source:'app-owned synthetic transport only',records};
if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
