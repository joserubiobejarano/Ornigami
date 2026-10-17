// One official publication, never a mutable tag, mirror or replacement DB.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
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
    coverage:'HOLD: source/input review implies Debian undetermined status skips CVE-2026-111142/zziplib; exact published DB coverage untested; freshness-only diagnostic does not grant security acceptance',
    freshness:'must independently pass strict internal metadata admission against actual clock'};
}
export function officialPublication() {
  return verifyPublication(fs.readFileSync(new URL('./official-db-manifest.json',import.meta.url)));
}
