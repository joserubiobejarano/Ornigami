import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { scanStages, scanOneStage, requiredStages } from '../scripts/framework-prototype/scan-image-stages.mjs';
import {admitFrozenDatabase} from '../scripts/framework-prototype/frozen-db-admission.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');

async function fixture(callback, modes = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ornigami-stage-scan-'));
  try {
    const sourceSha = 'a'.repeat(40), scanner = join(root, 'trivy-fixture'); writeFileSync(scanner, 'fake scanner, never executed');
    mkdirSync(join(root, 'cache/db'), { recursive: true }); writeFileSync(join(root, 'cache/db/metadata.json'), JSON.stringify({Version:2,UpdatedAt:new Date(Date.now()-3600000).toISOString(),NextUpdate:new Date(Date.now()+3600000).toISOString()})); writeFileSync(join(root, 'cache/db/trivy.db'), 'fixture database');
    const config = JSON.stringify({ architecture: 'amd64', os: 'linux', config: { Labels: { 'org.opencontainers.image.revision': sourceSha } } });
    const imageId = 'sha256:' + sha(config), configName = sha(config) + '.json';
    const plan = { schema: 1, sourceSha, trivy: { path: scanner, sha256: sha(readFileSync(scanner)), cacheDirectory: join(root, 'cache') }, images: requiredStages.map(stage => {
      const archive = join(root, stage + '.tar'); writeFileSync(archive, 'fixture archive ' + stage);
      return { stage, archive, archiveSha256: sha(readFileSync(archive)), imageId };
    }) };
    const calls = [];
    const admissionDirectory=join(root,'admission');
    assert.equal((await admitFrozenDatabase({cacheDirectory:plan.trivy.cacheDirectory,outputDirectory:admissionDirectory,sourceSha,scannerPath:scanner,scannerSha256:plan.trivy.sha256})).result,'passed');
    plan.trivy.admissionDirectory=admissionDirectory;plan.trivy.admissionSha256=sha(readFileSync(join(admissionDirectory,'index.json')));
    const invoke = (command, args, options) => {
      if (command === 'tar') return { status: 0, stdout: args.at(-1) === 'manifest.json' ? JSON.stringify([{ Config: configName }]) : config };
      assert.equal(command, scanner); calls.push({ args, options });
      const reportPath = args[args.indexOf('--output') + 1], stage = basename(dirname(reportPath));
      if (modes.error === stage) return { status: 17, stderr: 'fictional scanner failure' };
      const packages = [{ Name: 'libc6', Version: '2.41' }];
      const npmPackages = modes.missingNpm === stage ? [] : [{ Name: 'npm', Version: '11.21.1', FilePath: 'opt/ornigami-npm/package.json' }, { Name: 'http-cache-semantics', Version: '4.3.0', FilePath: 'opt/ornigami-npm/node_modules/http-cache-semantics/package.json' }];
      const report = {SchemaVersion:2,ArtifactType:'container_image',Metadata:{ImageID:modes.wrongImage===stage?'sha256:'+'0'.repeat(64):imageId}, Results: modes.scratch===stage?[{Class:'lang-pkgs',Type:'gobinary',Target:'bin/frontend',Packages:[{Name:'stdlib',Version:'go1.25.3'}],Vulnerabilities:modes.high?.includes(stage)?[{Severity:'HIGH',VulnerabilityID:'fixture-go-CVE'}]:[]}]:[{ Class: 'os-pkgs', Type: 'debian', Packages: modes.noOs === stage ? [] : packages, Vulnerabilities: modes.high?.includes(stage) ? [{ Severity: 'HIGH', PkgName: 'libc6', VulnerabilityID: 'fixture-CVE' }] : [] }, { Class: 'lang-pkgs', Type: 'node-pkg', Packages: npmPackages, Vulnerabilities: [] }] };
      writeFileSync(reportPath, JSON.stringify(report));
      if (modes.mutateDb) writeFileSync(join(root, 'cache/db/trivy.db'), 'changed');
      return { status: 0, stdout: 'fictional scanner success' };
    };
    await callback({ root, plan, invoke, calls, output: join(root, 'results') });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('all nine stages retain complete inventories and explicit unchanged scan coverage', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'passed'); assert.equal(result.stages.length, 9); assert.equal(f.calls.length, 9);
  for (const call of f.calls) {
    for (const flag of ['--list-all-pkgs', '--ignore-unfixed=false', '--skip-db-update']) assert.ok(call.args.includes(flag));
    assert.equal(call.args[call.args.indexOf('--pkg-types') + 1], 'os,library');
    assert.equal(call.args[call.args.indexOf('--severity') + 1], 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL');
    assert.equal(readFileSync(call.args[call.args.indexOf('--ignorefile') + 1], 'utf8'), '');
    assert.ok(Object.keys(call.options.env).every(k => !k.startsWith('TRIVY_')));
  }
  assert.equal(result.stages.find(s => s.stage === 'build-base').upgradedNpmPackageCount, 2);
  const inventory = JSON.parse(readFileSync(join(f.output, 'builder/package-inventory.json'), 'utf8'));
  assert.ok(inventory.some(p => p.Name === 'http-cache-semantics'));
}));

test('base/final highs fail independently while every tooling stage is still scanned', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'failed'); assert.equal(f.calls.length, 9);
  for (const stage of ['original-base', 'runner']) assert.equal(result.stages.find(s => s.stage === stage).result, 'failed-security-threshold');
}, { high: ['original-base', 'runner'] }));

test('scanner error preserves exact exit/log and later stage results', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'failed'); assert.equal(f.calls.length, 9);
  assert.equal(result.stages.find(s => s.stage === 'builder').scannerExit, 17);
  assert.match(readFileSync(join(f.output, 'builder/scanner.log'), 'utf8'), /fictional scanner failure/);
  assert.equal(result.stages.at(-1).result, 'passed');
}, { error: 'builder' }));

test('missing upgraded npm is a coverage failure, not a zero-finding pass', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'failed'); assert.match(result.stages.find(s => s.stage === 'build-base').error, /npm/);
}, { missingNpm: 'build-base' }));

test('absent OS inventory cannot pass as a clean image', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'failed'); assert.match(result.stages.find(s => s.stage === 'runner').error, /OS package/);
}, { noOs: 'runner' }));

test('identity mismatch fails that stage while preserving other scans', () => fixture(async f => {
  f.plan.images[0].archiveSha256 = '0'.repeat(64);
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.result, 'failed'); assert.match(result.stages[0].error, /checksum mismatch/); assert.equal(f.calls.length, 8);
}));

test('missing stage rejects an incomplete plan before scanning', () => fixture(async f => {
  f.plan.images.pop(); await assert.rejects(scanStages(f.plan, f.root, f.output, f.invoke), /nine/); assert.equal(f.calls.length, 0);
}));

test('database drift fails even when every fake scan reports zero findings', () => fixture(async f => {
  const result = await scanStages(f.plan, f.root, f.output, f.invoke);
  assert.equal(result.databaseChanged, true); assert.equal(result.result, 'failed');assert.equal(f.calls.length,1);assert.equal(result.stages.filter(x=>x.result==='skipped').length,8);
}, { mutateDb: true }));

test('historical output destination is never overwritten', () => fixture(async f => {
  mkdirSync(f.output); writeFileSync(join(f.output, 'sentinel'), 'preserve');
  await assert.rejects(scanStages(f.plan, f.root, f.output, f.invoke), /exist/i);
  assert.equal(readFileSync(join(f.output, 'sentinel'), 'utf8'), 'preserve');
}));

test('replacing admitted metadata with expired metadata fails frozen identity before scans', () => fixture(async f => {
  writeFileSync(join(f.root, 'cache/db/metadata.json'), JSON.stringify({UpdatedAt:'2020-01-01',NextUpdate:'2020-01-02'}));
  await assert.rejects(scanStages(f.plan, f.root, f.output, f.invoke), /metadata identity drift/); assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(readFileSync(join(f.output,'index.json'))).prerequisiteFailure,true);
}));

test('an additional runtime parent is scanned and cannot silently escape its high gate', () => fixture(async f => {
  f.plan.images.push({...f.plan.images[0], stage:'supplemental-parent'});
  const result=await scanStages(f.plan,f.root,f.output,f.invoke);
  assert.equal(result.stages.length,10);assert.equal(f.calls.length,10);assert.equal(result.result,'failed');
  assert.equal(result.stages.at(-1).result,'failed-security-threshold');
}, {high:['supplemental-parent']}));

test('scanner image identity mismatch is not accepted as a clean report',()=>fixture(async f=>{const result=await scanStages(f.plan,f.root,f.output,f.invoke);assert.equal(result.result,'failed');assert.match(result.stages.find(x=>x.stage==='runner').error,/identity mismatch/);},{wrongImage:'runner'}));
test('explicit single-stage collection remains partial and cannot claim aggregate coverage',()=>fixture(async f=>{f.plan.images=f.plan.images.filter(x=>x.stage==='build-base');const result=await scanOneStage(f.plan,f.root,f.output,f.invoke);assert.equal(result.result,'passed');assert.match(result.mode,/partial-single-stage/);assert.equal(result.stages.length,1);}));
for(const unmatched of [false,true])test(`bare-Go frontend requires hash-bound complete native coverage (${unmatched?'unmatched ELF fails':'matching targets retain highs'})`,()=>fixture(async f=>{
 const image=f.plan.images.find(x=>x.stage==='dockerfile-frontend'),receipt=join(f.root,'frontend-filesystem.json');writeFileSync(receipt,JSON.stringify({result:'passed',imageId:image.imageId,hasOsPackageDatabase:false,nativeFiles:unmatched?2:1,nativePaths:unmatched?['bin/frontend','bin/unknown-c']:['bin/frontend']}));image.filesystemReceipt=receipt;image.filesystemReceiptSha256=sha(readFileSync(receipt));
 const result=await scanStages(f.plan,f.root,f.output,f.invoke);assert.equal(result.result,'failed');const entry=result.stages.find(x=>x.stage==='dockerfile-frontend');if(unmatched)assert.match(entry.error,/OS package inventory/);else{assert.equal(entry.result,'failed-security-threshold');assert.equal(entry.counts.HIGH,1);assert.match(entry.osCoverage,/No OS database/);}
},{scratch:'dockerfile-frontend',high:['dockerfile-frontend']}));
