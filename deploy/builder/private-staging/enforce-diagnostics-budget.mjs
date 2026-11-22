#!/usr/bin/env node
/**
 * Enforce the diagnostic size limit on the final diagnostics directory.
 *
 * Call this after the last copy or append into the directory. It measures the
 * directory as it would be uploaded, keeps small priority files, trims or
 * removes the largest remaining files until the total (including this
 * receipt's reserved bytes) fits, and fails if the directory cannot be bounded.
 *
 * The receipt is written outside the measured directory by the caller; when it
 * must live inside, RECEIPT_PATH is reserved for before trimming.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function integer(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined && fallback !== undefined) return fallback;
  if (!/^[0-9]+$/.test(raw ?? "")) throw new Error(`${name} must be a non-negative integer`);
  return Number(raw);
}

const directory = process.env.DIAGNOSTICS_DIR;
if (!directory || !existsSync(directory)) throw new Error("DIAGNOSTICS_DIR must be an existing directory");
const maxBytes = integer("MAX_DIAGNOSTIC_BYTES");
const receiptPath = process.env.RECEIPT_PATH ?? "";
const receiptInside = receiptPath ? path.resolve(receiptPath).startsWith(`${path.resolve(directory)}${path.sep}`) : false;
const reserveBytes = receiptInside ? integer("RECEIPT_RESERVE_BYTES", 16 * 1024) : 0;

const PRIORITY = [
  "EMERGENCY.txt",
  "staging-receipt.json",
  "upload-budget.json",
  "final-status.txt",
  "ownership-preflight.txt",
  "rehearsal-console.log",
];

function walk(entry) {
  const files = [];
  for (const item of readdirSync(entry, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(entry, item.name);
    if (item.isDirectory()) files.push(...walk(full));
    else if (item.isFile()) files.push({ relative: path.relative(directory, full).split(path.sep).join("/"), absolute: full, bytes: lstatSync(full).size });
  }
  return files;
}

function priority(relative) {
  const index = PRIORITY.findIndex((name) => relative === name || relative.endsWith(`/${name}`));
  return index < 0 ? PRIORITY.length : index;
}

let files = walk(directory);
let total = files.reduce((sum, file) => sum + file.bytes, 0);
const removed = [];
const trimmed = [];

if (receiptInside) {
  // Never let a stale receipt push the directory over its own limit.
  if (existsSync(receiptPath)) {
    const stale = lstatSync(receiptPath).size;
    total -= stale;
    rmSync(receiptPath, { force: true });
  }
}

if (total + reserveBytes > maxBytes) {
  // Remove non-priority files largest-first, then trim priority files only if
  // they alone exceed the budget.
  const droppable = [...files].sort((a, b) => priority(b.relative) - priority(a.relative) || b.bytes - a.bytes);
  for (const file of droppable) {
    if (total + reserveBytes <= maxBytes) break;
    if (!existsSync(file.absolute)) continue;
    rmSync(file.absolute, { force: true });
    total -= file.bytes;
    removed.push({ path: file.relative, bytes: file.bytes });
  }
  files = walk(directory);
  const remaining = [...files].sort((a, b) => b.bytes - a.bytes);
  for (const file of remaining) {
    if (total + reserveBytes <= maxBytes) break;
    const surplus = total + reserveBytes - maxBytes;
    if (file.bytes > surplus) {
      const keep = Math.max(0, file.bytes - surplus);
      truncateSync(file.absolute, keep);
      trimmed.push({ path: file.relative, from: file.bytes, to: keep });
      total -= file.bytes - keep;
    }
  }
}

files = walk(directory);
total = files.reduce((sum, file) => sum + file.bytes, 0);
const base = {
  directory: path.resolve(directory),
  maxBytes,
  reserveBytes,
  fileCount: files.length,
  files: files.slice(0, 100).map((file) => ({ path: file.relative, bytes: file.bytes })),
  removed,
  trimmed,
};
let payload = `${JSON.stringify({ ...base, ok: total + reserveBytes <= maxBytes, bytes: total }, null, 2)}\n`;

if (receiptPath) {
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, payload);
  // Re-measure after the receipt (and every earlier append) is on disk.
  const finalTotal = walk(directory).reduce((sum, file) => sum + file.bytes, 0);
  if (finalTotal > maxBytes) {
    payload = `${JSON.stringify({
      ok: false,
      reason: "diagnostics_directory_exceeds_limit",
      bytes: finalTotal,
      maxBytes,
    }, null, 2)}\n`;
    writeFileSync(receiptPath, payload);
    process.stdout.write(payload);
    process.exit(2);
  }
  const finalFiles = walk(directory);
  const finalBytes = finalFiles.reduce((sum, file) => sum + file.bytes, 0);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    directory: path.resolve(directory),
    bytes: finalBytes,
    maxBytes,
    fileCount: finalFiles.length,
    removed,
    trimmed,
  }, null, 2)}\n`);
  process.exit(0);
}

process.stdout.write(payload);
process.exit(total <= maxBytes ? 0 : 2);
