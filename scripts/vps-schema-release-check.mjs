import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "deploy/vps/schema-release-039-042.json");
const expected = [
  "039_billing_lease_duplicate_alias.sql",
  "040_permission_evidence.sql",
  "041_guarded_retention.sql",
  "042_cron_expected_jobs.sql",
];

export async function verifySchemaRelease({ repoRoot = root, manifest = manifestPath } = {}) {
  const spec = JSON.parse(await readFile(manifest, "utf8"));
  const migrationsDir = path.join(repoRoot, "neon/migrations");
  const names = await readdir(migrationsDir);
  const migrations = [];
  const errors = [];

  for (const entry of spec.migrations) {
    let content;
    try {
      content = await readFile(path.join(migrationsDir, entry.file));
    } catch {
      errors.push(`missing migration ${entry.file}`);
      continue;
    }
    const canonicalSql = content.toString("utf8").replace(/\r\n?/g, "\n");
    const sha256 = createHash("sha256").update(canonicalSql, "utf8").digest("hex");
    const valid = sha256 === entry.sha256;
    migrations.push({ file: entry.file, sha256, valid });
    if (!valid) errors.push(`hash mismatch for ${entry.file}`);
  }

  if (JSON.stringify(spec.migrations.map(({ file }) => file)) !== JSON.stringify(expected)) {
    errors.push("manifest migration list must be exactly 039, 040, 041, 042 in numeric order");
  }
  if (JSON.stringify(spec.applyOrder) !== JSON.stringify(["039", "040", "041", "042"])) {
    errors.push("applyOrder must be exactly 039, 040, 041, 042");
  }
  if (spec.hashAlgorithm !== "sha256-lf-utf8") {
    errors.push("hashAlgorithm must be sha256-lf-utf8");
  }
  for (const file of expected) {
    if (!names.includes(file)) errors.push(`migration directory is missing ${file}`);
  }
  return { ok: errors.length === 0, release: spec.release, migrations, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifySchemaRelease();
  for (const migration of result.migrations) {
    console.log(`${migration.valid ? "OK" : "FAIL"} ${migration.file} sha256=${migration.sha256}`);
  }
  for (const error of result.errors) console.error(`FAIL ${error}`);
  if (result.ok) console.log(`Schema release ${result.release} is locally ready; no database was contacted.`);
  process.exitCode = result.ok ? 0 : 1;
}
