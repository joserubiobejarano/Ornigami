import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const out = path.resolve('docs/handoffs/ornigami-coolify-20261016/db-recovery-evidence');
fs.mkdirSync(out, {recursive:true});
const receipts=[];
function api(name, endpoint, extra=[]) {
  const startedAt=new Date().toISOString();
  const b=execFileSync('gh',['api',...extra,endpoint], {timeout:30000,maxBuffer:524288,windowsHide:true});
  fs.writeFileSync(path.join(out,name),b);
  receipts.push({name,endpoint,startedAt,finishedAt:new Date().toISOString(),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
  return b;
}
const run=JSON.parse(api('publisher-run.json','repos/aquasecurity/trivy-db/actions/runs/39056570786'));
const jobs=JSON.parse(api('publisher-jobs.json','repos/aquasecurity/trivy-db/actions/runs/39056570786/jobs'));
if(run.conclusion!=='success'||run.head_sha!=='cbebf2ecd6df42d36463844a45e689afee51c70f'||jobs.jobs.length!==1)throw Error('Publisher identity mismatch');
const log=api('publisher-upload-log-tail.txt',`repos/aquasecurity/trivy-db/actions/jobs/${jobs.jobs[0].id}/logs`,['-H','Range: bytes=-131072']).toString();
const accept='application/vnd.oci.image.manifest.v1+json';
const auth=await fetch('https://ghcr.io/token?service=ghcr.io&scope=repository%3Aaquasecurity%2Ftrivy-db%3Apull',{signal:AbortSignal.timeout(20000)});
if(!auth.ok)throw Error('Anonymous auth failed');
const {token}=await auth.json();
async function manifest(ref,name) {
 const url='https://ghcr.io/v2/aquasecurity/trivy-db/manifests/'+ref;
 const r=await fetch(url,{headers:{accept,authorization:'Bearer '+token,'cache-control':'no-cache'},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Manifest failed '+r.status);
 const chunks=[];let n=0;
 for await(const c of r.body){n+=c.length;if(n>262144)throw Error('Manifest size bound');chunks.push(c);}
 const b=Buffer.concat(chunks),digest='sha256:'+createHash('sha256').update(b).digest('hex');
 if(r.headers.get('docker-content-digest')!==digest)throw Error('Digest mismatch');
 fs.writeFileSync(path.join(out,name),b);
 receipts.push({name,url,at:new Date().toISOString(),bytes:n,digest,headers:Object.fromEntries(['date','content-type','docker-content-digest'].map(k=>[k,r.headers.get(k)]))});
 return {b,digest,m:JSON.parse(b)};
}
const tag=await manifest('2','registry-tag-manifest.json');
const exact=await manifest(tag.digest,'registry-digest-manifest.json');
if(!tag.b.equals(exact.b))throw Error('Immutable bytes differ');
const escaped=tag.digest.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// GitHub masks the publisher's secret substring in its own organization name.
const publication=new RegExp('Pushed \\[registry\\] ghcr\\.io/\\*\\*\\*urity/trivy-db:2\\r?\\n[^\\n]*ArtifactType:[^\\n]*\\n[^\\n]*Digest: '+escaped+'\\r?\\n[^\\n]*Successfully pushed to ghcr\\.io/\\*\\*\\*urity/trivy-db:2');
if(!publication.test(log))throw Error('Upload-to-digest binding absent');
if(tag.m.schemaVersion!==2||tag.m.artifactType!=='application/vnd.aquasec.trivy.config.v1+json'||tag.m.layers.length!==1||tag.m.layers[0].mediaType!=='application/vnd.aquasec.trivy.db.layer.v1.tar+gzip')throw Error('Incompatible format');
fs.writeFileSync(path.join(out,'PUBLICATION.json'),JSON.stringify({at:new Date().toISOString(),runId:run.id,publisherHead:run.head_sha,jobId:jobs.jobs[0].id,digest:tag.digest,manifest:tag.m,uploadLogDigestBinding:true,blobDownloads:0,internalFreshness:'not yet tested',advisoryCoverage:'source and exact database review pending'},null,2)+'\n');
fs.writeFileSync(path.join(out,'REQUESTS.json'),JSON.stringify(receipts,null,2)+'\n');
console.log(JSON.stringify({digest:tag.digest,layer:tag.m.layers[0],publisherHead:run.head_sha,uploadLogDigestBinding:true,blobDownloads:0}));
