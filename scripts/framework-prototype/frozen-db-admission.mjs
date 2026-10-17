import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const metadataLimit = 65536;
export const policyId = 'trivy-0.76.0-schema2-updated-not-future-next-update-strict-v1';
const hash = b => createHash('sha256').update(b).digest('hex');
function durable(file, bytes) {const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
const save=(dir,name,value)=>durable(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
export async function contentIdentity(file) {
  const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink())throw Error('not a regular file');
  const h=createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);
  const after=fs.lstatSync(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw Error('file changed while hashing');
  return {bytes:after.size,sha256:h.digest('hex')};
}
export function parseTimestamp(value) {
  if(typeof value!=='string')return {result:'invalid',raw:value??null,reason:'RFC3339 string required'};
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if(!m)return{result:'invalid',raw:value,reason:'RFC3339 timestamp required'};
  const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[0,31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month]||hour>23||minute>59||second>59||(m[8]!=='Z'&&(Number(m[10])>23||Number(m[11])>59)))return{result:'invalid',raw:value,reason:'invalid calendar/time/offset'};
  const epochMs=Date.parse(value);if(!Number.isFinite(epochMs))return{result:'invalid',raw:value,reason:'unrepresentable timestamp'};
  return{result:'passed',raw:value,epochMs,utc:new Date(epochMs).toISOString(),goZero:value==='0001-01-01T00:00:00Z'};
}
export function validateMetadata(metadata, nowMs) {
  const errors=[],observations=[],parsedTimestamps={};
  if(!Number.isFinite(nowMs))errors.push({code:'clock-invalid'});
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return{result:'failed',errors:[...errors,{code:'metadata-object-required'}],parsedTimestamps,observations};
  if(metadata.Version!==2)errors.push({code:'schema-version-unsupported',observed:metadata.Version??null,expected:2});
  for(const field of ['UpdatedAt','NextUpdate','DownloadedAt']){
    if(field==='DownloadedAt'&&metadata[field]===null){parsedTimestamps[field]={result:'passed',raw:null,goZero:true,epochMs:Date.parse('0001-01-01T00:00:00Z'),utc:'0001-01-01T00:00:00.000Z'};observations.push('DownloadedAt null retains Go zero value; never grants freshness');continue;}
    if(!Object.hasOwn(metadata,field)){
      parsedTimestamps[field]={result:'missing',raw:null};
      if(field!=='DownloadedAt')errors.push({code:field+'-missing'});else observations.push('DownloadedAt omitted: upstream Go zero-value semantics; never grants freshness');
      continue;
    }
    const parsed=parsedTimestamps[field]=parseTimestamp(metadata[field]);
    if(parsed.result!=='passed')errors.push({code:field+'-invalid',reason:parsed.reason});
    else if(field==='UpdatedAt'&&parsed.epochMs>nowMs)errors.push({code:'UpdatedAt-future'});
    else if(field==='NextUpdate'&&parsed.epochMs<=nowMs)errors.push({code:'NextUpdate-expired'});
    if(field==='DownloadedAt'&&parsed.result==='passed'&&parsed.epochMs>nowMs)observations.push('DownloadedAt is future-dated; informational under unchanged two-field freshness rule, not a freshness extension');
  }
  return{result:errors.length?'failed':'passed',errors,parsedTimestamps,observations};
}

// The original metadata, its identity and actual guard clock are durable before
// decoding/JSON parsing. No download, scanner invocation, build or custody action.
export async function admitFrozenDatabase({cacheDirectory,outputDirectory,sourceSha,scannerPath,scannerSha256,now=Date.now}) {
  fs.mkdirSync(outputDirectory); // Never overwrite historical evidence.
  const sampledAtMs=now(),validClock=Number.isFinite(sampledAtMs)&&Math.abs(sampledAtMs)<=8640000000000000,clock={epochMs:validClock?sampledAtMs:null,utc:validClock?new Date(sampledAtMs).toISOString():null,monotonicNs:process.hrtime.bigint().toString(),node:process.version,platform:process.platform,arch:process.arch,scope:'actual admission/scanner-guard process OS wall clock; future Trivy subprocess shares OS clock, not a claimed Trivy internal trace'};
  save(outputDirectory,'clock.json',clock);
  const index={schema:1,policyId,sourceSha,result:'failed',clock,scannerVersion:'0.76.0 (pinned archive contract)',metadataIdentity:null,databaseIdentity:null,scannerIdentity:null,parsedTimestamps:{},errors:[],observations:[],custody:'not assessed; independent'};
  const persistIndex=value=>{const pending=path.join(outputDirectory,'index.next.json');durable(pending,JSON.stringify(value,null,2)+'\n');fs.renameSync(pending,path.join(outputDirectory,'index.json'));};
  persistIndex({...index,phase:'capturing-identities',errors:[{code:'admission-incomplete'}]});
  if(!validClock)index.errors.push({code:'clock-invalid'});
  let raw,complete=false;
  try{
    const file=path.join(cacheDirectory,'db/metadata.json'),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink())throw Error('metadata is not a regular file');
    const fd=fs.openSync(file,'r');try{raw=Buffer.alloc(Math.min(stat.size,metadataLimit));const bytes=fs.readSync(fd,raw,0,raw.length,0);raw=raw.subarray(0,bytes);}finally{fs.closeSync(fd);}
    complete=raw.length===stat.size&&stat.size<=metadataLimit;
    durable(path.join(outputDirectory,'metadata.original.bin'),raw);
    index.metadataIdentity={bytes:stat.size,retainedBytes:raw.length,retainedSha256:hash(raw),sha256:complete?hash(raw):null,truncated:!complete};
    if(!complete)index.errors.push({code:'metadata-too-large-or-short-read',limit:metadataLimit});
  }catch(error){index.errors.push({code:error.code==='ENOENT'?'metadata-missing':'metadata-read-failed',message:error.message});}
  save(outputDirectory,'metadata-identity.json',index.metadataIdentity??{result:'unavailable',errors:index.errors});
  // Retain content identity even when metadata will be rejected. Never retain DB bytes.
  for(const [key,file]of [['databaseIdentity',path.join(cacheDirectory,'db/trivy.db')],['scannerIdentity',scannerPath]]){
    try{index[key]=await contentIdentity(file);if(key==='scannerIdentity'&&index[key].sha256!==scannerSha256)index.errors.push({code:'scanner-checksum-mismatch'});if(key==='databaseIdentity'&&index[key].bytes===0)index.errors.push({code:'database-empty'});}
    catch(error){index.errors.push({code:key+'-unavailable',message:error.message});}
    save(outputDirectory,key+'.json',index[key]??{result:'unavailable'});
  }
  if(complete){try{if((await contentIdentity(path.join(cacheDirectory,'db/metadata.json'))).sha256!==index.metadataIdentity.sha256)index.errors.push({code:'metadata-changed-before-validation'});}catch(error){index.errors.push({code:'metadata-changed-before-validation',message:error.message});}}
  const validationNow=now(),validationClock={...clock,epochMs:Number.isFinite(validationNow)&&Math.abs(validationNow)<=8640000000000000?validationNow:null,utc:Number.isFinite(validationNow)&&Math.abs(validationNow)<=8640000000000000?new Date(validationNow).toISOString():null,monotonicNs:process.hrtime.bigint().toString()};
  index.captureClock=clock;index.clock=validationClock;save(outputDirectory,'validation-clock.json',validationClock);
  persistIndex({...index,phase:'retained-before-parsing',errors:[...index.errors,{code:'admission-incomplete'}]});
  if(complete){
    try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);let metadata;
      try{metadata=JSON.parse(text);}catch(error){index.errors.push({code:'metadata-malformed-json',message:error.message});}
      if(metadata!==undefined){const validation=validateMetadata(metadata,validationNow);index.metadata=metadata;index.parsedTimestamps=validation.parsedTimestamps;index.observations=validation.observations;index.errors.push(...validation.errors);}
    }catch(error){index.errors.push({code:'metadata-invalid-utf8',message:error.message});}
  }
  if(!/^[0-9a-f]{40}$/.test(sourceSha??''))index.errors.push({code:'source-identity-invalid'});
  index.result=index.errors.length?'failed':'passed';index.phase='complete';index.finishedAt=new Date().toISOString();persistIndex(index);return index;
}

// Identity/expiry checks consume the single admission, without re-parsing DB metadata
// or granting a fresh lease. An expired/frozen-content drift stops downstream work.
export async function requireFrozenDatabase({admissionDirectory,admissionSha256,cacheDirectory,scannerPath,scannerSha256,sourceSha,now=Date.now}) {
  const bytes=fs.readFileSync(path.join(admissionDirectory,'index.json'));if(admissionSha256&&hash(bytes)!==admissionSha256)throw Error('Shared database admission receipt identity mismatch');
  const r=JSON.parse(bytes),time=now();if(r.result!=='passed'||r.policyId!==policyId||r.sourceSha!==sourceSha)throw Error('Shared database admission failed/missing or source/policy drift');
  if(!Number.isFinite(time)||!Number.isFinite(r.clock?.epochMs)||!Number.isFinite(r.parsedTimestamps?.NextUpdate?.epochMs)||time<r.clock.epochMs||time>=r.parsedTimestamps.NextUpdate.epochMs)throw Error('Shared database admission expired, invalid or clock moved backward');
  if(r.scannerIdentity.sha256!==scannerSha256||(await contentIdentity(scannerPath)).sha256!==scannerSha256)throw Error('Scanner identity drift after shared admission');
  const meta=await contentIdentity(path.join(cacheDirectory,'db/metadata.json'));if(meta.bytes>metadataLimit||meta.sha256!==r.metadataIdentity.sha256)throw Error('Frozen metadata identity drift');
  const db=await contentIdentity(path.join(cacheDirectory,'db/trivy.db'));if(db.sha256!==r.databaseIdentity.sha256||db.bytes!==r.databaseIdentity.bytes)throw Error('Frozen database identity drift');return r;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const[, ,cacheDirectory,outputDirectory,sourceSha,scannerPath,scannerSha256]=process.argv;const r=await admitFrozenDatabase({cacheDirectory,outputDirectory,sourceSha,scannerPath,scannerSha256});console.log(JSON.stringify({result:r.result,errors:r.errors,receipt:path.join(outputDirectory,'index.json')}));process.exitCode=r.result==='passed'?0:1;}catch(error){console.error(error.message);process.exitCode=1;}
}
