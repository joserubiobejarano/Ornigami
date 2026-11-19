/** Verifies the built route fails closed even with live opt-ins set. No source read. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const env={PATH:process.env.PATH,NODE_ENV:'production',GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',AUTH_SECRET:'synthetic-auth-secret-with-no-production-value',AUTH_TRUST_HOST:'true',STRIPE_SECRET_KEY:'sk_test_synthetic_no_provider_io',DATABASE_URL:'https://ci.invalid/database',NEXT_PUBLIC_APP_URL:origin,OPENAI_ENABLED:'false',CAMPAIGN_LAB_GENERATION_PROVIDER:'local-test',CAMPAIGN_LAB_GENERATION_LIVE:'false',ORNIGAMI_BRAND_URL_MODE:'live',ORNIGAMI_BRAND_URL_LIVE:'true',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of ['SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p',String(port)],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let log='';child.stdout.on('data',b=>{log=(log+b).slice(-6000);});child.stderr.on('data',b=>{log=(log+b).slice(-6000);});
try{
 const deadline=Date.now()+30000;while(!log.includes('Ready')&&Date.now()<deadline&&child.exitCode===null)await new Promise(r=>setTimeout(r,100));assert(log.includes('Ready'),log);
 const records=[];
 for(const payload of [{url:'https://brand-url.example/slow'},{url:'https://brand-url.example/rose',transport:{}}]){const r=await fetch(origin+'/api/campaign-lab/brand-evidence',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});assert.equal(r.status,404);const body=await r.json();assert.equal(body.ok,false);assert(!body.draft);records.push({status:r.status,sourceWork:'unavailable before request validation'});}
 const page=await fetch(origin+'/campaign-lab/offer',{signal:AbortSignal.timeout(10000)});assert.equal(page.status,404);
 const report={runtime:process.version,mode:'production',serverOptIns:'live + true (intentionally ignored in production)',records,pageStatus:page.status,externalRequests:0};
 await writeFile(process.argv[2]??'.local/api-production.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('close',r)),new Promise(r=>setTimeout(r,2000))]);}
