import fs from 'node:fs';
import path from 'node:path';
import { requiredStages } from './scan-image-stages.mjs';

const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

export function skipDependentStages(root, sourceSha, reason) {
  fs.mkdirSync(root, { recursive: true });
  const records = [];
  for (const stage of requiredStages) {
    const dir = path.join(root, stage), file = path.join(dir, 'driver.json');
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      save(file, { stage, result: 'skipped', collectionComplete: false, reason, prerequisite: 'shared frozen database admission', recordedAt: new Date().toISOString() });
    }
    records.push(JSON.parse(fs.readFileSync(file)));
  }
  save(path.join(root, 'index.json'), aggregate(records, sourceSha));
  return records;
}

export function aggregate(records, sourceSha) {
  return {
    schema: 1,
    ...(sourceSha ? { sourceSha } : {}),
    expectedStages: requiredStages,
    stages: requiredStages.map(stage => records.find(record => record.stage === stage) ?? { stage, result: 'skipped', reason: 'phase did not produce a receipt' }),
    result: requiredStages.every(stage => records.some(record => record.stage === stage && record.result === 'passed')) ? 'passed' : 'failed'
  };
}
