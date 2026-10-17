import fs from 'node:fs';import path from 'node:path';import{createGunzip}from'node:zlib';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{inventoryTar,mergeLayer}from'./tar-inventory.mjs';import{verifyClosure}from'./elf-closure.mjs';
import{Transform}from'node:stream';
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(p,o)=>fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n');
export async function analyzeArchive(archive,out,stage,expectedImageId,policy){
  fs.mkdirSync(out);const spoolParent=fs.realpathSync(path.dirname(path.resolve(archive))),owned=fs.mkdtempSync(path.join(spoolParent,'ornigami-inspect-spool-'));fs.chmodSync(owned,0o700);const stored=new Map(),files=new Map();
  save(path.join(out,'spool-ownership.json'),{directory:owned,parent:spoolParent,uid:process.getuid?.()??null,scope:'run-owned raw layers outside evidence; never upload; cleanup after verified custody if the worker is killed'});
  const result={stage,expectedImageId,result:'failed',scope:'static archive/filesystem/package/native evidence only; no runtime acceptance'};
  try{
    await inventoryTar(fs.createReadStream(archive),(entry)=>{}, {retainELF:false,sink:entry=>{
      if(entry.type!=='0')return null;const file=path.join(owned,hash(Buffer.from(entry.path)));const fd=fs.openSync(file,'wx',0o600);stored.set(entry.path,file);return{write:data=>fs.writeSync(fd,data),end:()=>fs.closeSync(fd)};
    }});
    const manifests=JSON.parse(fs.readFileSync(stored.get('manifest.json'),'utf8'));if(manifests.length!==1)throw Error('Single-image Docker archive required');
    const configBytes=fs.readFileSync(stored.get(manifests[0].Config)),config=JSON.parse(configBytes),imageId='sha256:'+hash(configBytes);result.imageId=imageId;
    if(imageId!==expectedImageId||config.architecture!=='amd64'||config.os!=='linux')throw Error('Archive config/platform identity mismatch');
    if(config.rootfs?.diff_ids?.length!==manifests[0].Layers.length)throw Error('Image rootfs layer identity list missing');let layerNumber=0;
    for(const member of manifests[0].Layers){const file=stored.get(member);if(!file)throw Error('Image layer missing');const fd=fs.openSync(file,'r'),prefix=Buffer.alloc(2);fs.readSync(fd,prefix);fs.closeSync(fd);let stream=fs.createReadStream(file);if(prefix.toString('hex')==='1f8b')stream=stream.pipe(createGunzip());const digest=createHash('sha256');stream=stream.pipe(new Transform({transform(data,encoding,callback){digest.update(data);callback(null,data);}}));
      await inventoryTar(stream,(entry,bytes)=>mergeLayer(files,entry,bytes,member),{retain:e=>e.path.endsWith('/package.json')||e.path==='etc/passwd'||e.path==='etc/group'});
      if('sha256:'+digest.digest('hex')!==config.rootfs.diff_ids[layerNumber++])throw Error('Rootfs layer content does not match image config diff-ID');
    }
    const inventory=[...files].map(([p,v])=>({path:p,...Object.fromEntries(Object.entries(v).filter(([key])=>key!=='bytes'))}));save(path.join(out,'filesystem.json'),inventory);
    const packages=[];for(const[p,file]of files){if(p.endsWith('/package.json')&&file.bytes){const pkg=JSON.parse(file.bytes);packages.push({path:p,name:pkg.name,version:pkg.version,os:pkg.os,cpu:pkg.cpu,libc:pkg.libc,engines:pkg.engines,napi:pkg.napi,installScriptNames:Object.keys(pkg.scripts??{}).filter(x=>/install/.test(x))});}}
    save(path.join(out,'package-manifests.json'),packages);
    const roots=[...files].filter(([,file])=>file.bytes?.subarray(0,4).toString('hex')==='7f454c46').map(([p])=>p);
    const closure=verifyClosure(files,roots);save(path.join(out,'native-closure.json'),closure);if(!roots.length)throw Error('No native executable inventory');if(closure.result!=='passed')throw Error('Static native closure failed');
    if(!['buildkit','dockerfile-frontend'].includes(stage)){
      const node=files.get('nodejs/bin/node');if(node?.sha256!==policy.nodeBinarySha256)throw Error('Exact reviewed Node binary not present');
      if(['build-base','deps','builder','prod-deps'].includes(stage)&&!packages.some(p=>p.path==='opt/ornigami-npm/package.json'&&p.name==='npm'&&p.version==='11.21.1'))throw Error('Upgraded npm filesystem inventory missing');
      for(const p of packages.filter(p=>p.path.startsWith('app/node_modules/'))){for(const[key,value]of[['os','linux'],['cpu','x64'],['libc','glibc']]){const values=p[key];if(values?.includes('!'+value)||(values?.some(x=>!x.startsWith('!'))&&!values.includes(value)))throw Error('Foreign native/platform manifest installed: '+p.path);}}
    }
    if(stage==='runner'){
      if(config.config?.User!=='1000:1000')throw Error('Final UID/GID drift');
      if(!files.get('etc/passwd')?.bytes?.toString().split('\n').some(x=>/^node:x:1000:1000:/.test(x)))throw Error('Final passwd identity missing');
      if(files.get('app/.next/cache')?.uid!==1000||files.get('app/.next/cache')?.gid!==1000)throw Error('Final cache ownership missing');
      if([...files.keys()].some(p=>p.startsWith('busybox/')||p==='usr/bin/sh'||p==='bin/sh'||p.startsWith('opt/ornigami-npm/')||p.startsWith('usr/local/lib/node_modules/npm/')))throw Error('Runtime contains shell/npm tooling');
    }
    result.files=inventory.length;result.packages=packages.length;result.nativeFiles=roots.length;result.nativePaths=roots.sort();result.hasOsPackageDatabase=inventory.some(p=>/^(?:var\/lib\/dpkg\/status(?:\.d\/.*)?|lib\/apk\/db\/installed)$/.test(p.path));result.result='passed';
  }catch(error){result.error=error.message;}
  finally{save(path.join(out,'result.json'),result);const actual=fs.realpathSync(owned);if(path.dirname(actual)!==spoolParent||!path.basename(actual).startsWith('ornigami-inspect-spool-'))throw Error('Refusing cleanup outside owned spool parent');fs.rmSync(actual,{recursive:true,force:true});}
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const[, ,archive,out,stage,imageId]=process.argv;const policy=JSON.parse(fs.readFileSync(new URL('./minimal-parent-policy.json',import.meta.url)));const result=await analyzeArchive(archive,out,stage,imageId,policy);console.log(JSON.stringify(result));process.exitCode=result.result==='passed'?0:1;}catch(error){console.error(error.message);process.exitCode=1;}
}
