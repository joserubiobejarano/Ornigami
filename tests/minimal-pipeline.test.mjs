import test from'node:test';import assert from'node:assert/strict';import{aggregate,rejectReexecution,cachedTargetRun,remainingSeconds,validateBuilderObservation}from'../scripts/framework-prototype/serial-scan-driver.mjs';import{requiredStages}from'../scripts/framework-prototype/scan-image-stages.mjs';
test('all nine distinct parent/intermediate/final/tool roles are required independently',()=>{
  assert.equal(requiredStages.length,9);const complete=requiredStages.map(stage=>({stage,result:'passed'}));assert.equal(aggregate(complete).result,'passed');
  for(const missing of requiredStages){const result=aggregate(complete.filter(x=>x.stage!==missing));assert.equal(result.result,'failed');assert.equal(result.stages.find(x=>x.stage===missing).result,'skipped');}
  assert.equal(aggregate(complete.map(x=>x.stage==='build-base'?{...x,result:'failed-security-or-coverage'}:x)).result,'failed');
});
test('cached target export rejects a started uncached RUN instead of retrying compilation',()=>{
  assert.equal(rejectReexecution({vertexes:[{name:'[builder 3/3] RUN npm run build',started:'now',cached:false}]}),true);
  assert.equal(rejectReexecution({name:'[deps 1/1] RUN npm ci',started:'now',cached:true}),false);
  assert.equal(rejectReexecution({name:'[internal] load context',started:'now',cached:false}),false);
  assert.equal(cachedTargetRun({name:'[builder 2/2] RUN npm run build',cached:true},'builder'),true);
  assert.equal(cachedTargetRun({name:'[deps 2/2] RUN npm ci',cached:true},'builder'),false);
  assert.equal(cachedTargetRun({status:'unknown progress schema'},'builder'),false);
});
test('work deadline cannot be missing, exhausted or extended by an invalid value',()=>{assert.throws(()=>remainingSeconds(undefined),/deadline/);assert.throws(()=>remainingSeconds(1),/deadline/);assert.ok(remainingSeconds(Math.floor(Date.now()/1000)+60)<=60);});
const valid={final:true,exit:0,metrics:'==memory.max==\n8589934592\n==memory.swap.max==\n0\n==cpu.max==\n300000 100000\n==memory.events==\nmax 3\noom 0\noom_kill 0\noom_group_kill 0\n==cpu.stat==\nusage_usec 1\n'};
test('final observer enforces original limits and OOM counters; pressure is not headroom',()=>{assert.equal(validateBuilderObservation(valid),true);for(const changed of [{...valid,final:false},{...valid,exit:1},{...valid,metrics:valid.metrics.replace('8589934592','17179869184')},{...valid,metrics:valid.metrics.replace('oom_kill 0','oom_kill 1')}])assert.throws(()=>validateBuilderObservation(changed));});
