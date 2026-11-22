#!/usr/bin/env node
/**
 * Stage only approved synthetic evidence into a runner-owned upload directory.
 *
 * Archives are copied first. Non-archive diagnostics are bounded during the
 * copy, not after an unbounded copy. A final budget check still runs on the
 * staged directory before any artifact upload.
 */
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function integer(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined && fallback !== undefined) return fallback;
  if (!/^[0-9]+$/.test(raw ?? "")) throw new Error(`${name} must be a non-negative integer`);
  return Number(raw);
}

const sourceRoots = (process.env.SOURCE_ROOTS ?? "")
  .split("|")
  .map((value) => value.trim())
  .filter(Boolean);
const uploadRoot = process.env.UPLOAD_ROOT;
if (!uploadRoot) throw new Error("UPLOAD_ROOT is required");
const maxArchiveBytes = integer("MAX_ARCHIVE_BYTES");
const maxArtifactBytes = integer("MAX_ARTIFACT_BYTES");
const maxDiagnosticBytes = integer("MAX_DIAGNOSTIC_BYTES");
const receiptReserveBytes = integer("RECEIPT_RESERVE_BYTES", 64 * 1024);
const receiptPath = process.env.RECEIPT_PATH ?? path.join(uploadRoot, "staging-receipt.json");

mkdirSync(uploadRoot, { recursive: true });

function walk(directory) {
  const files = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

const candidates = [];
for (const source of sourceRoots) {
  const label = path.basename(source) || "source";
  for (const file of walk(source)) {
    candidates.push({
      absolute: file,
      relative: path.join(label, path.relative(source, file)),
      bytes: lstatSync(file).size,
      archive: /\.(tar|tar\.gz|tgz)$/i.test(file),
    });
  }
}

candidates.sort((a, b) => {
  if (a.archive !== b.archive) return a.archive ? -1 : 1;
  return a.relative.localeCompare(b.relative);
});

const skipped = [];
let archiveBytes = 0;
let artifactBytes = 0;
let diagnosticBytes = 0;
let archiveOverflow = false;
let artifactOverflow = false;
let diagnosticsTruncated = false;

for (const file of candidates) {
  const target = path.join(uploadRoot, file.relative);
  if (file.archive) {
    if (archiveBytes + file.bytes > maxArchiveBytes) {
      archiveOverflow = true;
      skipped.push({ ...file, reason: "archive_limit" });
      continue;
    }
    if (artifactBytes + file.bytes + receiptReserveBytes > maxArtifactBytes) {
      artifactOverflow = true;
      skipped.push({ ...file, reason: "artifact_limit" });
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file.absolute, target);
    archiveBytes += file.bytes;
    artifactBytes += file.bytes;
    continue;
  }
  if (diagnosticBytes + file.bytes > maxDiagnosticBytes) {
    diagnosticsTruncated = true;
    skipped.push({ ...file, reason: "diagnostic_limit" });
    continue;
  }
  if (artifactBytes + file.bytes + receiptReserveBytes > maxArtifactBytes) {
    artifactOverflow = true;
    skipped.push({ ...file, reason: "artifact_limit" });
    continue;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(file.absolute, target);
  diagnosticBytes += file.bytes;
  artifactBytes += file.bytes;
}

const result = {
  ok: !archiveOverflow && !artifactOverflow,
  sourceRoots,
  uploadRoot: path.resolve(uploadRoot),
  archiveBytes,
  diagnosticBytes,
  artifactBytes,
  archiveOverflow,
  artifactOverflow,
  diagnosticsTruncated,
  skipped,
  maxArchiveBytes,
  maxArtifactBytes,
  maxDiagnosticBytes,
  receiptReserveBytes,
};
mkdirSync(path.dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 2);
