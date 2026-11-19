import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findFontLicense } from '../src/lib/campaign-lab/font-licenses.ts';
const manifest = JSON.parse(readFileSync('public/fonts/manifest.json', 'utf8'));
test('all admitted programs match committed hashes, family rights and delivery rules', () => {
  const css = readFileSync('src/app/local-fonts.css', 'utf8');
  assert.equal(manifest.fonts.length, 26);
  assert.equal(new Set(manifest.fonts.map(f => f.family)).size, 5);
  assert.doesNotMatch(css, /https?:|_next|\.local/);
  for (const font of manifest.fonts) {
    const bytes = readFileSync('public/fonts/' + font.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), font.sha256);
    assert.equal(bytes.length, font.bytes);
    assert.ok(css.includes('/fonts/' + font.file));
    assert.ok(css.includes(font.unicodeRange));
    const license = readFileSync('public/fonts/' + font.licenseFile, 'utf8');
    assert.ok(license.includes(font.copyright[0]));
    assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
    assert.ok(font.licenseURL[0].match(/openfontlicense|sil.org\/OFL/));
  }
  for (const binding of Object.values(manifest.bindings)) assert.ok(css.includes(binding.variable + ':'));
});
test('only registered families resolve to their matching redistribution notices', () => {
  for (const family of new Set(manifest.fonts.map(f => f.family))) {
    assert.equal(findFontLicense(family)?.family, family);
  }
  assert.equal(findFontLicense('Unknown Custom Font'), null);
  assert.equal(findFontLicense('Unknown Geist Mono Special'), null);
  assert.equal(findFontLicense('Unknown Bricolage Grotesque Special'), null);
});
