import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {retainAndAcknowledge} from '../scripts/framework-prototype/retain-external-evidence.mjs';
const owner='joserubiobejarano',repo=owner+'/Ornigami',sha='a'.repeat(40),bytes=Buffer.from('fictional local evidence archive');
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
function scenario(changes={}) {
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ornigami-evidence-'));
  const output=path.join(parent,'receipt');const posts=[];
  const options={runId:'123',attempt:'1',requestSha:sha,artifactId:'456',digest,output,acknowledge:true,...changes.options};
  const api=(endpoint,body)=>{
    if(body){
      assert.equal(fs.existsSync(path.join(output,'DOWNLOAD_RECEIPT.json')),true,'Local durable receipt precedes remote acknowledgment');
      assert.deepEqual(fs.readFileSync(path.join(output,'evidence.zip')),bytes);
      posts.push(body);return Buffer.from(JSON.stringify({...body,creator:{login:owner}}));
    }
    if(endpoint==='user')return Buffer.from(JSON.stringify({login:changes.owner??owner}));
    if(endpoint.endsWith('/zip'))return changes.bytes??bytes;
    if(endpoint.includes('/actions/artifacts/'))return Buffer.from(JSON.stringify({expired:false,workflow_run:{id:changes.runId??123,head_sha:sha}}));
    return Buffer.from(JSON.stringify({run_attempt:1,head_sha:changes.sha??sha,head_branch:'codex/ornigami-sri-local-prototype-f-20261016',event:'push',repository:{full_name:repo}}));
  };
  return {options,api,posts,cleanup:()=>{
    const resolved=path.resolve(parent);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(resolved).startsWith('ornigami-evidence-'));
    fs.rmSync(resolved,{recursive:true,force:true});
  }};
}
test('positive receipt is posted only after checksum-verified durable local custody',()=>{
  const s=scenario();try{const receipt=retainAndAcknowledge(s.options,s.api);assert.equal(receipt.sha256,digest);assert.equal(s.posts.length,1);}finally{s.cleanup();}
});
for(const [name,changes] of [['wrong owner',{owner:'other'}],['wrong source',{sha:'b'.repeat(40)}],['wrong run',{runId:999}],['corrupt archive',{bytes:Buffer.from('corrupted')}],['no acknowledgment approval',{options:{acknowledge:false}}]]) {
  test(`${name} never posts a remote status`,()=>{const s=scenario(changes);try{assert.throws(()=>retainAndAcknowledge(s.options,s.api));assert.equal(s.posts.length,0);}finally{s.cleanup();}});
}
