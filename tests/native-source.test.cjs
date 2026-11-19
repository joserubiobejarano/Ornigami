/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const {resolve}=require('node:path');
test('native delegation and normal bridge are qualified without external OS calls',()=>{
  const preload=['scripts/support/native-fixtures.cjs','scripts/support/offline-guard.cjs'].map(p=>'--require='+JSON.stringify(resolve(p))).join(' ');
  const run=spawnSync(process.execPath,['--experimental-strip-types','tests/support/native-source-contract.mts'],{encoding:'utf8',timeout:20000,env:{...process.env,NODE_OPTIONS:preload}});
  assert.equal(run.status,0,run.stderr||String(run.error));assert.equal(JSON.parse(run.stdout).physicalExternalOSCalls,0);
});
