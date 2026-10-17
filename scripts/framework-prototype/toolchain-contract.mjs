import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {contractDigest,sha256} from './tool-image.mjs';

const digest=value=>/^[0-9a-f]{64}$/.test(value??'');
export function loadToolchainRecipe(directory) {
  const recipe=JSON.parse(fs.readFileSync(path.join(directory,'recipe.json'),'utf8')),c=recipe.contract;
  if(recipe.schema!==1||recipe.experimental!==true||!['tooling','full'].includes(recipe.trialScope)||!c||contractDigest(c)!==recipe.buildContractSha256)throw Error('Experimental toolchain contract identity invalid');
  if(c.platform!=='linux/amd64'||c.goVersion!=='go1.27.2'||c.modules.toolchain!=='local'||c.modules.mode!=='readonly'||c.modules.proxy!=='https://proxy.golang.org'||c.modules.sumdb!=='sum.golang.org')throw Error('Toolchain platform/Go/module policy drift');
  if(c.compiler.memoryBytes!==8589934592||c.compiler.memorySwapBytes!==8589934592||c.compiler.cpus!==3||c.compiler.parallelism!==2||!Number.isInteger(c.compiler.maxSeconds)||c.compiler.maxSeconds<1||c.compiler.maxSeconds>600||c.compiler.GOMAXPROCS!==3||c.compiler.GOMEMLIMIT!=='1536MiB'||!digest(c.goBinary.sha256))throw Error('Toolchain compiler bounds drift');
  if(Object.keys(c.sources).sort().join(',')!=='buildkit,cni,runc'||c.binaries.length!==8||new Set(c.binaries.map(b=>b.name)).size!==8)throw Error('Whole shipped tooling closure required');
  const expectedNames=['buildctl','buildkit-cni-bridge','buildkit-cni-firewall','buildkit-cni-host-local','buildkit-cni-loopback','buildkit-runc','buildkitd','dockerfile-frontend'];
  if(c.binaries.map(b=>b.name).sort().join(',')!==expectedNames.join(','))throw Error('Tooling binary role drift');
  const roles={buildkitd:['buildkit','./cmd/buildkitd'],buildctl:['buildkit','./cmd/buildctl'],'dockerfile-frontend':['buildkit','./frontend/dockerfile/cmd/dockerfile-frontend'],'buildkit-runc':['runc','./'],'buildkit-cni-bridge':['cni','./plugins/main/bridge'],'buildkit-cni-firewall':['cni','./plugins/meta/firewall'],'buildkit-cni-host-local':['cni','./plugins/ipam/host-local'],'buildkit-cni-loopback':['cni','./plugins/main/loopback']};
  for(const b of c.binaries)if(b.source!==roles[b.name][0]||b.package!==roles[b.name][1]||b.cgo!==(b.name==='buildkit-runc')||typeof b.ldflags!=='string'||typeof b.tags!=='string'||!/^\w+(?:,\w+)*$/.test(b.tags))throw Error('Binary source/package/build mode drift');
  for(const [name,s] of Object.entries(c.sources)){
    if(s.repo!==({buildkit:'moby/buildkit',runc:'opencontainers/runc',cni:'containernetworking/plugins'})[name])throw Error('Official tool source repository drift');
    if(!/^[a-f0-9]{40}$/.test(s.commit)||!digest(s.sha256)||!Number.isSafeInteger(s.bytes)||s.bytes<1||s.bytes>64*1024*1024||s.url!=='https://codeload.github.com/'+s.repo+'/tar.gz/'+s.commit)throw Error('Pinned tool source invalid');
    for(const file of ['go.mod','go.sum']){
      const lock=s.locks[file],relative='locks/'+name+'.'+file;
      if(lock.file!==relative||!digest(lock.originalSha256)||sha256(fs.readFileSync(path.join(directory,relative)))!==lock.sha256)throw Error('Patched module lock identity drift');
    }
    const mod=fs.readFileSync(path.join(directory,s.locks['go.mod'].file),'utf8');
    if(!/\bgolang\.org\/x\/net v0\.60\.0\b/.test(mod)||(name==='buildkit'&&!/\bgithub\.com\/moby\/go-archive v0\.3\.3\b/.test(mod)))throw Error('Required fixed Go modules absent');
  }
  if(c.apkLock.file!=='apk-lock.json'||c.apkLock.maxPackages!==100||c.apkLock.maxBytes!==256*1024*1024)throw Error('APK lock bounds drift');
  const bytes=fs.readFileSync(path.join(directory,c.apkLock.file));
  if(sha256(bytes)!==c.apkLock.sha256)throw Error('APK lock hash mismatch');
  const apk=JSON.parse(bytes);
  if(!apk.packages.length||apk.packages.length>100||apk.packages.reduce((n,p)=>n+p.bytes,0)>c.apkLock.maxBytes)throw Error('APK closure exceeds bounds');
  for(const p of apk.packages)if(!/^[A-Za-z0-9+_.-]+\.apk$/.test(p.filename)||!digest(p.sha256)||!['main','community'].includes(p.repo)||p.url!=='https://dl-cdn.alpinelinux.org/alpine/v3.23/'+p.repo+'/x86_64/'+p.filename||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>64*1024*1024)throw Error('APK source identity invalid');
  if(Object.keys(c.bases).sort().join(',')!=='compiler,runtime'||c.bases.compiler.repository!=='library/golang'||c.bases.runtime.repository!=='library/alpine')throw Error('Compiler/runtime base role drift');
  for(const base of Object.values(c.bases))if(!/^sha256:[a-f0-9]{64}$/.test(base.amd64Digest)||!/^sha256:[a-f0-9]{64}$/.test(base.configDigest))throw Error('Toolchain base identity invalid');
  if(!recipe.expectedFrontend||!digest(recipe.expectedFrontend.binarySha256)||!['configDigest','manifestDigest','layerDigest'].every(k=>/^sha256:[a-f0-9]{64}$/.test(recipe.expectedFrontend[k]??'')))throw Error('Deterministic frontend identities missing');
  return {...recipe,apk};
}

export async function downloadPinnedFile(input,destination,{fetcher=fetch,deadline=Date.now()+120000}={}) {
  if(!digest(input.sha256)||!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>64*1024*1024)throw Error('Invalid bounded download identity');
  const handle=await fs.promises.open(destination,'wx',0o600),h=createHash('sha256');let size=0;
  try{
    const response=await fetcher(input.url,{signal:AbortSignal.timeout(Math.max(1,Math.min(60000,deadline-Date.now())))});
    if(!response.ok)throw Error('Pinned input HTTP '+response.status);
    for await(const chunk of response.body){size+=chunk.length;if(size>input.bytes)throw Error('Pinned input exceeds byte bound');h.update(chunk);await handle.writeFile(chunk);}
    if(size!==input.bytes||h.digest('hex')!==input.sha256)throw Error('Pinned input size/digest mismatch');
    await handle.sync();
  }finally{await handle.close();}
  if(sha256(await fs.promises.readFile(destination))!==input.sha256)throw Error('Pinned input durable read-back mismatch');
  return {bytes:size,sha256:input.sha256};
}
