import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { checkGoogleReadiness } from "../scripts/a16-google-readiness.mjs";

const clientId = "fixture.apps.googleusercontent.com";
const baseEnv = {
  GOOGLE_CLIENT_ID: clientId,
  GOOGLE_CLIENT_SECRET: "fixture-secret-value",
  AUTH_SECRET: "fixture-signing-secret-that-is-long-enough-32chars",
  TOKEN_ENCRYPTION_KEY: "fixture-encryption-key",
  NEXT_PUBLIC_APP_URL: "https://ornigami.com/",
};

test("derives both callbacks from the runtime base URL and keeps provider gates unverified", () => {
  const result = checkGoogleReadiness({ env: baseEnv, environment: "production" });
  assert.deepEqual(result.callbacks.map(({ uri }) => uri), [
    "https://ornigami.com/api/auth/callback/google",
    "https://ornigami.com/api/google/oauth/callback",
  ]);
  assert.equal(result.localConfigStatus, "ready");
  assert.equal(result.overallStatus, "provider-unverified");
  assert.equal(result.providerStatus, "unverified");
  assert.equal(result.callbacks.every((callback) => callback.providerRegistration === "unverified"), true);
  assert.equal(result.checks.filter((check) => check.evidenceType === "provider").every((check) => check.status === "unverified"), true);
  assert.equal(JSON.stringify(result).includes("fixture-secret-value"), false);
});

test("uses the actual localhost runtime fallback and reports Auth.js URL alias conflicts", () => {
  const result = checkGoogleReadiness({
    env: {
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: "opaque-secret",
      AUTH_SECRET: "fixture-signing-secret-that-is-long-enough-32chars",
      TOKEN_ENCRYPTION_KEY: "fixture-encryption-key",
      AUTH_URL: "https://auth.example.test",
      NEXTAUTH_URL: "https://legacy.example.test",
    },
  });
  assert.deepEqual(result.callbacks.map(({ uri }) => uri), [
    "http://localhost:3000/api/auth/callback/google",
    "http://localhost:3000/api/google/oauth/callback",
  ]);
  assert.equal(result.checks.find((check) => check.id === "auth_url_alignment")?.status, "warn");
  assert.equal(result.checks.find((check) => check.id === "nextauth_url_alignment")?.status, "pass");
  assert.equal(result.checks.find((check) => check.id === "auth_url_alias_conflict")?.status, "warn");
  assert.equal(result.localConfigStatus, "review");
  assert.equal(result.overallStatus, "provider-unverified");
});

test("honors secret aliases, and enforces production fallbacks from NODE_ENV even for preview targets", () => {
  const fallback = checkGoogleReadiness({
    env: {
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: "opaque-secret",
      NEXTAUTH_SECRET: "legacy-signing-secret",
    },
    environment: "local",
  });
  assert.equal(fallback.checks.find((check) => check.id === "oauth_state_signing_secret")?.status, "pass");
  assert.equal(fallback.checks.find((check) => check.id === "google_token_encryption_key")?.status, "pass");

  const productionRuntime = checkGoogleReadiness({
    env: { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: "opaque-secret", NODE_ENV: "production" },
    environment: "preview",
  });
  assert.equal(productionRuntime.checks.find((check) => check.id === "oauth_state_signing_secret")?.status, "fail");
  assert.equal(productionRuntime.checks.find((check) => check.id === "google_token_encryption_key")?.status, "fail");
});

test("accepts the pinned Auth.js /api/auth base path while deriving the Business Profile URI from app URL", () => {
  for (const authUrl of ["https://ornigami.com/api/auth", "https://ornigami.com/api/auth/"]) {
    const result = checkGoogleReadiness({ env: { ...baseEnv, AUTH_URL: authUrl }, environment: "production" });
    assert.equal(result.checks.find((check) => check.id === "auth_url_alignment")?.status, "pass", authUrl);
    assert.deepEqual(result.callbacks.map(({ uri }) => uri), [
      "https://ornigami.com/api/auth/callback/google",
      "https://ornigami.com/api/google/oauth/callback",
    ]);
    assert.equal(result.callbacks[0].purpose, "authjs_google_sign_in_expected_registration");
    assert.equal(result.callbacks[1].purpose, "business_profile_oauth_runtime_redirect");
  }
});

test("rejects production URLs other than the canonical HTTPS origin", () => {
  const result = checkGoogleReadiness({ env: { ...baseEnv, NEXT_PUBLIC_APP_URL: "https://preview.example.test" }, environment: "production" });
  assert.equal(result.localConfigStatus, "blocked");
  assert.equal(result.checks.find((check) => check.id === "production_app_url")?.status, "fail");
  assert.equal(result.checks.find((check) => check.id === "production_https")?.status, "pass");
  assert.equal(result.overallStatus, "provider-unverified");

  for (const nonCanonical of ["https://ORNIGAMI.com", "https://ornigami.com:443"]) {
    const nonCanonicalResult = checkGoogleReadiness({ env: { ...baseEnv, NEXT_PUBLIC_APP_URL: nonCanonical }, environment: "production" });
    assert.equal(nonCanonicalResult.localConfigStatus, "blocked", nonCanonical);
    assert.equal(nonCanonicalResult.callbacks[0]?.uri, `${nonCanonical}/api/auth/callback/google`);
  }
});

test("trims only trailing slashes as the runtime does", () => {
  const result = checkGoogleReadiness({ env: { ...baseEnv, NEXT_PUBLIC_APP_URL: "https://ornigami.com///" }, environment: "production" });
  assert.equal(result.localConfigStatus, "ready");
  assert.equal(result.callbacks[0].uri, "https://ornigami.com/api/auth/callback/google");
});

test("malformed URL evidence is sanitized and never echoed", () => {
  const secretLookingUrl = "not-a-url-with-client-secret-value";
  const result = checkGoogleReadiness({
    env: { ...baseEnv, NEXT_PUBLIC_APP_URL: secretLookingUrl },
    environment: "production",
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.localConfigStatus, "blocked");
  assert.deepEqual(result.callbacks, []);
  assert.equal(serialized.includes(secretLookingUrl), false);
  assert.equal(serialized.includes(baseEnv.GOOGLE_CLIENT_SECRET), false);
});

test("rejects origin paths, query strings, fragments, and userinfo instead of normalizing them into callbacks", () => {
  for (const unsafeUrl of [
    "https://ornigami.com/base",
    "https://ornigami.com/private-token/..",
    "https://ornigami.com\\private-token",
    "https://ornigami.com/?token=do-not-print",
    "https://ornigami.com?",
    "https://ornigami.com/#fragment-secret",
    "https://ornigami.com#",
    "https://ornigami.com/\u0001control",
    "https://ornigami.com/\u0000",
    "https://user:password@ornigami.com",
  ]) {
    const result = checkGoogleReadiness({ env: { ...baseEnv, NEXT_PUBLIC_APP_URL: unsafeUrl }, environment: "production" });
    assert.equal(result.localConfigStatus, "blocked", unsafeUrl);
    assert.deepEqual(result.callbacks, [], unsafeUrl);
    assert.equal(JSON.stringify(result).includes(unsafeUrl), false, unsafeUrl);
    assert.equal(JSON.stringify(result).includes("do-not-print"), false, unsafeUrl);
    assert.equal(JSON.stringify(result).includes("fragment-secret"), false, unsafeUrl);
    assert.equal(JSON.stringify(result).includes("password"), false, unsafeUrl);
  }
});

test("Auth.js URL hints with dot segments or delimiter tricks produce sanitized review findings", () => {
  for (const unsafeAuthUrl of [
    "https://ornigami.com/private-token/../api/auth",
    "https://ornigami.com\\api\\auth",
    "https://ornigami.com/api/auth?",
    "https://ornigami.com/api/auth#",
    "https://ornigami.com/api/auth\u0007",
  ]) {
    const result = checkGoogleReadiness({ env: { ...baseEnv, AUTH_URL: unsafeAuthUrl }, environment: "production" });
    assert.equal(result.checks.find((check) => check.id === "auth_url_alignment")?.status, "warn", unsafeAuthUrl);
    assert.equal(JSON.stringify(result).includes(unsafeAuthUrl), false, unsafeAuthUrl);
    assert.equal(result.callbacks[0].uri, "https://ornigami.com/api/auth/callback/google");
  }
});

test("CLI JSON is sanitized and exits nonzero for missing required configuration", () => {
  const result = spawnSync(process.execPath, ["scripts/a16-google-readiness.mjs", "--json", "--environment", "production"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.localConfigStatus, "blocked");
  assert.equal(report.overallStatus, "provider-unverified");
  assert.equal(report.secretValuesIncluded, false);
  assert.equal(result.stdout.includes(baseEnv.GOOGLE_CLIENT_SECRET), false);
});

test("CLI emits sanitized JSON for an invalid URL and rejects unknown arguments", () => {
  const invalidValue = "unsafe-value-to-withhold";
  const invalid = spawnSync(process.execPath, ["scripts/a16-google-readiness.mjs", "--json", "--environment", "production"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...baseEnv, NEXT_PUBLIC_APP_URL: invalidValue },
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout.includes(invalidValue), false);
  assert.equal(JSON.parse(invalid.stdout).callbacks.length, 0);

  const unknown = spawnSync(process.execPath, ["scripts/a16-google-readiness.mjs", "--unknown"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, NODE_ENV: "test" },
  });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Invalid command line/);
  assert.equal(unknown.stderr.includes("--unknown"), false);
});
