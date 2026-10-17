import {spawnSync} from 'node:child_process';

const docker = args => spawnSync('docker', args, {encoding:'utf8', timeout:30000, maxBuffer:1024*1024, windowsHide:true});
const validId = value => /^sha256:[0-9a-f]{64}$/.test(value ?? '');

// A successful removal command is insufficient. Only a successful subsequent
// daemon inventory establishes absence; an inspect error never does.
export function cleanupOwnedImages(records, invoke = docker) {
  const results = [];
  const inventory = () => {
    const response = invoke(['image','ls','--all','--quiet','--no-trunc']);
    if (response.status !== 0 || response.error || response.signal) throw Error('Image inventory unavailable');
    const ids = response.stdout.trim().split(/\s+/).filter(Boolean);
    if (ids.some(id => !validId(id))) throw Error('Invalid image inventory');
    return new Set(ids);
  };
  for (const record of records.filter(value => value.ownedImage)) {
    const result = {stage:record.stage, imageId:record.imageId, reference:record.reference, result:'failed'};
    try {
      if (!validId(record.imageId) || typeof record.reference !== 'string' || !record.reference) throw Error('Claimed image identity missing');
      if (!inventory().has(record.imageId)) {
        result.result = 'already absent'; result.absenceVerified = true;
      } else {
        const inspected = invoke(['image','inspect',record.reference,'--format','{{.Id}}']);
        if (inspected.status !== 0 || inspected.error || inspected.signal) throw Error('Claimed image reference unavailable; preserved');
        if (inspected.stdout.trim() !== record.imageId) throw Error('Claimed image identity drift; preserved');
        // Remove by immutable ID, never a mutable reference that could drift.
        const removed = invoke(['image','rm',record.imageId]);
        result.removalExit = removed.status; result.removalSignal = removed.signal ?? null;
        result.absenceVerified = !inventory().has(record.imageId);
        if (removed.status !== 0 || removed.error || removed.signal) throw Error('Image removal failed');
        if (!result.absenceVerified) throw Error('Claimed image remains after removal');
        result.result = 'removed exact claimed image';
      }
    } catch (error) { result.error = error.message; }
    results.push(result);
  }
  return results;
}
