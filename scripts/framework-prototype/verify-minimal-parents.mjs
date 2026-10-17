import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyParents(policy,cosign,out,{get=fetch,invoke=spawnSync}={}){
  if(hash(fs.readFileSync(cosign))!==policy.cosignLinuxSha256)throw Error('Pinned Linux cosign checksum mismatch');
  fs.mkdirSync(out);const results=[];
  const json=async(url,digest)=>{const r=await get(url,{headers:{accept:'application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json'}});if(!r.ok)throw Error('Registry read failed: '+r.status);const bytes=Buffer.from(await r.arrayBuffer());if('sha256:'+hash(bytes)!==digest)throw Error('Registry object digest mismatch');return {bytes,value:JSON.parse(bytes)};};
  try{
    const bundleResponse=await get('https://github.com/sigstore/cosign/releases/download/'+policy.cosignVersion+'/cosign-linux-amd64.sigstore.json');if(!bundleResponse.ok)throw Error('Cosign publisher bundle unavailable');const bundle=Buffer.from(await bundleResponse.arrayBuffer());if(hash(bundle)!==policy.cosignLinuxBundleSha256)throw Error('Publisher bundle checksum mismatch');const bundlePath=path.join(out,'cosign-publisher.sigstore.json');fs.writeFileSync(bundlePath,bundle);
    const publisher=invoke(cosign,['verify-blob','--bundle',bundlePath,'--certificate-identity','keyless@projectsigstore.iam.gserviceaccount.com','--certificate-oidc-issuer','https://accounts.google.com',cosign],{encoding:'utf8',maxBuffer:1024*1024,timeout:90000,windowsHide:true});fs.writeFileSync(path.join(out,'cosign-publisher.stdout'),publisher.stdout??'');fs.writeFileSync(path.join(out,'cosign-publisher.stderr'),publisher.stderr??'');if(publisher.status!==0)throw Error('Cosign publisher verification failed');
    for(const parent of policy.parents){
    const base='https://gcr.io/v2/distroless/nodejs22-debian13';
    const signature=invoke(cosign,['verify','--certificate-identity',policy.signerIdentity,'--certificate-oidc-issuer',policy.signerIssuer,'--output','json','gcr.io/distroless/nodejs22-debian13@'+parent.indexDigest],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:90000,windowsHide:true});
    fs.writeFileSync(path.join(out,parent.role+'-signature.json'),signature.stdout??'');fs.writeFileSync(path.join(out,parent.role+'-signature.stderr'),signature.stderr??'');
    if(signature.status!==0)throw Error(parent.role+' signature failed');
    const signatures=JSON.parse(signature.stdout);if(!signatures.some(x=>x.critical?.image?.['docker-manifest-digest']===parent.indexDigest))throw Error('Verified payload digest not bound to selected parent');
    const index=await json(base+'/manifests/'+parent.indexDigest,parent.indexDigest);
    const amd64=index.value.manifests.filter(x=>x.platform?.os==='linux'&&x.platform?.architecture==='amd64');if(amd64.length!==1||amd64[0].digest!==parent.amd64Digest)throw Error('Signed index amd64 binding changed');
    const manifest=await json(base+'/manifests/'+parent.amd64Digest,parent.amd64Digest);if(manifest.value.config.digest!==parent.configDigest||manifest.value.annotations?.['com.google.distroless.nodejs.version']!==policy.nodeVersion.slice(1))throw Error('Unreviewed parent config/Node version');
    const config=await json(base+'/blobs/'+parent.configDigest,parent.configDigest);if(config.value.architecture!=='amd64'||config.value.os!=='linux'||config.value.config?.User!=='65532')throw Error('Unreviewed platform/default UID');
    for(const[name,object]of[['index',index],['manifest',manifest],['config',config]])fs.writeFileSync(path.join(out,parent.role+'-'+name+'.json'),object.bytes);
    results.push({...parent,result:'passed',scope:'fresh signature and signed index/manifest/config/annotation binding; exact local Node binary proof separately retained'});
  }}finally{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),parents:results,complete:results.length===policy.parents.length},null,2)+'\n');}
  return results;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const[, ,tool,out]=process.argv;const policy=JSON.parse(fs.readFileSync(new URL('./minimal-parent-policy.json',import.meta.url)));await verifyParents(policy,tool,path.resolve(out));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
