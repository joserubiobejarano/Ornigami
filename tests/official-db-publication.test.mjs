import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {officialPublication,verifyPublication} from '../scripts/framework-prototype/official-db-publication.mjs';
test('official manifest binds exact publication and layer without granting coverage acceptance',()=>{
  const p=officialPublication();
  assert.equal(p.manifestBytes,616);
  assert.equal(p.manifest.layers[0].size,134666882);
  assert.match(p.coverage,/HOLD.*CVE-2026-111142/);
  assert.equal(p.publisherRun,39056570786);
});
test('changed manifest bytes fail before a download can be selected',()=>{
  const b=fs.readFileSync(new URL('../scripts/framework-prototype/official-db-manifest.json',import.meta.url));
  assert.throws(()=>verifyPublication(Buffer.concat([b,Buffer.from('\n')])),/digest mismatch/);
});
test('real CLI records exact source before yielding a single immutable repository; refuses replay',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-publication-'));
  try{
    const receipt=path.join(root,'publication.json'),source='a'.repeat(40),cli=path.resolve('scripts/framework-prototype/official-db-publication.mjs');
    const invoke=(sha)=>spawnSync(process.execPath,['--max-old-space-size=512',cli,sha,receipt],{encoding:'utf8',timeout:10000});
    assert.notEqual(invoke('invalid').status,0);assert.equal(fs.existsSync(receipt),false);
    const result=invoke(source);assert.equal(result.status,0,result.stderr);
    const raw=fs.readFileSync(receipt),p=JSON.parse(raw);
    assert.equal(p.sourceSha,source);assert.equal(result.stdout.trim(),p.repository);
    assert.match(result.stdout,/^ghcr\.io\/aquasecurity\/trivy-db@sha256:[a-f0-9]{64}\r?\n$/);
    assert.notEqual(invoke('b'.repeat(40)).status,0);assert.deepEqual(fs.readFileSync(receipt),raw);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
