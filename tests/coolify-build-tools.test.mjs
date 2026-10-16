import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const semver=require('next/dist/compiled/semver');
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'));
test('official pinned npm archive has matching SHA-256/SHA-512 and supports target Node',()=>{
  const metadata=read('deploy/coolify/npm-remediation-candidate.json');
  const bytes=fs.readFileSync(new URL('../vendor/build-tools/npm-11.21.1.tgz',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
  assert.equal('sha512-'+crypto.createHash('sha512').update(bytes).digest('base64'),metadata.dist.integrity);
  assert.equal(metadata.dist.tarball,'https://registry.npmjs.org/npm/-/npm-11.21.1.tgz');
  assert.ok(semver.satisfies('22.23.3',metadata.engines.node));
});
test('remediation review accounts for every current base high finding without dropping paths',()=>{
  const scan=read('docs/handoffs/ornigami-coolify-20261016/external-trial-38964204005/artifact/scans/base-trivy.json');
  const review=read('deploy/coolify/base-high-remediation-review.json');
  const key=(id,pkg,version,pkgPath)=>JSON.stringify([id,pkg,version,pkgPath??null]);
  const expected=scan.Results.flatMap(r=>(r.Vulnerabilities??[]).filter(v=>v.Severity==='HIGH').map(v=>key(v.VulnerabilityID,v.PkgName,v.InstalledVersion,v.PkgPath))).sort();
  assert.equal(expected.length,54);
  assert.deepEqual(review.findings.map(v=>key(v.id,v.package,v.installedVersion,v.pkgPath)).sort(),expected);
  assert.equal(review.debianRows,43);assert.equal(review.nodeRows,11);
  for(const row of review.findings)assert.ok(row.review.disposition);
  assert.equal(review.findings.filter(v=>v.type==='node-pkg'&&v.review.explicitPatchedVersionReported).length,10);
  assert.equal(review.findings.filter(v=>v.type==='node-pkg'&&!v.review.explicitPatchedVersionReported).length,1);
});
