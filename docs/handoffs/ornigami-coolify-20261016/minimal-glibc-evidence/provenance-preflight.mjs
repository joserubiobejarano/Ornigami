import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import{pipeline}from'node:stream/promises';import{execFileSync}from'node:child_process';
const out=path.resolve('.local/minimal-glibc-20261017');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function get(url){const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r;}
const release=JSON.parse(execFileSync('gh',['api','repos/sigstore/cosign/releases/tags/v3.1.3'],{encoding:'utf8',maxBuffer:5*1024*1024}));
const tool=release.assets.find(x=>x.name==='cosign-windows-amd64.exe');const exe=path.join(out,tool.name);
if(!fs.existsSync(exe))await pipeline((await get(tool.browser_download_url)).body,fs.createWriteStream(exe,{flags:'wx'}));
const sha=crypto.createHash('sha256');for await(const data of fs.createReadStream(exe))sha.update(data);const exeSha=sha.digest('hex');if('sha256:'+exeSha!==tool.digest)throw Error('Official release binary mismatch');
const checksums=await(await get('https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign_checksums.txt')).text();if(!checksums.split('\n').some(x=>x.startsWith(exeSha+' ')&&x.trim().endsWith(tool.name)))throw Error('Release checksum mismatch');
fs.writeFileSync(path.join(out,'COSIGN_TOOL.json'),JSON.stringify({release:release.tag_name,releaseURL:release.html_url,asset:tool.name,sha256:exeSha,bytes:fs.statSync(exe).size,bootstrap:'Official GitHub release digest and checksum file; publisher bundle verification follows separately.'},null,2)+'\n');
const previous=JSON.parse(fs.readFileSync('docs/handoffs/ornigami-coolify-20261016/remediation-preparation-evidence/DISTROLESS_REGISTRY_METADATA.json','utf8'));
const images=[];
for(const p of previous){
 const base='https://gcr.io/v2/distroless/nodejs22-debian13',accept='application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json';
 const raw=Buffer.from(await(await get(base+'/manifests/'+p.indexDigest)).arrayBuffer());if('sha256:'+hash(raw)!==p.indexDigest)throw Error('Index digest mismatch');const index=JSON.parse(raw);
 const selected=index.manifests.filter(x=>x.platform?.architecture==='amd64'&&x.platform?.os==='linux');if(selected.length!==1||selected[0].digest!==p.amd64Digest)throw Error('Arch binding mismatch');
 const mr=await fetch(base+'/manifests/'+p.amd64Digest,{headers:{accept}});if(!mr.ok)throw Error('Manifest HTTP '+mr.status);const mb=Buffer.from(await mr.arrayBuffer());if('sha256:'+hash(mb)!==p.amd64Digest)throw Error('Manifest digest mismatch');const manifest=JSON.parse(mb);
 const cb=Buffer.from(await(await get(base+'/blobs/'+manifest.config.digest)).arrayBuffer());if('sha256:'+hash(cb)!==manifest.config.digest)throw Error('Config digest mismatch');const config=JSON.parse(cb);
 const label=p.reference.endsWith(':nonroot')?'runtime':'tooling';
 fs.writeFileSync(path.join(out,label+'-index.json'),raw);fs.writeFileSync(path.join(out,label+'-manifest.json'),mb);fs.writeFileSync(path.join(out,label+'-config.json'),cb);
 images.push({role:label,reference:p.reference,indexDigest:p.indexDigest,amd64Digest:p.amd64Digest,annotations:manifest.annotations,indexAnnotations:index.annotations,configDigest:manifest.config.digest,layers:manifest.layers,config:config.config,versionAdmission:'not bound pending signatures and exact Node/OpenSSL/native proof'});
}
fs.writeFileSync(path.join(out,'PARENT_METADATA.json'),JSON.stringify(images,null,2)+'\n');
console.log(JSON.stringify({tool:{sha256:exeSha,bytes:fs.statSync(exe).size},images:images.map(x=>({role:x.role,annotations:x.annotations,amd64Digest:x.amd64Digest}))},null,2));
