#!/usr/bin/env node
/**
 * Enforce artifact size limits before upload.
 *
 * All archive copies count toward maxArchiveBytes; every regular file counts
 * toward maxArtifactBytes; every non-archive file counts toward
 * maxDiagnosticBytes. The check runs after staging has copied and bounded the
 * evidence, so archives, total upload and diagnostics are all measured on the
 * final directory that would be uploaded.
 *
 * On overflow an optional bounded diagnostic copy is produced without any
 * archive payload. It never copies more than maxDiagnosticBytes in total.
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

const root = process.env.UPLOAD_ROOT;
if (!root || !existsSync(root)) throw new Error("UPLOAD_ROOT must be an existing directory");
const maxArchiveBytes = integer("MAX_ARCHIVE_BYTES");
const maxArtifactBytes = integer("MAX_ARTIFACT_BYTES");
const receiptReserveBytes = integer("RECEIPT_RESERVE_BYTES", 64 * 1024);
const diagnosticsDir = process.env.DIAGNOSTICS_DIR ?? "";
const maxDiagnosticBytes = integer("MAX_DIAGNOSTIC_BYTES", 64 * 1024 * 1024);
const receiptPath = process.env.RECEIPT_PATH ?? "";

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      const stat = lstatSync(full);
      files.push({
        path: path.relative(root, full).split(path.sep).join("/"),
        absolute: full,
        bytes: stat.size,
      });
    }
  }
  return files;
}

const isArchive = (file) => /\.(tar|tar\.gz|tgz)$/i.test(file.path);

const files = walk(root);
const archives = files.filter(isArchive);
const diagnosticFiles = files.filter((file) => !isArchive(file));
const archiveBytes = archives.reduce((total, file) => total + file.bytes, 0);
const diagnosticBytes = diagnosticFiles.reduce((total, file) => total + file.bytes, 0);
const artifactBytes = files.reduce((total, file) => total + file.bytes, 0);
const artifactBytesWithReceipt = artifactBytes + receiptReserveBytes;
const overflowReasons = [];
if (archiveBytes > maxArchiveBytes) overflowReasons.push("archive_limit");
if (diagnosticBytes > maxDiagnosticBytes) overflowReasons.push("diagnostic_limit");
if (artifactBytesWithReceipt > maxArtifactBytes) overflowReasons.push("artifact_limit");

let diagnosticsFallback = null;
if (overflowReasons.length > 0 && diagnosticsDir) {
  mkdirSync(diagnosticsDir, { recursive: true });
  const reserve = 8192;
  let bytes = 0;
  const copied = [];
  for (const file of diagnosticFiles) {
    if (bytes + file.bytes + reserve > maxDiagnosticBytes) continue;
    const destination = path.join(diagnosticsDir, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(file.absolute, destination);
    bytes += file.bytes;
    copied.push({ path: file.path, bytes: file.bytes });
  }
  diagnosticsFallback = { directory: diagnosticsDir, bytes, files: copied, maxBytes: maxDiagnosticBytes };
}

const result = {
  ok: overflowReasons.length === 0,
  uploadRoot: path.resolve(root),
  archiveFiles: archives.map((file) => ({ path: file.path, bytes: file.bytes })),
  archiveBytes,
  archiveCopies: archives.length,
  diagnosticBytes,
  artifactBytes,
  artifactBytesWithReceipt,
  receiptReserveBytes,
  maxArchiveBytes,
  maxArtifactBytes,
  maxDiagnosticBytes,
  overflowReasons,
  diagnosticsFallback,
};
if (receiptPath) {
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 2);
