// One official publication, never a mutable tag, mirror or replacement DB.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const databaseRepository = 'ghcr.io/aquasecurity/trivy-db@sha256:2bfa4ccf12f3243cd7cef40b98465bd2dfd6926816d0210c785ea36c4e94959c';
export function verifyPublication(bytes) {
  const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  if (databaseRepository !== 'ghcr.io/aquasecurity/trivy-db@' + digest) throw Error('Official DB manifest digest mismatch');
  const m = JSON.parse(bytes);
  if (m.schemaVersion !== 2 || m.mediaType !== 'application/vnd.oci.image.manifest.v1+json' ||
      m.artifactType !== 'application/vnd.aquasec.trivy.config.v1+json' || m.layers.length !== 1 ||
      m.layers[0].digest !== 'sha256:2661508583e666152f8e84eeafa946d126cb66e285794c6e91e70967ed934852' ||
      m.layers[0].size !== 135366518 || m.layers[0].mediaType !== 'application/vnd.aquasec.trivy.db.layer.v1.tar+gzip') throw Error('Official DB descriptor contract mismatch');
  return {repository:databaseRepository,manifestDigest:digest,manifestBytes:bytes.length,manifest:m,
    publisherRun:null,publisherSource:null,publisherAttribution:'unverified',
    evidenceBasis:'Owner-approved limited basis: immutable official GHCR manifest and layer identities plus original metadata passing strict local freshness checks; publisher-run/source attribution remains unverified; no digest-specific attestation is claimed',
    provenance:'The manifest and layer content identities are verified. Publisher-run/source attribution is unverified; close timestamps do not establish attribution.',
    coverage:'HOLD: advisory coverage for the selected database remains independently unresolved; immutable identity, metadata freshness and tooling diagnostics do not establish advisory coverage or security acceptance',
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
