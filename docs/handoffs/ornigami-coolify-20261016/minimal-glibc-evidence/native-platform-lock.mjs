import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';import{createGunzip}from'node:zlib';import{pipeline}from'node:stream/promises';
import{inventoryTar}from'../framework-prototype/ornigami-minimal-glibc-feasibility/scripts/framework-prototype/tar-inventory.mjs';
const source=path.resolve('.local/framework-prototype/ornigami-minimal-glibc-feasibility'),out=path.resolve('.local/minimal-glibc-20261017'),file=path.join(source,'package-lock.json');
const text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),lock=JSON.parse(text),entries=[],changes=[];
for(const[p,item]of Object.entries(lock.packages).filter(([,p])=>p.os?.includes('linux')&&p.cpu?.includes('x64'))){
 const name=p.replace(/^node_modules\//,''),archive=path.join(out,name.replaceAll('/','-').replace('@','')+'-'+item.version+'.tgz');
 if(!fs.existsSync(archive)){const r=await fetch(item.resolved);if(!r.ok)throw Error('Native archive fetch failed: '+name);await pipeline(r.body,fs.createWriteStream(archive,{flags:'wx'}));}
 const bytes=fs.readFileSync(archive),integrity='sha512-'+crypto.createHash('sha512').update(bytes).digest('base64');if(integrity!==item.integrity)throw Error('Archive integrity mismatch');
 let manifest;await inventoryTar(fs.createReadStream(archive).pipe(createGunzip()),(entry,data)=>{if(entry.path==='package/package.json')manifest=JSON.parse(data);},{retain:e=>e.path==='package/package.json',retainELF:false});
 if(manifest?.name!==name||manifest.version!==item.version)throw Error('Native manifest identity mismatch');
 entries.push({path:p,name,version:item.version,url:item.resolved,integrity:item.integrity,archiveSha256:crypto.createHash('sha256').update(bytes).digest('hex'),os:manifest.os,cpu:manifest.cpu,...(manifest.libc?{libc:manifest.libc}:{})});
 if(manifest.libc){if(item.libc&&JSON.stringify(item.libc)!==JSON.stringify(manifest.libc))throw Error('Existing libc metadata differs');if(!item.libc){item.libc=manifest.libc;changes.push(p);}}
}
const indentation=text.match(/^ +(?! )/m)?.[0].length??2;const updated=JSON.stringify(lock,null,indentation)+'\n';
const proof={schema:1,scope:'Linux x64 optional native package platform metadata from integrity-verified official package archives; no version/resolved/integrity changes or removals',entries,metadataChanges:changes,originalLockSha256:crypto.createHash('sha256').update(text).digest('hex'),updatedLockSha256:crypto.createHash('sha256').update(updated).digest('hex')};
fs.writeFileSync(path.join(out,'NATIVE_PLATFORM_LOCK.json'),JSON.stringify(proof,null,2)+'\n');fs.writeFileSync(path.join(source,'scripts/framework-prototype/native-platform-policy.json'),JSON.stringify(proof,null,2)+'\n');fs.writeFileSync(file,updated);
console.log(JSON.stringify({packages:entries.length,metadataChanged:changes.length,old:proof.originalLockSha256,new:proof.updatedLockSha256,libc:entries.map(x=>({name:x.name,libc:x.libc}))},null,2));
