import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SOURCES = JSON.parse(await readFile(resolve(ROOT, "scripts/qr-mail-sources.json"), "utf8"));
export const MAX_BOOSTER_QUEUE_SCAN = 500;
const REPORT_TTL_MS = 30_000;
const PURPOSE_PATH_COUNTS = { BOOSTER: 2, DIRECT: 5 };
const CODE_ROOTS = ["src", "migration-sources", "scripts"];

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; no inventory report was submitted.`);
  return value;
}

export async function scanSourceManifest({ root = ROOT, paths }) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((path) => typeof path !== "string")) {
    throw new Error("Source manifest is empty or invalid.");
  }
  const unique = [...new Set(paths)].sort();
  const hash = createHash("sha256");
  for (const path of unique) {
    const bytes = await readFile(resolve(root, path));
    hash.update(path, "utf8").update("\0").update(bytes).update("\0");
  }
  return { manifestRef: `ref:${hash.digest("hex")}`, pathCount: unique.length };
}

async function filesUnder(root, directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(root, path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

export async function validateSourceInventory({ root = ROOT, sources = SOURCES } = {}) {
  const listed = new Set([...sources.booster, ...sources.direct, ...sources.excluded_read_or_webhook_operations]);
  const files = (await Promise.all(CODE_ROOTS.map((directory) => filesUnder(root, directory)))).flat().sort();
  const patterns = [/\bsendAuthorizedResend\s*\(/, /\bsendWithResend\s*\(/, /\bsendPreparedWithResend\s*\(/, /https:\/\/api\.resend\.com\/emails(?:["'`]|\s)/];
  const missing = [];
  for (const path of files) {
    if (path === "scripts/qr-mail-inventory-report.mjs") continue;
    const text = await readFile(resolve(root, path), "utf8");
    if (patterns.some((pattern) => pattern.test(text)) && !listed.has(path)) missing.push(path);
  }
  if (missing.length) throw new Error(`Unlisted mail sender source paths: ${missing.sort().join(", ")}`);
  return { scannedFiles: files.length, listedSenderPaths: listed.size };
}

export async function countBoosterQueue({ sql, limit = MAX_BOOSTER_QUEUE_SCAN }) {
  if (typeof sql !== "function" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100_000) throw new Error("A bounded read-only database query function is required.");
  const rows = await sql`
    SELECT count(*)::int AS scanned_count FROM (
      SELECT work_id FROM (
        SELECT v.id::text AS work_id
        FROM public.followup_visits v
        WHERE v.followup_sent_at IS NULL
          AND lower(coalesce(v.followup_status, '')) IN ('pending','failed','deferred_quota')
        UNION
        SELECT d.visit_id::text AS work_id
        FROM public.booster_followup_deliveries d
        WHERE d.state IN ('claimed','prepared','sending','unknown','reconciliation_required','deferred_quota','rejected')
      ) AS deduplicated_work
      ORDER BY work_id
      LIMIT ${limit + 1}
    ) AS bounded_work
  `;
  const count = Number(rows[0]?.scanned_count);
  if (!Number.isSafeInteger(count) || count < 0 || count > limit) {
    throw new Error("Booster queue scan exceeded its bound; no inventory report was submitted.");
  }
  return count;
}

export function createReportBody({ env, group, manifestRef, pathCount, scanLimit, scannedCount, queuedCount, now = new Date() }) {
  if (!Number.isSafeInteger(pathCount) || pathCount !== PURPOSE_PATH_COUNTS[group]) throw new Error("Source path count does not match the maintained purpose inventory.");
  if (!Number.isSafeInteger(scanLimit) || scanLimit < 1 || scanLimit > 100_000
      || !Number.isSafeInteger(scannedCount) || scannedCount < 0 || scannedCount > scanLimit
      || !Number.isSafeInteger(queuedCount) || queuedCount < 0 || queuedCount > scannedCount) {
    throw new Error("Inventory counts are outside the report bounds.");
  }
  return {
    purpose: "inventory",
    key_binding_ref: required(env, `QR_MAIL_${group}_KEY_BINDING_REF`),
    account_binding: required(env, `QR_MAIL_${group}_ACCOUNT_BINDING`),
    source_revision: required(env, `QR_MAIL_${group}_SOURCE_REVISION`),
    manifest_ref: manifestRef,
    scan_limit: scanLimit,
    scanned_count: scannedCount,
    queued_count: queuedCount,
    complete: true,
    observed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + REPORT_TTL_MS).toISOString(),
    path_count: pathCount,
    enforced_path_count: pathCount,
    all_paths_enforced: true,
  };
}

export async function postReport({ env = process.env, group, report, fetcher = fetch, now = Date.now }) {
  const base = new URL(required(env, "QR_MAIL_AUTHORITY_URL"));
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Inventory authority URL must be a clean HTTPS origin.");
  const current = now();
  if (Date.parse(report.observed_at) > current || Date.parse(report.observed_at) < current - REPORT_TTL_MS
      || Date.parse(report.expires_at) <= current || Date.parse(report.expires_at) > current + REPORT_TTL_MS) {
    throw new Error("Inventory report is outside the authority freshness window.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const mount = base.pathname.replace(/\/+$/, "");
    const response = await fetcher(new URL(`${mount}/v1/mail/report`, base.origin), {
      method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { Authorization: `Bearer ${required(env, `QR_MAIL_${group}_AUTHORITY_TOKEN`)}`, "Content-Type": "application/json" },
      body: JSON.stringify(report),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`Inventory report was rejected for ${group}.`);
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024) { await reader.cancel(); throw new Error("Inventory report response exceeded its bound."); }
      chunks.push(value);
    }
    if (!response.ok) throw new Error(`Inventory report was rejected for ${group} (${response.status}).`);
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (result?.ok !== true) throw new Error(`Inventory report was not accepted for ${group}.`);
  } finally { clearTimeout(timer); }
}

export async function runInventoryReport({ env = process.env, submit = false, query = null, fetcher = fetch, now = Date.now }) {
  if (typeof query !== "function") throw new Error("A bounded Booster queue scan is required; no inventory report was submitted.");
  const inventoryScan = await validateSourceInventory();
  const manifests = {};
  for (const group of ["BOOSTER", "DIRECT"]) {
    const key = group.toLowerCase();
    manifests[group] = { ...await scanSourceManifest({ paths: SOURCES[key] }), pathCount: PURPOSE_PATH_COUNTS[group] };
  }
  const boosterCount = await countBoosterQueue({ sql: query });
  if (!submit) return { ready: true, submit: false, sources: 2, boosterQueueCount: boosterCount, directQueuedCount: 0, manifests, inventoryScan };
  const boosterReport = createReportBody({ env, group: "BOOSTER", ...manifests.BOOSTER, scanLimit: MAX_BOOSTER_QUEUE_SCAN, scannedCount: boosterCount, queuedCount: boosterCount, now: new Date(now()) });
  const directReport = createReportBody({ env, group: "DIRECT", ...manifests.DIRECT, scanLimit: 1, scannedCount: 0, queuedCount: 0, now: new Date(now()) });
  await postReport({ env, group: "BOOSTER", report: boosterReport, fetcher, now });
  await postReport({ env, group: "DIRECT", report: directReport, fetcher, now });
  return { ready: true, submit: true, sources: 2, boosterQueueCount: boosterCount };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const sql = neon(required(process.env, "DATABASE_URL"), { fetchOptions: { signal: controller.signal } });
    const result = await runInventoryReport({ submit: process.argv.includes("--submit"), query: sql });
    console.log(JSON.stringify(result));
  } finally { clearTimeout(timer); }
}
