import assert from 'node:assert/strict';
import test from 'node:test';
import {cleanupOwnedImages} from '../scripts/framework-prototype/cleanup-owned-images.mjs';

const id = 'sha256:' + 'a'.repeat(64);
const foreign = 'sha256:' + 'b'.repeat(64);
const claimed = {stage:'buildkit', ownedImage:true, reference:'example/tool@'+id, imageId:id};
function daemon(options = {}) {
  const images = new Set(options.absent ? [foreign] : [id, foreign]);
  const calls = []; let inventories = 0;
  return {images, calls, invoke(args) {
    calls.push(args);
    if (args[1] === 'ls') {
      inventories++;
      if (options.inventoryFailure === inventories) return {status:1, stdout:''};
      return {status:0, stdout:options.malformed ? 'not-an-image-id\n' : [...images].join('\n')};
    }
    if (args[1] === 'inspect') return {status:options.inspectFailure ? 1 : 0, stdout:options.drift ? foreign : id};
    assert.deepEqual(args, ['image','rm',id]);
    if (!options.noop && !options.removeFailure) images.delete(id);
    return {status:options.removeFailure ? 1 : 0, stdout:''};
  }};
}
test('owned removal is followed by authoritative absence, preserving foreign images', () => {
  const d = daemon(); const [result] = cleanupOwnedImages([claimed], d.invoke);
  assert.equal(result.result, 'removed exact claimed image'); assert.equal(result.absenceVerified, true);
  assert.deepEqual([...d.images], [foreign]); assert.equal(d.calls.at(-1)[1], 'ls');
});
for (const [name, options] of Object.entries({
  'successful no-op removal':{noop:true}, 'failed removal':{removeFailure:true},
  'post-removal inventory unavailable':{inventoryFailure:2}, 'initial inventory unavailable':{inventoryFailure:1},
  'inspect failure':{inspectFailure:true}, 'reference identity drift':{drift:true}, 'malformed inventory':{malformed:true},
})) test(`cleanup fails closed on ${name}`, () => {
  const d=daemon(options); const [result]=cleanupOwnedImages([claimed],d.invoke);
  assert.equal(result.result,'failed'); assert.ok(result.error);
  if (options.drift || options.inspectFailure || options.inventoryFailure===1 || options.malformed) assert.ok(!d.calls.some(x=>x[1]==='rm'));
});
test('already absent requires a successful inventory and never removes a foreign reference', () => {
  const d=daemon({absent:true});const [result]=cleanupOwnedImages([claimed],d.invoke);
  assert.equal(result.result,'already absent');assert.equal(result.absenceVerified,true);
  assert.equal(d.calls.length,1);assert.deepEqual([...d.images],[foreign]);
});
test('invalid owned claim fails instead of silently disappearing from the cleanup report', () => {
  const d=daemon();const [result]=cleanupOwnedImages([{...claimed,imageId:undefined}],d.invoke);
  assert.equal(result.result,'failed');assert.equal(d.calls.length,0);
});
test('pre-existing unowned image is preserved without Docker mutation', () => {
  const d=daemon();assert.deepEqual(cleanupOwnedImages([{...claimed,ownedImage:false}],d.invoke),[]);
  assert.equal(d.calls.length,0);
});
