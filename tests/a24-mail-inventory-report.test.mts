import test from "node:test";
import assert from "node:assert/strict";
import { countBoosterQueue, createReportBody, runInventoryReport } from "../scripts/qr-mail-inventory-report.mjs";

type Env = Record<string, string>;
type Query = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ scanned_count: number }>>;
type RunReport = (input: { env: Env; submit: boolean; query?: Query; fetcher?: typeof fetch; now?: () => number }) => Promise<Record<string, unknown>>;
const runReport = runInventoryReport as unknown as RunReport;

const now = 1_800_000_000_000;
const env = {
  NODE_ENV: "test",
  QR_MAIL_AUTHORITY_URL: "https://authority.example/mail-authority/",
  QR_MAIL_BOOSTER_KEY_BINDING_REF: "ref:key-b",
  QR_MAIL_BOOSTER_ACCOUNT_BINDING: "account-b",
  QR_MAIL_BOOSTER_SOURCE_REVISION: "ref:revision-b",
  QR_MAIL_BOOSTER_AUTHORITY_TOKEN: "fake-bearer-b",
  QR_MAIL_DIRECT_KEY_BINDING_REF: "ref:key-d",
  QR_MAIL_DIRECT_ACCOUNT_BINDING: "account-d",
  QR_MAIL_DIRECT_SOURCE_REVISION: "ref:revision-d",
  QR_MAIL_DIRECT_AUTHORITY_TOKEN: "fake-bearer-d",
};

test("inventory count query is bounded, deduplicates held work, and selects no recipient data", async () => {
  let queryText = "";
  let queryValues;
  const sql: Query = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    queryText = strings.join("?");
    queryValues = values;
    return [{ scanned_count: 17 }];
  };
  assert.equal(await countBoosterQueue({ sql, limit: 500 }), 17);
  assert.deepEqual(queryValues, [501]);
  assert.match(queryText, /UNION/);
  assert.match(queryText, /'claimed','prepared','sending','unknown','reconciliation_required','deferred_quota'/);
  assert.doesNotMatch(queryText, /customer_email|recipient|email|body/i);
});

test("inventory queue overflow fails closed", async () => {
  const sql = async () => [{ scanned_count: 501 }];
  await assert.rejects(countBoosterQueue({ sql, limit: 500 }), /exceeded its bound/);
  await assert.rejects(countBoosterQueue({ sql, limit: 0 }), /bounded read-only/);
  await assert.rejects(countBoosterQueue({ sql, limit: 100_001 }), /bounded read-only/);
});

test("report body matches pinned inventory shape and 30-second freshness", () => {
  const report = createReportBody({
    env, group: "BOOSTER", manifestRef: `ref:${"a".repeat(64)}`, pathCount: 2,
    scanLimit: 500, scannedCount: 12, queuedCount: 12, now: new Date(now),
  });
  assert.deepEqual(Object.keys(report).sort(), [
    "purpose", "key_binding_ref", "account_binding", "source_revision", "manifest_ref", "scan_limit",
    "scanned_count", "queued_count", "complete", "observed_at", "expires_at", "path_count",
    "enforced_path_count", "all_paths_enforced",
  ].sort());
  assert.equal(Date.parse(report.expires_at) - Date.parse(report.observed_at), 30_000);
  assert.equal(report.all_paths_enforced, true);
});

test("fake report submission posts both source reports and refuses unbounded scans", async () => {
  const sent: Array<{ url: string; redirect: string | undefined; body: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (url, options) => {
    sent.push({ url: String(url), redirect: options?.redirect, body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const query: Query = async () => [{ scanned_count: 3 }];
  const result = await runReport({ env, submit: true, query, fetcher, now: () => now });
  assert.equal(result.boosterQueueCount, 3);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(({ body }) => [body.path_count, body.enforced_path_count, body.all_paths_enforced]), [[2, 2, true], [5, 5, true]]);
  assert.deepEqual(sent.map(({ body }) => body.queued_count), [3, 0]);
  assert.ok(sent.every(({ url, redirect, body }) => url === "https://authority.example/mail-authority/v1/mail/report" && redirect === "error" && body.complete === true));
  assert.ok(sent.every(({ body }) => typeof body.manifest_ref === "string" && /^ref:[0-9a-f]{64}$/.test(body.manifest_ref)));
  await assert.rejects(runReport({ env, submit: true, query: async () => [{ scanned_count: 501 }], fetcher, now: () => now }), /exceeded its bound/);
  assert.equal(sent.length, 2);
});

test("inventory dry run refuses to fabricate a zero Booster queue without a scan", async () => {
  await assert.rejects(runReport({ env, submit: false }), /queue scan is required/);
});
