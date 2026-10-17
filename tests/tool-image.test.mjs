import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { contractDigest, frontendImage, sha256, toolTar } from '../scripts/framework-prototype/tool-image.mjs';
import { inventoryTar } from '../scripts/framework-prototype/tar-inventory.mjs';

// This fixture is only a minimal ELF header for deterministic serialization tests.
// It is not executable and says nothing about native or frontend compatibility.
function syntheticElfHeader() {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46]);
  bytes[4] = 2; // ELFCLASS64
  bytes[5] = 1; // little endian
  bytes[6] = 1; // ELF version
  bytes.writeUInt16LE(62, 18); // EM_X86_64
  return bytes;
}

function contractFixture() {
  return {
    sourceDate: '2025-01-02T03:04:05Z',
    sources: { buildkit: { commit: 'a'.repeat(40) } },
  };
}

async function inventory(bytes, options = {}) {
  const entries = [];
  await inventoryTar(Readable.from([bytes]), (entry, retained) => {
    entries.push({ entry, bytes: retained });
  }, options);
  return entries;
}

function rawTarWithPath(name) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write('00000000000\0', 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(32, 148, 156);
  header[156] = 48;
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return Buffer.concat([header, Buffer.alloc(1024)]);
}

test('local RepoTag does not affect deterministic OCI identity', () => {
  const binary = syntheticElfHeader();
  const contract = contractFixture();
  const first = frontendImage(binary, contract, 'ornigami-tool-frontend:local-one');
  const second = frontendImage(binary, contract, 'ornigami-tool-frontend:local-two');

  for (const key of ['config', 'configDigest', 'layer', 'layerDigest', 'manifest', 'manifestDigest']) {
    assert.deepEqual(first[key], second[key], `${key} must not depend on RepoTag`);
  }
  assert.notDeepEqual(first.archive, second.archive, 'Docker archive metadata retains its requested RepoTag');

  const config = JSON.parse(first.config.toString('utf8'));
  const manifest = JSON.parse(first.manifest.toString('utf8'));
  assert.equal(config.architecture, 'amd64');
  assert.equal(config.os, 'linux');
  assert.deepEqual(config.rootfs.diff_ids, [first.layerDigest]);
  assert.equal(config.config.Labels['org.ornigami.experimental-toolchain'], contractDigest(contract));
  assert.equal(manifest.config.digest, first.configDigest);
  assert.equal(manifest.layers[0].digest, first.layerDigest);
  assert.equal('sha256:' + sha256(first.config), first.configDigest);
  assert.equal('sha256:' + sha256(first.layer), first.layerDigest);
  assert.equal('sha256:' + sha256(first.manifest), first.manifestDigest);
});

test('generated Docker archive has exact members and a 0755 frontend layer member', async () => {
  const binary = syntheticElfHeader();
  const image = frontendImage(binary, contractFixture(), 'ornigami-tool-frontend:fixture');
  const members = await inventory(image.archive, { retain: () => true });
  const configName = image.configDigest.slice('sha256:'.length) + '.json';
  assert.deepEqual(members.map(({ entry }) => entry.path), [configName, 'manifest.json', 'layer.tar']);
  assert.deepEqual(members.find(({ entry }) => entry.path === configName).bytes, image.config);
  assert.deepEqual(members.find(({ entry }) => entry.path === 'layer.tar').bytes, image.layer);

  const dockerManifest = JSON.parse(members.find(({ entry }) => entry.path === 'manifest.json').bytes.toString('utf8'));
  assert.deepEqual(dockerManifest, [{ Config: configName, RepoTags: [image.repoTag], Layers: ['layer.tar'] }]);

  const layerMembers = await inventory(image.layer, { retain: () => true });
  assert.equal(layerMembers.length, 1);
  assert.equal(layerMembers[0].entry.path, 'bin/dockerfile-frontend');
  assert.equal(layerMembers[0].entry.mode, 0o755);
  assert.deepEqual(layerMembers[0].bytes, binary);
});

test('unsafe generated and inventoried paths are rejected', async () => {
  for (const name of ['../escape', 'a/../escape', '/absolute/path', 'a\\escape']) {
    assert.throws(() => toolTar([{ name, bytes: Buffer.alloc(0) }]), /Unsafe generated tar path/);
    await assert.rejects(inventory(rawTarWithPath(name)), /Unsafe tar member path/);
  }
});

test('invalid ELF headers and nonlocal frontend tags are rejected', () => {
  const tag = 'ornigami-tool-frontend:fixture';
  const contract = contractFixture();
  const binary = syntheticElfHeader();
  for (const invalid of [Buffer.alloc(63), Buffer.from('not-elf-header'), (() => { const b = syntheticElfHeader(); b[4] = 1; return b; })(), (() => { const b = syntheticElfHeader(); b.writeUInt16LE(183, 18); return b; })()]) {
    assert.throws(() => frontendImage(invalid, contract, tag), /Expected bounded Linux amd64 ELF frontend/);
  }
  assert.throws(() => frontendImage(binary, contract, 'dockerfile-frontend:fixture'), /Unexpected local-only frontend tag/);
});
