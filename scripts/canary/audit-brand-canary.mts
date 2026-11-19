/** Offline reconstruction from passive events. Never performs network work. */
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { collectBrandKitDraft } from '../../src/lib/campaign-lab/brand-import/brand-evidence.ts';
import { BOUNDS } from './run-brand-canary.mjs';
import type { SuppliedBrandResource } from '../../src/lib/campaign-lab/brand-import/evidence-types.ts';
type Event = {type:string;at:string;monotonic:number;pid:number;key?:string;url?:string;method?:string;path?:string;status?:number;contentType?:string|null;location?:string|null;file?:string|null;bytes?:number;sha256?:string;complete?:boolean;authorized?:boolean;protocol?:string;sourceAttemptsSoFar?:number};
export function reconstruct(events:Event[],seed=BOUNDS.seed){
  const imports=events.filter(e=>e.type==='local-request'&&e.path==='/api/campaign-lab/brand-evidence');
  assert.equal(imports.length,1,'Exactly one API import must be recorded');
  const requests=events.filter(e=>e.type==='source-request');assert(requests.length>0&&requests.length<=12);
  assert.equal(requests[0].url,seed);assert(requests.every(r=>r.method==='GET'));
  const groups:{requestedUrl:string;finalUrl:string;attempts:number;status:number|null;mediaType:string|null;bytes:number;sha256:string|null;file:string|null;complete:boolean;keys:string[]}[]=[];
  for(const r of requests){
    const previous=requests[requests.indexOf(r)-1];
    const prevHeaders=previous&&events.find(e=>e.type==='source-headers'&&e.key===previous.key);
    const isRedirect=prevHeaders&&[301,302,303,307,308].includes(prevHeaders.status!);
    if(isRedirect){assert.equal(r.url,new URL(prevHeaders.location!,previous.url).href);groups.at(-1)!.attempts++;assert(groups.at(-1)!.attempts<=3);}
    else groups.push({requestedUrl:r.url!,finalUrl:r.url!,attempts:1,status:null,mediaType:null,bytes:0,sha256:null,file:null,complete:false,keys:[]});
    const g=groups.at(-1)!;g.keys.push(r.key!);g.finalUrl=r.url!;
    const headers=events.find(e=>e.type==='source-headers'&&e.key===r.key);
    const body=events.find(e=>e.type==='source-body'&&e.key===r.key);
    g.status=headers?.status??null;g.mediaType=headers?.contentType??null;
    if(body){g.bytes=body.bytes!;g.sha256=body.sha256!;g.file=body.file!;g.complete=body.complete===true;}
  }
  assert(groups.length<=4);
  let charged=0;let retained=0;
  const entries=groups.map((g,i)=>{
    const reservation=Math.min(i===0?524288:262144,1048576-charged);assert(reservation>0);
    assert(g.bytes<=reservation);retained+=g.bytes;
    charged+=g.complete?g.bytes:reservation;
    return {...g,kind:i===0?'html' as const:'css' as const,reservedBeforeRead:reservation,chargedBytes:g.complete?g.bytes:reservation};
  });
  assert(charged<=1048576);
  return {seed,apiTransactions:imports.length,logicalResources:groups.length,getAttempts:requests.length,chargedBytes:charged,retainedBytes:retained,bounds:BOUNDS,entries,
    sourceGetSpanMs:requests.length?Date.parse(events.filter(e=>e.type==='source-body').at(-1)?.at??requests.at(-1)!.at)-Date.parse(requests[0].at):null,
    sourceGetSpanCaveat:'HTTP diagnostic span excludes initial DNS and route compilation; configured protected shared deadline is separately tested.',
    tls:events.filter(e=>e.type==='tls'),closed:events.filter(e=>e.type==='connection-close'),
    generation:events.filter(e=>e.type==='local-request'&&e.path==='/api/campaign-lab/generate'),
    localResponses:events.filter(e=>e.type==='local-response')};
}
async function main(){
  const directory=resolve('.local/brand-live-canary-20261119');
  const events:Event[]=[];
  for(const file of await readdir(directory))if(/^events-\d+\.jsonl$/.test(file))events.push(...(await readFile(resolve(directory,file),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
  events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.monotonic-b.monotonic);
  const ledger=reconstruct(events);
  const resources:SuppliedBrandResource[]=[];
  for(const entry of ledger.entries){
    assert(entry.complete&&entry.status!>=200&&entry.status!<300,'Failed live source read; no retry is authorized');
    assert(entry.mediaType?.split(';')[0].trim().toLowerCase()===(entry.kind==='html'?'text/html':'text/css'));
    const body=await readFile(resolve(directory,entry.file!));assert.equal(body.length,entry.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),entry.sha256);
    resources.push({kind:entry.kind,requestedUrl:entry.requestedUrl,finalUrl:entry.finalUrl,status:entry.status!,contentType:entry.mediaType,body});
  }
  const draft=await collectBrandKitDraft(resources);
  assert(draft.candidates.some(c=>c.category==='ui-color'),'Do not invent a kit without supported colors');
  await writeFile(resolve(directory,'reconstructed-ledger.json'),JSON.stringify(ledger,null,2));
  await writeFile(resolve(directory,'original-observations.json'),JSON.stringify(draft,null,2));
  console.log(JSON.stringify({apiTransactions:ledger.apiTransactions,logicalResources:ledger.logicalResources,getAttempts:ledger.getAttempts,chargedBytes:ledger.chargedBytes,retainedBytes:ledger.retainedBytes,candidates:draft.candidates.length,ownerApproval:false}));
}
if(process.argv[1]?.endsWith('audit-brand-canary.mts'))main().catch(error=>{console.error(error.message);process.exitCode=1;});
