import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { finalizeSRIManifest } from "../scripts/finalize-sri-manifest.mjs";

const BUILD_ID = "sri-fixture-build";
const SSG_PATH = `static/${BUILD_ID}/_ssgManifest.js`;

function integrity(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("base64")}`;
}

function encodedPair(manifest) {
  const json = JSON.stringify(manifest, null, 2);
  return {
    json,
    javascript: `self.__SUBRESOURCE_INTEGRITY_MANIFEST=${JSON.stringify(json)}`,
  };
}

function createFixture({ manifestEntry = true, companion = "matching", ssgAsset = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ornigami-sri-finalizer-test-"));
  const server = join(root, "server");
  const staticBuild = join(root, "static", BUILD_ID);
  mkdirSync(server, { recursive: true });
  mkdirSync(staticBuild, { recursive: true });
  writeFileSync(join(root, "BUILD_ID"), `${BUILD_ID}\n`);
  const finalSsgBytes = Buffer.from("self.__SSG_MANIFEST=new Set(['/']);");
  const placeholderBytes = Buffer.from("self.__SSG_MANIFEST=new Set();");
  if (ssgAsset) writeFileSync(join(staticBuild, "_ssgManifest.js"), finalSsgBytes);
  const otherAssetBytes = Buffer.from("window.main = true;");
  const manifest = { "static/chunks/main.js": integrity(otherAssetBytes) };
  if (manifestEntry) manifest[SSG_PATH] = integrity(placeholderBytes);
  const pair = encodedPair(manifest);
  writeFileSync(join(server, "subresource-integrity-manifest.json"), pair.json);
  writeFileSync(join(server, "subresource-integrity-manifest.js"), companion === "matching" ? pair.javascript : "self.__SUBRESOURCE_INTEGRITY_MANIFEST=not-json");
  return { root, server, finalSsgBytes, otherAssetBytes, manifest };
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, "server", "subresource-integrity-manifest.json"), "utf8"));
}

test("hashes the final SSG bytes and preserves other strict SHA-256 entries", () => {
  const fixture = createFixture();
  try {
    const result = finalizeSRIManifest(fixture.root);
    const manifest = readManifest(fixture.root);
    const companion = readFileSync(join(fixture.server, "subresource-integrity-manifest.js"), "utf8");
    assert.equal(result.manifestRelativePath, SSG_PATH);
    assert.equal(result.integrity, integrity(fixture.finalSsgBytes));
    assert.equal(manifest[SSG_PATH], integrity(fixture.finalSsgBytes));
    assert.equal(manifest["static/chunks/main.js"], integrity(fixture.otherAssetBytes));
    assert.deepEqual(JSON.parse(JSON.parse(companion.slice("self.__SUBRESOURCE_INTEGRITY_MANIFEST=".length))), manifest);
    assert.equal(companion, encodedPair(manifest).javascript);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed on an inconsistent companion without changing either manifest", () => {
  const fixture = createFixture({ companion: "malformed" });
  try {
    const jsonPath = join(fixture.server, "subresource-integrity-manifest.json");
    const javascriptPath = join(fixture.server, "subresource-integrity-manifest.js");
    const before = [readFileSync(jsonPath), readFileSync(javascriptPath)];
    assert.throws(() => finalizeSRIManifest(fixture.root), /companion JavaScript manifest does not match/);
    assert.deepEqual(readFileSync(jsonPath), before[0]);
    assert.deepEqual(readFileSync(javascriptPath), before[1]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("fails closed when the compiled SRI entry or finalized file is missing", () => {
  for (const options of [{ manifestEntry: false }, { ssgAsset: false }]) {
    const fixture = createFixture(options);
    try {
      const jsonPath = join(fixture.server, "subresource-integrity-manifest.json");
      const javascriptPath = join(fixture.server, "subresource-integrity-manifest.js");
      const before = [readFileSync(jsonPath), readFileSync(javascriptPath)];
      assert.throws(() => finalizeSRIManifest(fixture.root), /(?:compiled manifest must contain exactly|missing regular final SSG manifest)/);
      assert.deepEqual(readFileSync(jsonPath), before[0]);
      assert.deepEqual(readFileSync(javascriptPath), before[1]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("fails closed when any compiled manifest integrity is not strict SHA-256", () => {
  const fixture = createFixture();
  try {
    const jsonPath = join(fixture.server, "subresource-integrity-manifest.json");
    const javascriptPath = join(fixture.server, "subresource-integrity-manifest.js");
    const invalid = { ...fixture.manifest, "static/chunks/main.js": "sha384-not-allowed" };
    const pair = encodedPair(invalid);
    writeFileSync(jsonPath, pair.json);
    writeFileSync(javascriptPath, pair.javascript);
    assert.throws(() => finalizeSRIManifest(fixture.root), /malformed SHA-256 integrity/);
    assert.equal(readFileSync(jsonPath, "utf8"), pair.json);
    assert.equal(readFileSync(javascriptPath, "utf8"), pair.javascript);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
