import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const sourcePaths = ["src", "migration-sources", "scripts"];

async function filesUnder(path: string): Promise<string[]> {
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(child);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [child] : [];
  }));
  return nested.flat();
}

test("maintained source manifest lists all executable mail sender paths", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "scripts/qr-mail-sources.json"), "utf8")) as Record<string, string[]>;
  const scanned = (await Promise.all(sourcePaths.map(filesUnder))).flat().sort();
  const source = new Map(await Promise.all(scanned.map(async (path) => [path, await readFile(resolve(root, path), "utf8")] as const)));
  for (const path of [...manifest.booster!, ...manifest.direct!, ...manifest.excluded_read_or_webhook_operations!]) {
    assert.ok(source.has(path), `manifest path is missing from scan: ${path}`);
  }

  const matches = (pattern: RegExp) => scanned.filter((path) => pattern.test(source.get(path) ?? ""));
  const qrCalls = new Set(matches(/\bsendAuthorizedResend\s*\(/));
  assert.deepEqual([...qrCalls].sort(), [
    "src/app/api-public-demo-review-booster/route.ts", "src/lib/auth-verification.ts", "src/lib/qr-mail.ts",
    "src/lib/review-alerts.ts", "src/lib/team.ts", "src/modules/review-booster/services/resend.provider.ts",
  ].sort(), "new direct-authority callsites need an explicit manifest entry");
  for (const path of qrCalls) assert.ok([...manifest.booster!, ...manifest.direct!].includes(path), `mail sender path not listed: ${path}`);

  const directEndpoints = matches(/https:\/\/api\.resend\.com\/emails(?:["'`]|\s)/);
  assert.deepEqual(directEndpoints, ["src/lib/qr-mail.ts"], "provider email POST must stay inside the shared authority transport");
  assert.deepEqual(matches(/\bresend\.emails\.send\s*\(/), [], "provider SDK direct sends must be routed through the authority adapter");
  for (const path of [...matches(/\bsendWithResend\s*\(/), ...matches(/\bsendPreparedWithResend\s*\(/)]) {
    assert.ok([...manifest.booster!, ...manifest.direct!].includes(path), `provider wrapper path not listed: ${path}`);
  }
  assert.match(source.get("migration-sources/follow-up/src/server/services/email/resend-provider.ts") ?? "", /Historical follow-up sender is disabled/);
  assert.match(source.get("migration-sources/contactor/src/server/services/notifications/email/resend-email.provider.ts") ?? "", /Historical Contactor sender is disabled/);
  assert.match(source.get("scripts/a10-live-resend-guards.mjs") ?? "", /A10 direct email sends are disabled/);
  assert.match(source.get("scripts/a17-live-provider-probes.mjs") ?? "", /sendPreparedWithResend/);
});

test("source manifest separates Booster and direct enrollments and documents read-only exclusions", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "scripts/qr-mail-sources.json"), "utf8")) as Record<string, string[]>;
  assert.ok(manifest.booster?.includes("src/modules/review-booster/services/followup-runner.service.ts"));
  assert.ok(manifest.direct?.includes("src/lib/auth-verification.ts"));
  assert.ok(!manifest.booster?.includes("src/lib/auth-verification.ts"));
  assert.ok(manifest.excluded_read_or_webhook_operations?.includes("src/modules/review-booster/services/resend-reconciliation.service.ts"));
  assert.ok(manifest.excluded_read_or_webhook_operations?.includes("scripts/a10-resend-endpoint.mjs"));
});
