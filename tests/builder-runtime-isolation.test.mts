import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const root = process.cwd();
const appRoot = join(root, "builder-runtime");
const forbidden =
  /(?:@\/auth|next-auth|@sentry|lib\/db|lib\/stripe|lib\/billing|lib\/google|lib\/cron|lib\/openai|lib\/resend|lib\/privacy-|services\/review|api\/cron|campaign-lab\/generate)/i;

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function routeFiles(directory: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      output.push(...routeFiles(path));
    } else if (entry.isFile() && /^(?:page|route)\.(?:ts|tsx)$/.test(entry.name)) {
      output.push(relative(appRoot, path).replaceAll("\\", "/"));
    }
  }
  return output.sort();
}

test("the builder runtime owns only the builder route surface", () => {
  assert.deepEqual(routeFiles(join(appRoot, "app")), [
    "app/api/builder/generate/route.ts",
    "app/api/builder/session/logout/route.ts",
    "app/api/builder/session/redeem/route.ts",
    "app/api/builder/session/route.ts",
    "app/builder/page.tsx",
    "app/page.tsx",
  ]);
});

test("the builder application files have no legacy auth, provider, database, job or Sentry imports", () => {
  const files = [
    "app/layout.tsx",
    "app/page.tsx",
    "app/builder/page.tsx",
    "app/builder/not-found.tsx",
    "app/not-found.tsx",
    "app/error.tsx",
    "app/global-error.tsx",
    "app/api/builder/generate/route.ts",
    "app/api/builder/session/route.ts",
    "app/api/builder/session/redeem/route.ts",
    "app/api/builder/session/logout/route.ts",
    "app/_components/builder-closed.tsx",
    "app/_components/builder-sign-in.tsx",
    "app/_components/builder-logout-button.tsx",
    "app/_components/builder-runtime-shell.tsx",
    "app/_components/builder-runtime-workspace.tsx",
    "lib/identity-store.ts",
    "lib/runtime-config.ts",
    "lib/session.ts",
    "lib/usage-ledger.ts",
    "lib/generation-limits.ts",
    "lib/operational-signals.ts",
    "lib/test-provider.ts",
    "proxy.ts",
    "instrumentation.ts",
    "next.config.ts",
  ];
  for (const file of files) {
    const source = withoutComments(readFileSync(join(appRoot, file), "utf8"));
    assert.doesNotMatch(source, forbidden, file);
  }
});

test("the builder proxy and startup hook are independent of reputation Auth.js and Sentry", () => {
  const proxy = withoutComments(readFileSync(join(appRoot, "proxy.ts"), "utf8"));
  assert.match(proxy, /buildBuilderContentSecurityPolicy/);
  assert.match(proxy, /applyBuilderProxySecurityHeaders/);
  assert.match(proxy, /Cache-Control", "no-store"/);
  assert.doesNotMatch(proxy, /Auth|auth\(|getMiddlewareAccessState|private-preview/i);

  const instrumentation = withoutComments(
    readFileSync(join(appRoot, "instrumentation.ts"), "utf8"),
  );
  assert.match(instrumentation, /assertBuilderRuntimeStartupConfiguration/);
  assert.doesNotMatch(instrumentation, /Sentry|sentry|next-auth|database|stripe|resend|openai/i);

  const nextConfig = withoutComments(
    readFileSync(join(appRoot, "next.config.ts"), "utf8"),
  );
  assert.match(nextConfig, /agentUpgrade: false/);
  assert.match(nextConfig, /sri: \{ algorithm: "sha256"/);
  assert.match(nextConfig, /outputFileTracingRoot/);
  assert.doesNotMatch(nextConfig, /withSentryConfig|@sentry|isPrivatePreviewMode|GOOGLE_CLIENT|AUTH_SECRET/);
});

test("the builder build/start scripts use builder-only configuration", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["builder:build"],
    "npm run builder:assets && next build builder-runtime --webpack && node scripts/finalize-sri-manifest.mjs builder-runtime && node scripts/generate-static-csp-hashes.mjs builder-runtime",
  );
  assert.equal(
    packageJson.scripts["builder:start"],
    "npm run builder:assets && next start builder-runtime",
  );
  assert.equal(
    packageJson.scripts["builder:test:build"],
    "node scripts/builder-runtime-qualify.mjs smoke",
  );

  const qualification = withoutComments(readFileSync(
    join(root, "scripts", "builder-runtime-qualify.mjs"),
    "utf8",
  ));
  assert.match(qualification, /builder-runtime/);
  assert.match(qualification, /offline-guard\.cjs/);
  assert.doesNotMatch(
    qualification,
    /GOOGLE_CLIENT|AUTH_SECRET|DATABASE_URL|STRIPE_|RESEND_|CRON_SECRET|OPENAI_/,
  );
});

test("builder-local assets are copied from the admitted root font and icon set", () => {
  const script = readFileSync(
    join(root, "scripts", "builder-runtime-public.mjs"),
    "utf8",
  );
  assert.match(script, /join\(sourcePublic, "fonts"\)/);
  for (const icon of [
    "ornigami-favicon.svg",
    "ornigami-mark-16.png",
    "ornigami-mark-32.png",
    "ornigami-mark-180.png",
  ]) {
    assert.ok(script.includes(icon), icon);
  }
  assert.doesNotMatch(script, /campaign-assets|brand-originals|docs|\.env/i);
});
