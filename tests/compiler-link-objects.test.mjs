import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { compilerLinkObject } from '../scripts/framework-prototype/analyze-docker-archive.mjs';
import { inspectElf, inspectRelocatableElf } from '../scripts/framework-prototype/elf-closure.mjs';
import { requiredStages } from '../scripts/framework-prototype/scan-image-stages.mjs';

const HEADER_BYTES = 64;
const SECTION_HEADER_BYTES = 64;
const SHSTR_OFFSET = 64;
const STRTAB_OFFSET = 128;
const SYMTAB_OFFSET = 160;
const TEXT_OFFSET = 208;
const RELA_OFFSET = 224;
const SECTION_TABLE_OFFSET = 256;
const SECTION_COUNT = 6;
const COMPRESSED_TARGET_OFFSET = 256;
const COMPRESSED_RELA_OFFSET = 400;
const COMPRESSED_SECTION_TABLE_OFFSET = 512;

// This small hand-built ET_REL object exercises metadata tables only. Its .text
// bytes are placeholders; it is not linked or suitable for execution.
function syntheticRelocatableElf() {
  const bytes = Buffer.alloc(SECTION_TABLE_OFFSET + SECTION_COUNT * SECTION_HEADER_BYTES);
  bytes.set([0x7f, 0x45, 0x4c, 0x46]);
  bytes[4] = 2; // ELFCLASS64
  bytes[5] = 1; // little endian
  bytes[6] = 1; // ELF version 1
  bytes.writeUInt16LE(1, 16); // ET_REL
  bytes.writeUInt16LE(62, 18); // EM_X86_64
  bytes.writeUInt32LE(1, 20); // e_version
  bytes.writeBigUInt64LE(BigInt(SECTION_TABLE_OFFSET), 40);
  bytes.writeUInt16LE(64, 52); // e_ehsize
  bytes.writeUInt16LE(0, 54); // no program headers
  bytes.writeUInt16LE(0, 56);
  bytes.writeUInt16LE(SECTION_HEADER_BYTES, 58);
  bytes.writeUInt16LE(SECTION_COUNT, 60);
  bytes.writeUInt16LE(1, 62); // .shstrtab

  const sectionNames = Buffer.from('\0.shstrtab\0.strtab\0.symtab\0.text\0.rela.text\0');
  const sectionNameOffset = name => sectionNames.indexOf(Buffer.from(name + '\0'));
  sectionNames.copy(bytes, SHSTR_OFFSET);
  const symbols = Buffer.from('\0fixture_function\0');
  symbols.copy(bytes, STRTAB_OFFSET);

  // ELF64 symbol entry zero, followed by a global function symbol in .text.
  bytes.writeUInt32LE(1, SYMTAB_OFFSET + 24);
  bytes[SYMTAB_OFFSET + 24 + 4] = 0x12; // STB_GLOBAL | STT_FUNC
  bytes.writeUInt16LE(4, SYMTAB_OFFSET + 24 + 6);
  bytes.writeBigUInt64LE(8n, SYMTAB_OFFSET + 24 + 16);
  bytes.fill(0x90, TEXT_OFFSET, TEXT_OFFSET + 8);

  // One R_X86_64_PC32 relocation against symbol index 1, addend -4.
  bytes.writeBigUInt64LE(0n, RELA_OFFSET);
  bytes.writeBigUInt64LE((1n << 32n) | 2n, RELA_OFFSET + 8);
  bytes.writeBigInt64LE(-4n, RELA_OFFSET + 16);

  const section = (index, { name, type, flags = 0n, offset = 0, size = 0, link = 0, info = 0, alignment = 1, entrySize = 0 }) => {
    const at = SECTION_TABLE_OFFSET + index * SECTION_HEADER_BYTES;
    bytes.writeUInt32LE(name ? sectionNameOffset(name) : 0, at);
    bytes.writeUInt32LE(type, at + 4);
    bytes.writeBigUInt64LE(flags, at + 8);
    bytes.writeBigUInt64LE(BigInt(offset), at + 24);
    bytes.writeBigUInt64LE(BigInt(size), at + 32);
    bytes.writeUInt32LE(link, at + 40);
    bytes.writeUInt32LE(info, at + 44);
    bytes.writeBigUInt64LE(BigInt(alignment), at + 48);
    bytes.writeBigUInt64LE(BigInt(entrySize), at + 56);
  };
  section(0, { type: 0 });
  section(1, { name: '.shstrtab', type: 3, offset: SHSTR_OFFSET, size: sectionNames.length });
  section(2, { name: '.strtab', type: 3, offset: STRTAB_OFFSET, size: symbols.length });
  section(3, { name: '.symtab', type: 2, offset: SYMTAB_OFFSET, size: 48, link: 2, info: 1, alignment: 8, entrySize: 24 });
  section(4, { name: '.text', type: 1, flags: 6n, offset: TEXT_OFFSET, size: 8, alignment: 16 });
  section(5, { name: '.rela.text', type: 4, offset: RELA_OFFSET, size: 24, link: 3, info: 4, alignment: 8, entrySize: 24 });
  return bytes;
}

function syntheticCompressedRelocatableElf({ declaredSize = 128, reserved = 0, flags = 0x800n, compressed = deflateSync(Buffer.alloc(128)) } = {}) {
  const base = syntheticRelocatableElf();
  const bytes = Buffer.alloc(COMPRESSED_SECTION_TABLE_OFFSET + SECTION_COUNT * SECTION_HEADER_BYTES);
  base.copy(bytes, 0, 0, SECTION_TABLE_OFFSET);
  bytes.writeBigUInt64LE(BigInt(COMPRESSED_SECTION_TABLE_OFFSET), 40);
  base.copy(bytes, COMPRESSED_SECTION_TABLE_OFFSET, SECTION_TABLE_OFFSET, SECTION_TABLE_OFFSET + SECTION_HEADER_BYTES * SECTION_COUNT);

  // Relocate .rela.text and give its entry an offset valid against the
  // uncompressed logical section size, but beyond the compressed payload.
  base.copy(bytes, COMPRESSED_RELA_OFFSET, RELA_OFFSET, RELA_OFFSET + 24);
  bytes.writeBigUInt64LE(127n, COMPRESSED_RELA_OFFSET);

  const chdr = Buffer.alloc(24);
  chdr.writeUInt32LE(1, 0); // ELFCOMPRESS_ZLIB
  chdr.writeUInt32LE(reserved, 4);
  chdr.writeBigUInt64LE(BigInt(declaredSize), 8);
  chdr.writeBigUInt64LE(16n, 16);
  chdr.copy(bytes, COMPRESSED_TARGET_OFFSET);
  compressed.copy(bytes, COMPRESSED_TARGET_OFFSET + chdr.length);

  const section = index => COMPRESSED_SECTION_TABLE_OFFSET + index * SECTION_HEADER_BYTES;
  const target = section(4);
  bytes.writeBigUInt64LE(flags, target + 8);
  bytes.writeBigUInt64LE(BigInt(COMPRESSED_TARGET_OFFSET), target + 24);
  bytes.writeBigUInt64LE(BigInt(chdr.length + compressed.length), target + 32);
  const rela = section(5);
  bytes.writeBigUInt64LE(BigInt(COMPRESSED_RELA_OFFSET), rela + 24);
  return bytes;
}

function sectionHeaderOffset(bytes, index) {
  return Number(bytes.readBigUInt64LE(40)) + index * bytes.readUInt16LE(58);
}
function mutateSection(bytes, index, fieldOffset, write) {
  write(bytes, sectionHeaderOffset(bytes, index) + fieldOffset);
  return bytes;
}
function malformed(mutator) {
  const bytes = syntheticRelocatableElf();
  mutator(bytes);
  return bytes;
}
function rejectsRelocatable(bytes) {
  assert.throws(() => inspectRelocatableElf(bytes));
}

test('bounded ET_REL parser reports valid amd64 section, symbol, and relocation tables', () => {
  const bytes = syntheticRelocatableElf();
  const report = inspectRelocatableElf(bytes);
  assert.equal(report.machine, 'amd64');
  assert.equal(report.type, 'ET_REL');
  assert.equal(report.sections, 6);
  assert.equal(report.symbolTables, 1);
  assert.equal(report.symbols, 2);
  assert.equal(report.relocations, 1);
  assert.throws(() => inspectElf(bytes), /program headers|ELF/i, 'executable inspection remains strict for ET_REL');
});

test('ET_REL parser rejects invalid object headers and foreign architectures', () => {
  rejectsRelocatable(Buffer.alloc(32));
  rejectsRelocatable(malformed(bytes => { bytes[5] = 2; }));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt16LE(183, 18); }));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt16LE(2, 16); }));
  rejectsRelocatable(malformed(bytes => { bytes.writeBigUInt64LE(1n, 24); }));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt16LE(1, 56); }));
});

test('ET_REL parser rejects invalid section headers and string tables', () => {
  rejectsRelocatable(malformed(bytes => { bytes.writeBigUInt64LE(0xffffn, 40); }));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt16LE(32, 58); }));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt16LE(99, 62); }));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 4, 32, (target, at) => target.writeBigUInt64LE(BigInt(target.length + 8), at))));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 1, 32, (target, at) => target.writeBigUInt64LE(2n, at))));
  rejectsRelocatable(malformed(bytes => { bytes.fill(0x41, STRTAB_OFFSET + 1, STRTAB_OFFSET + 18); }));
});

test('ET_REL parser rejects malformed symbol and relocation tables', () => {
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 3, 56, (target, at) => target.writeBigUInt64LE(16n, at))));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 3, 40, (target, at) => target.writeUInt32LE(99, at))));
  rejectsRelocatable(malformed(bytes => { bytes.writeUInt32LE(0xffff, SYMTAB_OFFSET + 24); }));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 5, 56, (target, at) => target.writeBigUInt64LE(16n, at))));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 5, 40, (target, at) => target.writeUInt32LE(99, at))));
  rejectsRelocatable(malformed(bytes => mutateSection(bytes, 5, 44, (target, at) => target.writeUInt32LE(99, at))));
  rejectsRelocatable(malformed(bytes => { bytes.writeBigUInt64LE((9n << 32n) | 2n, RELA_OFFSET + 8); }));
});

test('ET_REL parser validates compressed debug sections against their logical size', () => {
  const bytes = syntheticCompressedRelocatableElf();
  const report = inspectRelocatableElf(bytes);
  assert.equal(report.compressedSections, 1);
  assert.equal(report.sections, 6);
  assert.equal(report.relocations, 1);
  assert.throws(() => inspectElf(bytes), /program headers|ELF/i, 'executable inspection remains strict for ET_REL');

  rejectsRelocatable(syntheticCompressedRelocatableElf({ declaredSize: 129 }));
  rejectsRelocatable(syntheticCompressedRelocatableElf({ compressed: Buffer.from('not zlib data') }));
  rejectsRelocatable(syntheticCompressedRelocatableElf({ declaredSize: 64 * 1024 * 1024 + 1 }));
  rejectsRelocatable(syntheticCompressedRelocatableElf({ reserved: 1 }));
  rejectsRelocatable(syntheticCompressedRelocatableElf({ flags: 0x802n }));
});

test('compiler archive classifier admits only matching compiler object locations', () => {
  const bytes = syntheticRelocatableElf();
  const direct = compilerLinkObject('toolchain-compiler', 'usr/lib/libc_nonshared.o', bytes);
  const gcc = compilerLinkObject('toolchain-compiler', 'usr/lib/gcc/x86_64-alpine-linux-musl/14.2.0/crtbegin.o', bytes);
  assert.ok(direct);
  assert.ok(gcc);
  assert.deepEqual(direct, { machine: 'amd64', type: 'ET_REL', sections: 6, symbolTables: 1, symbols: 2, relocations: 1, compressedSections: 0 });
  assert.deepEqual(gcc, direct);
  for (const stage of requiredStages.filter(stage => stage !== 'toolchain-compiler')) {
    assert.equal(compilerLinkObject(stage, 'usr/lib/libc_nonshared.o', bytes), null, `${stage} must not classify compiler link inputs`);
  }
  assert.equal(compilerLinkObject('toolchain-compiler', 'usr/lib/subdir/libc_nonshared.o', bytes), null);
  assert.equal(compilerLinkObject('toolchain-compiler', 'usr/lib/gcc/x86_64-alpine-linux-musl/latest/crtbegin.o', bytes), null);
  assert.equal(compilerLinkObject('toolchain-compiler', 'usr/lib/libc_nonshared.a', bytes), null);
  assert.throws(() => compilerLinkObject('toolchain-compiler', 'usr/lib/libc_nonshared.o', Buffer.from('not an ELF object')), /ELF|object|section/i);
});
