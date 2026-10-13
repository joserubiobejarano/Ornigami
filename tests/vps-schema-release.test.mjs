import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifySchemaRelease } from "../scripts/vps-schema-release-check.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repository, "deploy/vps/schema-release-039-042.json");

async function removeTemp(temp) {
  const resolved = path.resolve(temp);
  const parent = path.resolve(os.tmpdir());
  assert.ok(resolved.startsWith(`${parent}${path.sep}`), "refusing to remove a path outside the OS temp directory");
  await rm(resolved, { recursive: true, force: true });
}

test("release manifest matches canonical migration hashes and numeric order", async () => {
  const result = await verifySchemaRelease({ repoRoot: repository, manifest: manifestPath });
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.deepEqual(result.migrations.map(({ file }) => file), [
    "039_billing_lease_duplicate_alias.sql",
    "040_permission_evidence.sql",
    "041_guarded_retention.sql",
    "042_cron_expected_jobs.sql",
  ]);
  assert.ok(result.migrations.every(({ sha256, valid }) => /^[a-f0-9]{64}$/.test(sha256) && valid));
});

test("catalog readiness query checks release contracts without data mutation", async () => {
  const sql = await readFile(path.join(repository, "deploy/vps/schema-readiness.sql"), "utf8");
  for (const contract of [
    "039 duplicate billing lease cleanup",
    "040 permission evidence columns and constraint",
    "040 evidence-bearing and fail-closed admission overloads",
    "040 claim and send permission fences",
    "041 enabled terminal timestamp triggers",
    "041 provider correlation and callback guards",
    "042 expected cron jobs and missed-cadence alerting",
    "RETENTION_DISPOSED_CALLBACK_UNMATCHED_GUARD",
    "RETENTION_DISPOSED_CALLBACK_LOCKED_GUARD",
  ]) assert.ok(sql.includes(contract), `missing catalog contract: ${contract}`);
  assert.match(sql, /^\s*--[\s\S]*?WITH\s+funcs\s+AS/i);
  assert.doesNotMatch(sql, /^\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/im);
});

test("release check fails closed when a migration hash changes", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "vps-schema-release-"));
  t.after(() => removeTemp(temp));
  const migrationDir = path.join(temp, "neon", "migrations");
  await mkdir(migrationDir, { recursive: true });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const item of manifest.migrations) {
    const sql = await readFile(path.join(repository, "neon/migrations", item.file));
    await writeFile(path.join(migrationDir, item.file), sql);
  }
  await writeFile(path.join(migrationDir, manifest.migrations[1].file), "-- altered\n");
  const copiedManifest = path.join(temp, "manifest.json");
  await writeFile(copiedManifest, JSON.stringify(manifest));
  const result = await verifySchemaRelease({ repoRoot: temp, manifest: copiedManifest });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("hash mismatch for 040_permission_evidence.sql")));
});

test("LF-based hashes accept a CRLF checkout", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "vps-schema-crlf-"));
  t.after(() => removeTemp(temp));
  const migrationDir = path.join(temp, "neon", "migrations");
  await mkdir(migrationDir, { recursive: true });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const item of manifest.migrations) {
    const sql = (await readFile(path.join(repository, "neon/migrations", item.file), "utf8"))
      .replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
    await writeFile(path.join(migrationDir, item.file), sql, "utf8");
  }
  const copiedManifest = path.join(temp, "manifest.json");
  await writeFile(copiedManifest, JSON.stringify(manifest));
  const result = await verifySchemaRelease({ repoRoot: temp, manifest: copiedManifest });
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("release check rejects malformed order and unsupported hash algorithms", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.migrations.reverse();
  manifest.applyOrder = ["040", "039", "041", "042"];
  manifest.hashAlgorithm = "sha256-raw";
  const temp = await mkdtemp(path.join(os.tmpdir(), "vps-schema-manifest-"));
  try {
    const copiedManifest = path.join(temp, "manifest.json");
    await writeFile(copiedManifest, JSON.stringify(manifest));
    const result = await verifySchemaRelease({ repoRoot: repository, manifest: copiedManifest });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes("migration list")));
    assert.ok(result.errors.some((error) => error.includes("applyOrder")));
    assert.ok(result.errors.some((error) => error.includes("hashAlgorithm")));
  } finally {
    await removeTemp(temp);
  }
});
