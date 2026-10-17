import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';import{pipeline}from'node:stream/promises';
const root=process.cwd(),out=path.join(root,'.local/minimal-glibc-20261017'),cosign=path.join(out,'cosign-windows-amd64.exe');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const save=(p,o)=>fs.writeFileSync(path.join(out,p),JSON.stringify(o,null,2)+'\n');
async function download(url,file){if(!fs.existsSync(file)){const r=await fetch(url);if(!r.ok)throw Error(url+': '+r.status);await pipeline(r.body,fs.createWriteStream(file,{flags:'wx'}));}}
const bundleFile=path.join(out,'cosign-publisher.sigstore.json');await download('https://github.com/sigstore/cosign/releases/download/v3.1.3/cosign-windows-amd64.exe.sigstore.json',bundleFile);
const bundle=JSON.parse(fs.readFileSync(bundleFile));const cert=new crypto.X509Certificate(Buffer.from(bundle.verificationMaterial.certificate.rawBytes,'base64'));
const identity='keyless@projectsigstore.iam.gserviceaccount.com';if(cert.subjectAltName!=='email:'+identity)throw Error('Unexpected official publisher identity');
const checks=[{name:'cosign-publisher',args:['verify-blob','--bundle',bundleFile,'--certificate-identity',identity,'--certificate-oidc-issuer','https://accounts.google.com',cosign]}];
const images=JSON.parse(fs.readFileSync(path.join(out,'PARENT_METADATA.json')));
for(const image of images)checks.push({name:image.role+'-signature',args:['verify','--certificate-identity','keyless@distroless.iam.gserviceaccount.com','--certificate-oidc-issuer','https://accounts.google.com','--output','json','gcr.io/distroless/nodejs22-debian13@'+image.indexDigest]});
for(const check of checks){const result=spawnSync(cosign,check.args,{encoding:'utf8',maxBuffer:10*1024*1024,timeout:120000,windowsHide:true});fs.writeFileSync(path.join(out,check.name+'.stdout'),result.stdout??'');fs.writeFileSync(path.join(out,check.name+'.stderr'),result.stderr??'');save(check.name+'.receipt.json',{exit:result.status,args:check.args.map(x=>x===cosign?'cosign-windows-amd64.exe':x===bundleFile?'cosign-publisher.sigstore.json':x),at:new Date().toISOString(),publisherIdentity:identity});if(result.status!==0)throw Error(check.name+' verification failed');}
const release=(await(await fetch('https://nodejs.org/dist/index.json')).json()).find(x=>x.version==='v22.23.3');if(!release)throw Error('Node release absent');save('NODE_RELEASE.json',release);
const nodeTar=path.join(out,'node-v22.23.3-linux-x64.tar.xz');await download('https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz',nodeTar);
const sums=await(await fetch('https://nodejs.org/dist/v22.23.3/SHASUMS256.txt')).text();const tarHash=hash(fs.readFileSync(nodeTar));if(tarHash!=='df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de'||!sums.includes(tarHash+'  node-v22.23.3-linux-x64.tar.xz'))throw Error('Reviewed Node archive identity mismatch');
const officialNode=execFileSync('tar',['-xOf',nodeTar,'node-v22.23.3-linux-x64/bin/node'],{maxBuffer:160*1024*1024});const nodeSha=hash(officialNode);fs.writeFileSync(path.join(out,'official-node.elf'),officialNode);
const blobs=path.join(out,'blobs');fs.mkdirSync(blobs,{recursive:true});const members=[];
for(const image of images){
 let matchedNode=false;
 for(const layer of image.layers){
  const file=path.join(blobs,layer.digest.replace(':','-')+'.tar.gz');await download('https://gcr.io/v2/distroless/nodejs22-debian13/blobs/'+layer.digest,file);if('sha256:'+hash(fs.readFileSync(file))!==layer.digest)throw Error('Layer digest mismatch');
  const listing=execFileSync('tar',['-tf',file],{encoding:'utf8',maxBuffer:6*1024*1024}).trim().split('\n').filter(Boolean);
  for(const member of listing){if(/(?:^|\/)nodejs\/bin\/node$/.test(member)){const binary=execFileSync('tar',['-xOf',file,member],{maxBuffer:160*1024*1024});if(hash(binary)!==nodeSha)throw Error('Parent Node binary differs from reviewed official artifact');matchedNode=true;}
  }
  members.push({role:image.role,layer:layer.digest,file:path.relative(out,file).replaceAll('\\','/'),members:listing});
 }
 if(!matchedNode||image.annotations?.['com.google.distroless.nodejs.version']!=='22.23.3')throw Error('Exact Node identity not established');
}
save('PARENT_LAYER_MEMBERS.json',members);
save('PARENT_ADMISSION.json',{at:new Date().toISOString(),signatures:'Both pinned OCI indexes verified by cosign with exact Distroless keyless identity/issuer and transparency proof; amd64 manifests/config/layers hash-bound to indexes.',cosignPublisher:'verified official Sigstore project Google identity/issuer; bootstrap official GitHub release digest',nodeVersion:release.version,nodeOpenSSL:release.openssl,nodeModulesABI:release.modules,officialNodeArchiveSha256:tarHash,officialNodeBinarySha256:nodeSha,parentBinaryMatch:'both exact; no Node patch change',runtimeExecution:'not performed; Linux version recheck required in future trial',nativeClosure:'pending local ELF inspection before Dockerfile pins'});
console.log(JSON.stringify({signatures:'passed',node:release.version,openssl:release.openssl,nodeBinarySha256:nodeSha,layers:members.length,downloadedUniqueLayers:fs.readdirSync(blobs).length}));
