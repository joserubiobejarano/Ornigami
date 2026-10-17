// Isolated, incremental source rebuild. The verified official tarball supplies
// unchanged assets/types; modified TS and actual production renderers are built.
// This is not a claim to reproduce all of upstream's release pipeline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const [upstreamArg, officialTarArg, workArg, outputArg] = process.argv.slice(2);
assert.ok(outputArg, 'Usage: build-package.mjs UPSTREAM OFFICIAL_TARBALL WORK OUTPUT');
const upstream = path.resolve(upstreamArg), work = path.resolve(workArg), output = path.resolve(outputArg);
const next = path.join(upstream, 'packages/next');
const scripts = path.dirname(fileURLToPath(import.meta.url));
const recipeBytes = fs.readFileSync(fileURLToPath(import.meta.url));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const command = (exe, args, cwd = upstream) => {
  const result = spawnSync(exe, args, {cwd, stdio: 'inherit', env: process.env, windowsHide: true});
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Command failed: ${args.join(' ')}`);
};
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: upstream, encoding:'utf8'});
assert.equal(gitHead.stdout.trim(), '2864b1772c37242a9b40ab4d366eb7d368c2a070');
const patchPaths = ['packages/next/src', 'packages/next/next-runtime.webpack-config.js'];
const modified = spawnSync('git',['diff','HEAD','--name-only','--',...patchPaths],{cwd:upstream,encoding:'utf8'});
assert.equal(modified.status,0);
for (const relative of modified.stdout.trim().split('\n').filter(Boolean)) {
  assert.match(relative,/^(?:packages\/next\/src\/.+\.(?:ts|tsx|js)|packages\/next\/next-runtime\.webpack-config\.js)$/);
  const file = path.join(upstream,relative);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
}
const sourcePatch = spawnSync('git', ['diff', 'HEAD', '--binary', '--', ...patchPaths], {cwd:upstream, maxBuffer:4*1024*1024});
assert.equal(sourcePatch.status, 0);
assert.deepEqual(sourcePatch.stdout, fs.readFileSync(path.join(scripts,'next-16.4.2-sri.patch')), 'Actual full source patch must match reviewable input');
assert.equal(fs.readFileSync(path.join(next,'next-runtime.webpack-config.js'),'utf8'), fs.readFileSync(path.join(scripts,'overlay/next-runtime.webpack-config.js.source'),'utf8'), 'VM-tested build configuration must match production source');
const official = fs.readFileSync(officialTarArg);
assert.equal(sha(official), '44ad2c420d30f7d1a8e4c511759c57eb40ccbbc36213a1bf32b1698bcebd3a1d');
const lock = spawnSync('git', ['show', 'HEAD:pnpm-lock.yaml'], {cwd: upstream, maxBuffer: 4*1024*1024});
assert.equal(sha(lock.stdout), '69dfbd54a513cdcd94aca9ea0c83f7ba3803518372b90184a7d6a3b7103621c6');
// Dependency installation is a separate frozen, script-disabled bounded step.
const require = createRequire(path.join(next, 'package.json'));
const tar = require('tar');
assert.ok(!fs.existsSync(work), 'Each package build must use a new work directory');
fs.mkdirSync(work, {recursive: true});
const seed = path.join(work, 'official');
fs.mkdirSync(seed);
await tar.x({file: path.resolve(officialTarArg), cwd: seed, strip:1});
// Clear only disposable generated dist within the verified isolated source.
assert.ok(next.startsWith(upstream + path.sep));
fs.rmSync(path.join(next, 'dist'), {recursive:true, force:true});
fs.cpSync(path.join(seed, 'dist'), path.join(next, 'dist'), {recursive:true});
// These are readable, tracked Next-vendored RSC emitters, not opaque runtime
// string replacements. Carry their reviewed source changes into both consumers.
for (const channel of ['react-server-dom-webpack','react-server-dom-webpack-experimental']) {
  for (const runtime of ['edge','node']) {
    const relative = `compiled/${channel}/cjs/react-server-dom-webpack-client.${runtime}.production.js`;
    fs.copyFileSync(path.join(next,'src',relative),path.join(next,'dist',relative));
  }
}
const taskr = require.resolve('taskr/cli.js');
for (const task of ['server', 'server_esm', 'nextbuild', 'nextbuild_esm',
  'next_bundle_app_prod', 'next_bundle_app_prod_experimental',
  'next_bundle_app_prod_turbo', 'next_bundle_app_prod_turbo_experimental']) {
  console.log(`SOURCE_BUILD_TARGET ${task}`);
  command(process.execPath, [taskr, task], next);
}
fs.cpSync(path.join(next, 'dist'), path.join(seed, 'dist'), {recursive:true});
command(process.execPath, [path.join(scripts,'check-package-portability.mjs'),seed]);
const patch = spawnSync('git', ['diff', 'HEAD', '--binary', '--', ...patchPaths], {cwd:upstream, maxBuffer:4*1024*1024});
assert.equal(patch.status, 0);
const provenance = {
  distribution:'ornigami-sri.2-experiment', internalVersion:'16.4.2',
  upstreamCommit:gitHead.stdout.trim(), officialPackageSha256:sha(official),
  upstreamLockSha256:sha(lock.stdout), patchSha256:sha(patch.stdout),
  node:process.version, platform:process.platform, arch:process.arch,
  builderSha256:sha(recipeBytes),
  packerSha256:sha(fs.readFileSync(path.join(scripts,'deterministic-pack.py'))),
  runtimeBuildConfigSha256:sha(fs.readFileSync(path.join(next,'next-runtime.webpack-config.js'))),
  portabilityCheckerSha256:sha(fs.readFileSync(path.join(scripts,'check-package-portability.mjs'))),
  patchedSourceLineEndings:'LF',
  buildMode:'Official verified package seed; source TS server/build outputs and four production App Router bundles rebuilt serially. Unchanged assets and declarations retained.',
  adopted:false, maintenanceOwners:'unassigned',
};
fs.writeFileSync(path.join(seed,'ORNIGAMI_PROVENANCE.json'),JSON.stringify(provenance,null,2)+'\n');
// Deterministic standard-library tar/gzip: sorted paths, fixed modes, epoch 0.
assert.deepEqual(fs.readFileSync(fileURLToPath(import.meta.url)),recipeBytes,'Recipe changed during build; refuse ambiguous provenance');
fs.mkdirSync(path.dirname(output),{recursive:true});
command('python', [path.join(scripts, 'deterministic-pack.py'), seed, output]);
const bytes = fs.readFileSync(output);
fs.writeFileSync(output+'.identity.json',JSON.stringify({...provenance, bytes:bytes.length, sha256:sha(bytes), integrity:'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')},null,2)+'\n');
console.log(`PACKAGE_SHA256 ${sha(bytes)}`);
