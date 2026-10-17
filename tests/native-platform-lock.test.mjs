import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import os from'node:os';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{createRequire}from'node:module';
const source=path.resolve('.'),policy=JSON.parse(fs.readFileSync('scripts/framework-prototype/native-platform-policy.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));
test('only integrity-proven libc metadata changed; dependency and framework identities are preserved',()=>{
  const old=JSON.parse(execFileSync('git',['show','25b536d833bf99b02d87b807ac17fdf9d53e5575:package-lock.json'],{maxBuffer:2*1024*1024}));
  for(const entry of policy.entries){const p=lock.packages[entry.path];assert.equal(p.version,entry.version);assert.equal(p.integrity,entry.integrity);assert.equal(p.resolved,entry.url);if(entry.libc)old.packages[entry.path].libc=entry.libc;}
  assert.deepEqual(lock,old);assert.equal(policy.metadataChanges.length,15);assert.equal(createHash('sha256').update(fs.readFileSync('package-lock.json','utf8').replace(/\r\n/g,'\n')).digest('hex'),policy.updatedLockSha256);
  assert.equal(createHash('sha256').update(fs.readFileSync('vendor/framework/next-16.4.2-ornigami-sri.2.tgz')).digest('hex'),'ba4c69f53cedf4a3ea0221666bfe0c62c4db86cbb6869025aa1c6c04dcfff17f');
});
test('pinned npm Arborist virtual tree retains libc and rejects musl before installation',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-npm-platform-'));try{
    const archive=path.join(source,'vendor/build-tools/npm-11.21.1.tgz');assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b');
    execFileSync('tar',['-xzf',archive,'-C',root]);const require=createRequire(path.join(root,'package/package.json'));const Arborist=require('@npmcli/arborist'),{checkPlatform}=require('npm-install-checks');
    const tree=await new Arborist({path:source,ignoreScripts:true,offline:true}).loadVirtual();let gnu=0,musl=0;
    for(const entry of policy.entries){const node=[...tree.inventory.values()].find(n=>n.location===entry.path);assert.ok(node,entry.path);assert.deepEqual(node.package.libc,entry.libc);
      if(entry.libc?.includes('musl')){assert.throws(()=>checkPlatform(node.package,false,{os:'linux',cpu:'x64',libc:'glibc'}),{code:'EBADPLATFORM'});musl++;}else{checkPlatform(node.package,false,{os:'linux',cpu:'x64',libc:'glibc'});gnu++;}}
    assert.equal(gnu,9);assert.equal(musl,7);assert.equal(fs.existsSync(path.join(source,'node_modules')),false,'Virtual-tree test must not install dependencies');
  }finally{const absolute=fs.realpathSync(root);assert.ok(absolute.startsWith(fs.realpathSync(os.tmpdir())+path.sep+'ornigami-npm-platform-'));fs.rmSync(absolute,{recursive:true,force:true});}
});
