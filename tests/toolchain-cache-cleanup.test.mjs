import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compilerIdentity,compilerCacheCleanupArguments,finishOwnedToolRoot} from '../scripts/framework-prototype/toolchain-build.mjs';
test('compiler cannot create host bind-cache files as root or accept an ambiguous cleanup identity',()=>{
  assert.equal(compilerIdentity(1001,1001),'1001:1001');for(const ids of [[0,1001],[1001,0],[-1,1],[1,NaN]])assert.throws(()=>compilerIdentity(...ids),/Non-root/);
  assert.throws(()=>compilerCacheCleanupArguments('compiler-name'),/Exact owned/);
  assert.deepEqual(compilerCacheCleanupArguments('a'.repeat(64)),['exec','--env','GOMODCACHE=/cache/mod','--env','GOCACHE=/cache/build','--env','GOENV=off','--env','GOTOOLCHAIN=local','a'.repeat(64),'go','clean','-modcache']);
});
function fixture(t){const temp=fs.realpathSync(os.tmpdir()),base=fs.mkdtempSync(path.join(temp,'ornigami-cleanup-receipt-')),root=path.join(base,'owned'),evidence=path.join(base,'evidence');fs.mkdirSync(root);fs.mkdirSync(evidence);t.after(()=>{const actual=fs.realpathSync(base);assert.equal(path.dirname(actual),temp);assert.ok(path.basename(actual).startsWith('ornigami-cleanup-receipt-'));fs.rmSync(actual,{recursive:true,force:true});});return {root,evidence};}
const removed=[{id:'a'.repeat(64),result:'removed exact owned container',absenceVerified:true}];
test('root permission failure preserves removal read-backs before and after exception',t=>{
  const f=fixture(t),file=path.join(f.evidence,'cleanup.json');
  const result=finishOwnedToolRoot(f.root,f.evidence,'b'.repeat(40),removed,{remove(){assert.deepEqual(JSON.parse(fs.readFileSync(file)).results,removed);throw Error('EACCES fixture');}});
  assert.equal(result.result,'failed');assert.equal(result.ownedRootRemoved,false);assert.match(result.rootRemovalError,/EACCES/);assert.deepEqual(JSON.parse(fs.readFileSync(file)),result);assert.ok(fs.existsSync(f.root));
});
test('unverified resource absence prevents root deletion and remains a failed receipt',t=>{
  const f=fixture(t);let called=false;const result=finishOwnedToolRoot(f.root,f.evidence,'b'.repeat(40),[{result:'inventory unavailable'}],{remove(){called=true;}});assert.equal(called,false);assert.equal(result.result,'failed');assert.equal(result.ownedRootRemoved,false);
});
test('successful exact root removal is independently read back',t=>{
  const f=fixture(t),result=finishOwnedToolRoot(f.root,f.evidence,'b'.repeat(40),removed);assert.equal(result.result,'passed');assert.equal(result.ownedRootRemoved,true);assert.equal(fs.existsSync(f.root),false);
});
