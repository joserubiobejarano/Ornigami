import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const approvedOrigin = 'https://staging.ornigami.com';
const profilePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../deploy/coolify/build-profile.json');

export function parseBuildProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'origin,schema') {
    throw new Error('Build profile must contain exactly schema and origin');
  }
  if (value.schema !== 1 || value.origin !== approvedOrigin) throw new Error('Build profile schema/origin is not the approved HTTPS origin');
  return Object.freeze({ schema: 1, origin: approvedOrigin });
}

export function loadBuildProfile(file = profilePath) {
  return parseBuildProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'origin') throw new Error('Expected origin');
    console.log(loadBuildProfile().origin);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
