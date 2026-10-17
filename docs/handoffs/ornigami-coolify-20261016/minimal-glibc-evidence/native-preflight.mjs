import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createGunzip}from'node:zlib';import{pipeline}from'node:stream/promises';
import{inventoryTar,mergeLayer}from'../framework-prototype/ornigami-minimal-glibc-feasibility/scripts/framework-prototype/tar-inventory.mjs';
import{inspectElf,verifyClosure}from'../framework-prototype/ornigami-minimal-glibc-feasibility/scripts/framework-prototype/elf-closure.mjs';
const root=process.cwd(),out=path.join(root,'.local/minimal-glibc-20261017'),images=JSON.parse(fs.readFileSync(path.join(out,'PARENT_METADATA.json'))),source=path.join(root,'.local/framework-prototype/ornigami-minimal-glibc-feasibility');
const hash=(b,a='sha256')=>crypto.createHash(a).update(b).digest(a==='sha512'?'base64':'hex');const save=(p,o)=>fs.writeFileSync(path.join(out,p),JSON.stringify(o,null,2)+'\n');
const runtime=new Map(),tooling=new Map();
for(const image of images){const files=image.role==='runtime'?runtime:tooling;for(const layer of image.layers){const file=path.join(out,'blobs',layer.digest.replace(':','-')+'.tar.gz');await inventoryTar(fs.createReadStream(file).pipe(createGunzip()),(entry,bytes)=>mergeLayer(files,entry,bytes,layer.digest),{retain:e=>/^(?:etc\/(?:passwd|group|os-release|debian_version)|usr\/lib\/os-release)$/.test(e.path)});}save(image.role+'-filesystem.json',[...files].map(([p,v])=>({path:p,...Object.fromEntries(Object.entries(v).filter(([k])=>k!=='bytes'))})));}
const lock=JSON.parse(fs.readFileSync(path.join(source,'package-lock.json'))),packages=[],nativeRoots=[];
for(const name of Object.entries(lock.packages).filter(([,p])=>p.os?.includes('linux')&&p.cpu?.includes('x64')&&(!p.libc||p.libc.includes('glibc'))).map(([p])=>p.replace(/^node_modules\//,''))){
 const item=lock.packages['node_modules/'+name];if(!item?.resolved||!item.integrity?.startsWith('sha512-'))throw Error('Unpinned native package '+name);
 const file=path.join(out,name.replaceAll('/','-').replace('@','')+'-'+item.version+'.tgz');if(!fs.existsSync(file)){const response=await fetch(item.resolved);if(!response.ok)throw Error('Package fetch failed');await pipeline(response.body,fs.createWriteStream(file,{flags:'wx'}));}
 const bytes=fs.readFileSync(file);if('sha512-'+hash(bytes,'sha512')!==item.integrity)throw Error('Package checksum mismatch');
 const elfFiles=[];await inventoryTar(fs.createReadStream(file).pipe(createGunzip()),(entry,content)=>{
   if(!entry.path.startsWith('package/'))return;const mapped={...entry,path:'app/node_modules/'+name+'/'+entry.path.slice(8)};
   for(const files of [runtime,tooling])mergeLayer(files,mapped,content,item.integrity);
   if(content?.subarray(0,4).toString('hex')==='7f454c46'){nativeRoots.push(mapped.path);elfFiles.push({path:mapped.path,sha256:entry.sha256,bytes:entry.size,elf:inspectElf(content)});}
 });packages.push({name,version:item.version,url:item.resolved,integrity:item.integrity,archiveSha256:hash(bytes),elfFiles});
}
save('NATIVE_ARCHIVE_PROVENANCE.json',packages);
const results=[];for(const [role,files]of[['runtime',runtime],['tooling',tooling]]){
 const roots=['nodejs/bin/node',...nativeRoots];if(role==='tooling')roots.push('busybox/busybox');
 const result=verifyClosure(files,roots);save(role+'-native-closure.json',result);results.push({role,result:result.result,roots:result.roots,elfNodes:Object.keys(result.nodes).length,errors:result.errors});
}
const expected=JSON.parse(fs.readFileSync(path.join(out,'PARENT_ADMISSION.json')));
save('STATIC_COMPATIBILITY.json',{at:new Date().toISOString(),node:expected.nodeVersion,openssl:expected.nodeOpenSSL,nodeModulesABI:expected.nodeModulesABI,results,scope:'Authenticated parent filesystem plus checksum-pinned GNU package static ELF closure; no Linux execution, codec/dlopen/DNS/TLS/CPU proof',passwd:Object.fromEntries([['runtime',runtime],['tooling',tooling]].map(([role,files])=>[role,files.get('etc/passwd')?.bytes?.toString()])),busybox:[...tooling.keys()].filter(p=>p.startsWith('busybox/')).slice(0,12)});
console.log(JSON.stringify({node:expected.nodeVersion,openssl:expected.nodeOpenSSL,results,busybox:[...tooling.keys()].filter(p=>p.startsWith('busybox/')).slice(0,8)},null,2));
if(results.some(x=>x.result!=='passed'))process.exitCode=1;
