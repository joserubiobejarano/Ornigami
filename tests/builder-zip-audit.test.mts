import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createStoredZip,
} from "../src/lib/campaign-lab/export.ts";
import {
  ZipAuditError,
  ZipAuditToolError,
  auditZipBundle,
  validateZipArchive,
} from "../deploy/builder/zip-audit.mjs";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-zip-audit");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeBundle(name: string, options: Record<string, boolean> = {}) {
  const revision = "0123456789abcdef";
  const packshot = Buffer.from("synthetic-packshot-bytes");
  const packshotName = "packshot-abc.webp";
  const packshotHash = sha256(packshot);
  const offer = "20% off";
  const price = "$9";
  const destination = "https://example.invalid/offer";
  const status = "fallback";
  const html = `<!doctype html><html><head>
<meta name="campaign-lab-revision" content="${revision}">
<meta name="campaign-lab-offer" content="${offer}">
<meta name="campaign-lab-offer-price" content="${price}">
<meta name="campaign-lab-destination" content="${destination}">
<meta name="campaign-lab-preview-status" content="${status}">
<meta name="campaign-lab-packshot-sha256" content="${
    options.mismatchedAsset ? "b".repeat(64) : packshotHash
  }">
</head><body>ok</body></html>`;
  const files = [
    { path: packshotName, bytes: packshot },
    { path: "index.html", bytes: Buffer.from(html) },
    { path: "styles.css", bytes: Buffer.from("body{}") },
    { path: "README.txt", bytes: Buffer.from("readme") },
  ];
  if (options.unsafePath) {
    files.push({ path: "../evil.txt", bytes: Buffer.from("evil") });
  }
  const receipt = {
    schemaVersion: 1,
    kind: "campaign-lab-local-export",
    approval: { revision, renderedRevision: revision },
    preview: {
      offer,
      offerPrice: price,
      destinationUrl: destination,
      status,
      notice: null,
    },
    asset: {
      id: "asset-1",
      contentHash: packshotHash,
      exportedSha256: options.mismatchedAsset ? "b".repeat(64) : packshotHash,
      file: packshotName,
      width: 1,
      height: 1,
    },
    fonts: [],
    references: {
      scripts: [],
      stylesheets: ["styles.css"],
      images: [packshotName],
      fonts: [],
      cssUrls: [],
      checked: 2,
    },
    files: files
      .map((file) => ({
        path: file.path,
        bytes: options.lengthMismatch ? file.bytes.length + 1 : file.bytes.length,
        sha256: options.hashMismatch ? "c".repeat(64) : sha256(file.bytes),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    checks: {},
  };
  if (options.revisionMismatch) {
    receipt.approval = {
      revision: "fedcba9876543210",
      renderedRevision: "fedcba9876543210",
    };
  }
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  let entries = [...files, { path: "receipt.json", bytes: receiptBytes }];
  if (options.extraFile) {
    entries = [...entries, { path: "extra.txt", bytes: Buffer.from("extra") }];
  }
  if (options.duplicate) {
    entries = [...entries, { path: "index.html", bytes: Buffer.from(`${html}<!--duplicate-->`) }];
  }
  const zip = Buffer.from(createStoredZip(entries, new Date("2026-11-20T00:00:00Z")));
  if (options.corruptCrc) {
    const signature = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const localOffset = zip.indexOf(signature);
    assert.ok(localOffset >= 0, "missing local ZIP header");
    const nameLength = zip.readUInt16LE(localOffset + 26);
    const extraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + nameLength + extraLength;
    zip[dataOffset] ^= 0xff;
  }
  const dir = path.join(tempRoot, name);
  mkdirSync(dir, { recursive: true });
  const zipPath = path.join(dir, "export.zip");
  writeFileSync(zipPath, zip);
  return { zipPath, dir, extractDir: path.join(dir, "extracted"), revision, packshotHash };
}

test("a valid archive passes CRC, inventory, length/hash and revision checks", () => {
  const bundle = makeBundle("valid");
  const validation = validateZipArchive(bundle.zipPath);
  assert.equal(validation.crcBad, null);
  assert.ok(validation.entries >= 5);
  const audit = auditZipBundle({
    zipPath: bundle.zipPath,
    extractDir: bundle.extractDir,
  });
  assert.equal(audit.revision, bundle.revision);
  assert.equal(audit.files, 4);
  assert.equal(audit.archiveFiles, 4);
  assert.equal(audit.asset.file, "packshot-abc.webp");
  assert.equal(audit.publishedDir, bundle.extractDir);
  assert.equal(existsSync(bundle.extractDir), true);
});

test("a receipt hash failure publishes nothing and preserves pre-existing output", () => {
  const bundle = makeBundle("hash-publish", { hashMismatch: true });
  const previous = path.join(bundle.dir, "previous-output");
  mkdirSync(previous, { recursive: true });
  writeFileSync(path.join(previous, "sentinel.txt"), "keep\n");

  assert.throws(
    () =>
      auditZipBundle({
        zipPath: bundle.zipPath,
        extractDir: bundle.extractDir,
      }),
    (error) => error instanceof ZipAuditError && /hash mismatch/i.test(error.message),
  );
  assert.equal(
    existsSync(bundle.extractDir),
    false,
    "failed receipt integrity must not publish the extracted directory",
  );
  assert.equal(
    readFileSync(path.join(previous, "sentinel.txt"), "utf8"),
    "keep\n",
    "pre-existing output must remain intact",
  );

  mkdirSync(bundle.extractDir, { recursive: true });
  writeFileSync(path.join(bundle.extractDir, "old.txt"), "old\n");
  const valid = makeBundle("hash-publish-valid");
  assert.throws(
    () =>
      auditZipBundle({
        zipPath: valid.zipPath,
        extractDir: bundle.extractDir,
      }),
    (error) =>
      error instanceof ZipAuditError &&
      /pre-existing extracted output/i.test(error.message),
  );
  assert.equal(
    readFileSync(path.join(bundle.extractDir, "old.txt"), "utf8"),
    "old\n",
    "a pre-existing published directory must not be replaced",
  );
});

test("duplicate archive entries fail before extraction", () => {
  const bundle = makeBundle("duplicate", { duplicate: true });
  assert.throws(
    () =>
      auditZipBundle({
        zipPath: bundle.zipPath,
        extractDir: bundle.extractDir,
      }),
    (error) => error instanceof ZipAuditError && /duplicate/i.test(error.message),
  );
  assert.equal(
    existsSync(bundle.extractDir),
    false,
    "structural failure must happen before extraction",
  );
});

test("CRC corruption fails the structural audit", () => {
  const bundle = makeBundle("crc", { corruptCrc: true });
  assert.throws(
    () => validateZipArchive(bundle.zipPath),
    (error) =>
      error instanceof ZipAuditError && /CRC|crc/i.test(error.message),
  );
});

test("unsafe paths and extra inventory fail clearly", () => {
  const unsafe = makeBundle("unsafe", { unsafePath: true });
  assert.throws(
    () => validateZipArchive(unsafe.zipPath),
    (error) => error instanceof ZipAuditError && /unsafe/i.test(error.message),
  );

  const extra = makeBundle("extra", { extraFile: true });
  assert.throws(
    () =>
      auditZipBundle({
        zipPath: extra.zipPath,
        extractDir: extra.extractDir,
      }),
    (error) =>
      error instanceof ZipAuditError &&
      /missing from receipt\.files/i.test(error.message),
  );
});

test("a mismatched packshot asset fails qualification", () => {
  const bundle = makeBundle("asset-mismatch", { mismatchedAsset: true });
  assert.throws(
    () =>
      auditZipBundle({
        zipPath: bundle.zipPath,
        extractDir: bundle.extractDir,
      }),
    (error) =>
      error instanceof ZipAuditError &&
      /packshot|exportedSha256|hash/i.test(error.message),
  );
  assert.equal(
    existsSync(bundle.extractDir),
    false,
    "asset failure must not publish extracted evidence",
  );
});

test("declared lengths, declared hashes and revision disagreement fail", () => {
  const length = makeBundle("length", { lengthMismatch: true });
  assert.throws(
    () => auditZipBundle({ zipPath: length.zipPath, extractDir: length.extractDir }),
    (error) =>
      error instanceof ZipAuditError && /length mismatch/i.test(error.message),
  );

  const hash = makeBundle("hash", { hashMismatch: true });
  assert.throws(
    () => auditZipBundle({ zipPath: hash.zipPath, extractDir: hash.extractDir }),
    (error) => error instanceof ZipAuditError && /hash mismatch/i.test(error.message),
  );

  const revision = makeBundle("revision", { revisionMismatch: true });
  assert.throws(
    () =>
      auditZipBundle({
        zipPath: revision.zipPath,
        extractDir: revision.extractDir,
      }),
    (error) => error instanceof ZipAuditError && /revision/i.test(error.message),
  );
});

test("a missing audit tool fails with an explicit message", () => {
  const bundle = makeBundle("tool");
  assert.throws(
    () =>
      validateZipArchive(bundle.zipPath, {
        pythonCandidates: ["definitely-not-a-python"],
      }),
    (error) =>
      error instanceof ZipAuditToolError &&
      /Python 3|zipfile/i.test(error.message),
  );
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
