// PUBLIC SYNTHETIC TEST KEYS ONLY. Never use these fixtures in a service.
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const openssl = process.argv[2] || 'openssl';
const output = new URL('../tests/fixtures/brand-tls/', import.meta.url);
const temp = mkdtempSync(join(tmpdir(), 'ornigami-public-test-ca-'));
function run(...args) {
  const result = spawnSync(openssl, args, { cwd: temp, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
}
try {
  mkdirSync(output, { recursive: true });
  for (const ca of ['trusted', 'unknown']) {
    writeFileSync(join(temp, 'index'), '');
    writeFileSync(join(temp, 'serial'), '1000\n');
    writeFileSync(join(temp, 'ca.cnf'), `[ca]\ndefault_ca=test\n[test]\ndatabase=index\nunique_subject=no\nserial=serial\nnew_certs_dir=.\nprivate_key=${ca}-ca.key.pem\ncertificate=${ca}-ca.cert.pem\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n[ca_ext]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n`);
    run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${ca}-ca.key.pem`, '-out', 'ca.csr', '-subj', `/CN=PUBLIC SYNTHETIC Ornigami ${ca} TEST CA`);
    run('ca', '-batch', '-notext', '-selfsign', '-config', 'ca.cnf', '-in', 'ca.csr', '-out', `${ca}-ca.cert.pem`, '-startdate', '20200101000000Z', '-enddate', '20400101000000Z', '-extensions', 'ca_ext');
    const leaves = ca === 'trusted' ? [['origin', 'brand.example'], ['cdn', 'cdn.example'], ['wrong', 'wrong.example'], ['expired', 'brand.example']] : [['unknown', 'brand.example']];
    for (const [name, host] of leaves) {
      run('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key.pem`, '-out', 'leaf.csr', '-subj', `/CN=PUBLIC SYNTHETIC ${host}`);
      writeFileSync(join(temp, 'leaf.cnf'), `[leaf]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${host}\n`);
      run('ca', '-batch', '-notext', '-config', 'ca.cnf', '-in', 'leaf.csr', '-out', `${name}.cert.pem`, '-startdate', '20200101000000Z', '-enddate', name === 'expired' ? '20210101000000Z' : '20400101000000Z', '-extfile', 'leaf.cnf', '-extensions', 'leaf');
      for (const suffix of ['key', 'cert']) writeFileSync(new URL(`${name}.${suffix}.pem`, output), readFileSync(join(temp, `${name}.${suffix}.pem`)));
    }
    writeFileSync(new URL(`${ca}-ca.cert.pem`, output), readFileSync(join(temp, `${ca}-ca.cert.pem`)));
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
