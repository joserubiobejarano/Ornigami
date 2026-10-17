// One official publication, never a mutable tag, mirror or replacement DB.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const databaseRepository = 'ghcr.io/aquasecurity/trivy-db@sha256:10584ede500597f516f0d5f4ab750c125999dc0359995a4494ab6cb12e700730';
export function verifyPublication(bytes) {
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  if (databaseRepository !== 'ghcr.io/aquasecurity/trivy-db@' + digest) throw Error('Official DB manifest digest mismatch');
  const m = JSON.parse(bytes);
  if (m.schemaVersion !== 2 || m.mediaType !== 'application/vnd.oci.image.manifest.v1+json' ||
      m.artifactType !== 'application/vnd.aquasec.trivy.config.v1+json' || m.layers.length !== 1 ||
      m.layers[0].digest !== 'sha256:3fb08347d6ef5444dd6bb3ef718204fbf8f2f609f681e18f5eee8177f524d85c' ||
      m.layers[0].size !== 134666882 || m.layers[0].mediaType !== 'application/vnd.aquasec.trivy.db.layer.v1.tar+gzip') throw Error('Official DB descriptor contract mismatch');
  return {repository:databaseRepository,manifestDigest:digest,manifestBytes:bytes.length,manifest:m,
    publisherRun:39056570786,publisherSource:'cbebf2ecd6df42d36463844a45e689afee51c70f',
    provenance:'official successful upload log binds manifest digest; no signature attestation claimed',
    coverage:'HOLD: read-only query of exact published DB confirms global CVE-2026-111142 record but no Debian 12/13/14 zziplib advisory; corrected current source is undetermined; exact mutable publisher input snapshot remains unestablished; freshness/tooling diagnostics do not grant security acceptance',
    freshness:'must independently pass strict internal metadata admission against actual clock'};
}
export function officialPublication() {
  return verifyPublication(fs.readFileSync(new URL('./official-db-manifest.json',import.meta.url)));
}
export function recordOfficialPublication(sourceSha,receiptPath) {
  if(!/^[a-f0-9]{40}$/.test(sourceSha??''))throw Error('Admitted source identity required');
  const publication={sourceSha,...officialPublication()};
  // Refuse an existing receipt: never replace a publication mid-attempt.
  const fd=fs.openSync(receiptPath,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(publication,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return publication;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length!==2)throw Error('Expected exact source SHA and new receipt path');
    console.log(recordOfficialPublication(...args).repository);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
