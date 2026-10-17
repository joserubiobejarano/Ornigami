import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import{execFileSync,spawnSync}from'node:child_process';import{createHash}from'node:crypto';
test('minimal image PATH selects npm JS shim instead of vendored Bash launcher; real pinned CLI boots offline',()=>{
 const archive=path.resolve('vendor/build-tools/npm-11.21.1.tgz');assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-npm-bootstrap-'));
 try{
  const npmDir=path.join(root,'opt/ornigami-npm'),shimDir=path.join(root,'usr/local/bin');fs.mkdirSync(npmDir,{recursive:true});fs.mkdirSync(shimDir,{recursive:true});
  execFileSync('tar',['-xzf',archive,'--strip-components=1','-C',npmDir],{timeout:15000,windowsHide:true});
  const cli=path.join(npmDir,'bin/npm-cli.js');assert.equal(fs.readFileSync(path.join(npmDir,'bin/npm'),'utf8').split(/\r?\n/)[0],'#!/usr/bin/env bash');
  // A hardlink suffices to exercise real shell lookup; no shim is executed or
  // substituted for the CLI route. CLI execution below uses the original file.
  fs.linkSync(cli,path.join(shimDir,'npm'));
  const dockerfile=fs.readFileSync('Dockerfile','utf8'),configured=dockerfile.match(/^ENV PATH=([^\s]+)/m)[1];
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  const unix=p=>process.platform==='win32'?'/'+p[0].toLowerCase()+p.slice(2).replaceAll('\\','/'):p;
  const mapped=configured.split(':').map(p=>unix(path.join(root,p))).join(':');
  const lookup=p=>execFileSync(bash,['-c','PATH="$NPM_LOOKUP_PATH" command -v npm'],{env:{...process.env,NPM_LOOKUP_PATH:p},encoding:'utf8',timeout:10000}).trim();
  assert.equal(lookup(unix(path.join(npmDir,'bin'))+':'+mapped),unix(path.join(npmDir,'bin/npm')),'historical PATH shadows the JS shim with Bash launcher');
  assert.equal(lookup(mapped),unix(path.join(shimDir,'npm')),'actual Dockerfile PATH must select JS shim');
  assert.equal(fs.readFileSync(path.join(shimDir,'npm'),'utf8').split(/\r?\n/)[0],'#!/usr/bin/env node');
  const result=spawnSync(process.execPath,['--max-old-space-size=512',cli,'--offline','--ignore-scripts','--version'],{env:{...process.env,PATH:mapped},encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'11.21.1');
 }finally{
  assert.equal(path.dirname(fs.realpathSync(root)),fs.realpathSync(os.tmpdir()));assert.ok(path.basename(root).startsWith('ornigami-npm-bootstrap-'));fs.rmSync(root,{recursive:true,force:true});
 }
});
