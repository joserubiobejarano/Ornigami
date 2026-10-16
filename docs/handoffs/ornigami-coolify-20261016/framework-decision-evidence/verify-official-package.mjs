// Read-only provenance checks. Supply the separately downloaded official tarball.
// This does not install/build Next or establish runtime/SLSA acceptance.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const metadata = read('npm-metadata.json');
const keys = read('npm-signing-keys.json');
const inspection = read('npm-package-inspection.json');
assert.ok(process.argv[2], 'Pass the path to the official next-16.4.2.tgz');
const bytes = fs.readFileSync(process.argv[2]);
const hash = (algorithm, encoding) => crypto.createHash(algorithm).update(bytes).digest(encoding);
assert.equal(hash('sha256', 'hex'), inspection.sha256);
assert.equal(`sha512-${hash('sha512', 'base64')}`, metadata.dist.integrity);
assert.equal(hash('sha1', 'hex'), metadata.dist.shasum);
const payload = `${metadata.name}@${metadata.version}:${metadata.dist.integrity}`;
const checks = metadata.dist.signatures.map(signature => {
  const keyRecord = keys.keys.find(key => key.keyid === signature.keyid);
  assert.ok(keyRecord, 'Signing key must exist in retained official key response');
  const key = crypto.createPublicKey({key: Buffer.from(keyRecord.key, 'base64'), format: 'der', type: 'spki'});
  const sig = Buffer.from(signature.sig, 'base64');
  assert.ok(crypto.verify('sha256', Buffer.from(payload), key, sig), 'Original registry signature must verify');
  assert.equal(crypto.verify('sha256', Buffer.from(`${payload}-altered`), key, sig), false, 'Changed payload must be rejected');
  return signature.keyid;
});
assert.ok(checks.length > 0);
console.log(JSON.stringify({packageHashChecks: 'passed', signatureAndAlteredPayloadChecks: checks.length, runtimeAcceptance: 'untested'}));
