import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
