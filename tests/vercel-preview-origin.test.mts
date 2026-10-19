import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const configSource = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const compiledConfig = ts.transpileModule(configSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function loadNextConfig(env: Record<string, string | undefined>) {
  const exports: Record<string, unknown> = {};
  const module = { exports };
  const require = (specifier: string): unknown => {
    if (specifier === "@sentry/nextjs") {
      return { withSentryConfig: (config: unknown) => config };
    }
    if (specifier === "./src/lib/security-headers") {
      return {
        TRUSTED_TYPES_REPORT_ONLY_POLICY: "test-policy",
        TRUSTED_TYPES_REPORTING_ENDPOINT: 'csp-endpoint="/api/csp-report"',
      };
    }
    throw new Error(`Unexpected next.config.ts import: ${specifier}`);
  };

  vm.runInNewContext(compiledConfig, { exports, module, require, process: { env } });
  return module.exports.default as Record<string, unknown>;
}

test("Vercel Preview accepts the selected staging origin", () => {
  const config = loadNextConfig({
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_APP_URL: "https://staging.ornigami.com",
  });

  assert.equal((config.experimental as { sri: { algorithm: string } }).sri.algorithm, "sha256");
});

test("Vercel Production keeps the canonical origin guard", () => {
  assert.doesNotThrow(() => loadNextConfig({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://ornigami.com",
  }));
  assert.throws(() => loadNextConfig({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://staging.ornigami.com",
  }), /NEXT_PUBLIC_APP_URL must be https:\/\/ornigami\.com in Vercel production/);
  assert.throws(() => loadNextConfig({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  }), /NEXT_PUBLIC_APP_URL must be https:\/\/ornigami\.com in Vercel production/);
});
