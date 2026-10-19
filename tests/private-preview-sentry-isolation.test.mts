import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { isPrivatePreviewMode } from "../src/lib/private-preview.ts";
import { loadTs } from "./a02-test-support.mts";

const privateEnv = {
  VERCEL_ENV: "preview",
  ORNIGAMI_PRIVATE_STAGING_MODE: "true",
  VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018",
  NEXT_PUBLIC_SENTRY_DSN: "https://synthetic@example.test/42",
  SENTRY_AUTH_TOKEN: "synthetic-build-token",
};

function loadNextConfig(env: Record<string, string | undefined>) {
  let wrapperCalls = 0;
  let wrapperOptions: Record<string, unknown> | undefined;
  const filename = resolve("next.config.ts");
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const moduleRecord: { exports: Record<string, unknown> } = { exports: {} };
  const nextEnv = { ...process.env, ...env };
  const localRequire = (id: string): unknown => {
    if (id === "@sentry/nextjs") return { withSentryConfig: (config: unknown, options: Record<string, unknown>) => {
      wrapperCalls += 1;
      wrapperOptions = options;
      return { ...config as object, sentryWrapperApplied: true };
    } };
    if (id === "./src/lib/private-preview") return { isPrivatePreviewMode: () => isPrivatePreviewMode(env) };
    if (id === "./src/lib/security-headers") return {
      TRUSTED_TYPES_REPORT_ONLY_POLICY: "trusted-types default",
      TRUSTED_TYPES_REPORTING_ENDPOINT: "csp-endpoint=\"/api/csp-report\"",
    };
    throw new Error(`Unexpected Next config dependency: ${id}`);
  };
  const execute = vm.runInNewContext(`(function(exports, require, module) { ${output}\n})`, {
    process: { ...process, env: nextEnv },
  }) as (exports: object, require: typeof localRequire, module: typeof moduleRecord) => void;
  execute(moduleRecord.exports, localRequire, moduleRecord);
  return { config: moduleRecord.exports.default as Record<string, unknown>, wrapperCalls, wrapperOptions };
}

test("private Preview bypasses the Sentry build wrapper while preserving SRI", () => {
  const { config, wrapperCalls } = loadNextConfig(privateEnv);
  assert.equal(wrapperCalls, 0, "no Sentry build plugin, release hook, upload, or build telemetry is installed");
  assert.equal((config.env as Record<string, string>).NEXT_PUBLIC_ORNIGAMI_SENTRY_DISABLED, "true");
  assert.equal((config.experimental as { sri: { algorithm: string } }).sri.algorithm, "sha256");
});

test("missing or mismatched private Preview predicate retains Sentry build behavior", () => {
  const cases = [
    { ...privateEnv, VERCEL_ENV: undefined },
    { ...privateEnv, ORNIGAMI_PRIVATE_STAGING_MODE: undefined },
    { ...privateEnv, VERCEL_GIT_COMMIT_REF: "other-branch" },
    { ...privateEnv, VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://ornigami.com" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018" },
  ];
  for (const env of cases) {
    const { config, wrapperCalls, wrapperOptions } = loadNextConfig(env);
    assert.equal(wrapperCalls, 1);
    assert.notEqual((config.env as Record<string, string> | undefined)?.NEXT_PUBLIC_ORNIGAMI_SENTRY_DISABLED, "true");
    assert.equal((wrapperOptions?.webpack as Record<string, unknown> | undefined)?.disableSentryConfig, undefined);
    assert.equal((config.experimental as { sri: { algorithm: string } }).sri.algorithm, "sha256");
  }
});

type RuntimeHarness = ReturnType<typeof createRuntimeHarness>;
function createRuntimeHarness(env: Record<string, string | undefined>) {
  let initCalls = 0;
  let captureCalls = 0;
  let flushCalls = 0;
  let sdkImports = 0;
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const sentry = {
    init: () => { initCalls += 1; },
    withScope: (callback: (scope: Record<string, () => void>) => void) => callback({
      clear: () => undefined,
      setTag: () => undefined,
    }),
    captureException: () => { captureCalls += 1; },
    flush: async () => { flushCalls += 1; return true; },
  };

  const load = (relativePath: string): Record<string, unknown> => {
    const filename = resolve(relativePath);
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const moduleRecord: { exports: Record<string, unknown> } = { exports: {} };
    modules.set(filename, moduleRecord);
    const localRequire = (id: string): unknown => {
      if (id === "@sentry/nextjs") {
        sdkImports += 1;
        return sentry;
      }
      if (id === "@/lib/private-preview" || id === "./src/lib/private-preview") {
        return { isPrivatePreviewMode: () => isPrivatePreviewMode(env) };
      }
      if (id === "./src/lib/sentry-options") return { SENTRY_OPTIONS: { sendDefaultPii: false } };
      if (id === "./src/lib/sentry-server-events") return { sanitizeServerEvent: (event: unknown) => event };
      if (id === "../sentry.server.config") return load("sentry.server.config.ts");
      if (id === "../sentry.edge.config") return load("sentry.edge.config.ts");
      throw new Error(`Unexpected runtime dependency: ${id}`);
    };
    const execute = vm.runInNewContext(`(function(exports, require, module) { ${output}\n})`, {
      process: { ...process, env },
      setTimeout, clearTimeout, console,
    }) as (exports: object, require: typeof localRequire, module: typeof moduleRecord) => void;
    execute(moduleRecord.exports, localRequire, moduleRecord);
    return moduleRecord.exports;
  };
  return {
    load,
    get initCalls() { return initCalls; },
    get captureCalls() { return captureCalls; },
    get flushCalls() { return flushCalls; },
    get sdkImports() { return sdkImports; },
  };
}

test("private Preview skips server and edge initialization and request-error transport despite configured DSN", async () => {
  for (const runtime of ["nodejs", "edge"]) {
    const env = { ...privateEnv, NEXT_RUNTIME: runtime };
    const harness: RuntimeHarness = createRuntimeHarness(env);
    const instrumentation = harness.load("src/instrumentation.ts") as {
      register: () => Promise<void>;
      onRequestError: (error: unknown) => Promise<void>;
    };
    await instrumentation.register();
    await instrumentation.onRequestError(new Error("synthetic private server error"));
    const config = harness.load(runtime === "nodejs" ? "sentry.server.config.ts" : "sentry.edge.config.ts") as {
      registerSentry: () => Promise<void>;
    };
    await config.registerSentry();
    assert.equal(harness.sdkImports, 0);
    assert.equal(harness.initCalls, 0);
    assert.equal(harness.captureCalls, 0);
    assert.equal(harness.flushCalls, 0);
  }
});

test("ordinary Preview and Production retain runtime Sentry initialization and request-error capture", async () => {
  const cases = [
    { ...privateEnv, VERCEL_GIT_COMMIT_REF: "ordinary-preview" },
    { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018", NEXT_PUBLIC_SENTRY_DSN: privateEnv.NEXT_PUBLIC_SENTRY_DSN },
    { ...privateEnv, VERCEL_ENV: "production" },
  ];
  for (const env of cases) {
    for (const runtime of ["nodejs", "edge"]) {
      const harness = createRuntimeHarness({ ...env, NEXT_RUNTIME: runtime });
      const instrumentation = harness.load("src/instrumentation.ts") as {
        register: () => Promise<void>;
        onRequestError: (error: unknown) => Promise<void>;
      };
      await instrumentation.register();
      await instrumentation.onRequestError(new Error("synthetic ordinary error"));
      assert.equal(harness.initCalls, 1);
      assert.equal(harness.captureCalls, 1);
      assert.equal(harness.flushCalls, 1);
    }
  }
});

test("private Preview cron alert delivery never calls Sentry even with DSN and an initialized client", async () => {
  const previousEnv = { ...process.env };
  Object.assign(process.env, privateEnv);
  const calls = { imports: 0, init: 0, capture: 0, flush: 0, database: 0 };
  const sentry = {
    getClient: () => ({ on: () => () => undefined }),
    withScope: async (callback: (scope: Record<string, () => void>) => void) => callback({
      clearBreadcrumbs: () => undefined,
      clearAttachments: () => undefined,
      setUser: () => undefined,
      setLevel: () => undefined,
      setTag: () => undefined,
      addEventProcessor: () => undefined,
    }),
    captureMessage: () => { calls.capture += 1; return "synthetic-event"; },
    flush: async () => { calls.flush += 1; return true; },
  };
  try {
    const mocks: Record<string, unknown> = {
      "@/lib/private-preview": { isPrivatePreviewMode: () => true },
      "@/lib/openai-feature": { isOpenAIEnabled: () => false },
      "@/lib/safe-logger": { safeLogger: { error: () => undefined } },
      "@/lib/db/neon": { sql: async (parts: TemplateStringsArray) => {
        calls.database += 1;
        const query = parts.join(" ");
        if (query.includes("claim_cron_alerts")) return [{ alert_key: "privacy_retention:failed", job_name: "privacy_retention", reason: "failed" }];
        if (query.includes("count(*)")) return [{ active_count: 1, transport_failures: 0 }];
        throw new Error("unexpected synthetic SQL fixture");
      } },
    };
    Object.defineProperty(mocks, "@sentry/nextjs", { get: () => { calls.imports += 1; return sentry; } });
    const alerts = loadTs<typeof import("../src/lib/cron-alerts.ts")>("src/lib/cron-alerts.ts", mocks);
    assert.deepEqual(await alerts.evaluateCronAlerts(), { ok: false, activeCount: 0, transportFailures: 0 });
    assert.deepEqual(calls, { imports: 0, init: 0, capture: 0, flush: 0, database: 0 });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});
