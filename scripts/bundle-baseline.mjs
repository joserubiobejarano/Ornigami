import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Inspect the same Webpack artifacts used by npm run build. This is an asset
// inventory, not a substitute for an authenticated browser's loaded resources.
const buildRoot = resolve('.next');
const routes = JSON.parse(readFileSync(join(buildRoot, 'app-path-routes-manifest.json'), 'utf8'));
const main = JSON.parse(readFileSync(join(buildRoot, 'build-manifest.json'), 'utf8'));
function asset(path) {
  const file = resolve(buildRoot, path);
  if (!file.startsWith(buildRoot + sep) || !path.startsWith('static/')) throw new Error('Invalid asset path');
  const body = readFileSync(file);
  return { path, bytes: body.length, gzipBytes: gzipSync(body).length, sha256: createHash('sha256').update(body).digest('hex') };
}
const rows = [];
for (const route of ['/dashboard', '/dashboard/agents/review-booster', '/settings', '/reviews']) {
  const internal = Object.keys(routes).find((key) => routes[key] === route && key.endsWith('/page'));
  if (!internal) throw new Error('Missing route manifest');
  const source = readFileSync(join(buildRoot, 'server/app', internal + '_client-reference-manifest.js'), 'utf8');
  const match = source.match(/globalThis\.__RSC_MANIFEST\["[^"]+"\]=(\{[\s\S]*\});?\s*$/);
  if (!match) throw new Error('Unsupported client reference manifest');
  const manifest = JSON.parse(match[1]);
  const entryDirectory = 'static/chunks/app' + internal.slice(0, -5);
  const entryName = readdirSync(join(buildRoot, entryDirectory)).find((name) => /^page-[a-f0-9]+\.js$/.test(name));
  if (!entryName) throw new Error('Missing route entry bundle');
  const entryPath = entryDirectory + '/' + entryName;
  const chunks = [...new Set([entryPath, ...main.rootMainFiles,
    ...Object.values(manifest.clientModules).flatMap((entry) => entry.chunks).filter((path) => path.endsWith('.js'))])];
  const assets = chunks.map(asset);
  const entry = assets.filter((file) => file.path === entryPath);
  if (entry.length !== 1) throw new Error('Missing route entry bundle');
  rows.push({ route, entry: entry[0], referencedChunkCount: assets.length,
    referencedBytes: assets.reduce((sum, row) => sum + row.bytes, 0),
    referencedGzipBytes: assets.reduce((sum, row) => sum + row.gzipBytes, 0), assets });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), nextVersion: '16.3.8', bundler: 'webpack',
  buildId: readFileSync(join(buildRoot, 'BUILD_ID'), 'utf8').trim(),
  boundary: 'Local clean production build; reference inventory includes ancestor/recovery entries, excludes dynamic nonreferenced imports and is not initial network transfer, CWV, or a field percentile.',
  gzip: 'Each asset compressed independently with Node gzip defaults; Vercel transfer can differ.', routes: rows }, null, 2));
