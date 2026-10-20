import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { isPrivatePreviewMode } from "../src/lib/private-preview.ts";
import {
  checkPrivatePreviewDatabaseIdentity,
  type PrivatePreviewDbIdentityEnvironment,
} from "../src/lib/private-preview-database-identity.ts";

const targetHost = "ep-synthetic-branch.eu-west-2.aws.neon.tech";
const env: PrivatePreviewDbIdentityEnvironment = {
  DATABASE_URL: `postgresql://synthetic:password@${targetHost}/ornigami_staging?sslmode=require`,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: "a".repeat(64),
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "ornigami_staging",
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "ornigami_staging_owner",
};
const matchesConfiguredEndpoint = (value: PrivatePreviewDbIdentityEnvironment) => ({
  ...value,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: createHashForHost(targetHost),
});
const identity = { databaseName: "ornigami_staging", roleName: "ornigami_staging_owner" };

function createHashForHost(host: string): string {
  return createHash("sha256").update(`${host.toLowerCase()}:5432`, "utf8").digest("hex");
}

test("the exact private Preview predicate requires all three exact values", () => {
  const base = {
    VERCEL_ENV: "preview",
    ORNIGAMI_PRIVATE_STAGING_MODE: "true",
    VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018",
  };
  assert.equal(isPrivatePreviewMode(base), true);
  assert.equal(isPrivatePreviewMode({ ...base, VERCEL_ENV: "production" }), false);
  assert.equal(isPrivatePreviewMode({ ...base, ORNIGAMI_PRIVATE_STAGING_MODE: "TRUE" }), false);
  assert.equal(isPrivatePreviewMode({ ...base, VERCEL_GIT_COMMIT_REF: "main" }), false);
  const coolify = { NODE_ENV: "production", ORNIGAMI_PRIVATE_STAGING_PLATFORM: "coolify", ORNIGAMI_PRIVATE_STAGING_MODE: "true", NEXT_PUBLIC_APP_URL: "https://staging.ornigami.com", AUTH_URL: "https://staging.ornigami.com" };
  assert.equal(isPrivatePreviewMode(coolify), true);
  for (const invalid of [
    { ...coolify, NODE_ENV: "development" },
    { ...coolify, ORNIGAMI_PRIVATE_STAGING_PLATFORM: "other" },
    { ...coolify, ORNIGAMI_PRIVATE_STAGING_MODE: "false" },
    { ...coolify, NEXT_PUBLIC_APP_URL: "https://other.example" },
    { ...coolify, AUTH_URL: "https://other.example" },
    { ...coolify, VERCEL: "1" },
    { ...coolify, VERCEL_ENV: "production" },
    { ...coolify, VERCEL_GIT_COMMIT_REF: "main" },
  ]) assert.equal(isPrivatePreviewMode(invalid), false);
});

test("rejects non-private contexts before authentication or identity query", async () => {
  let authenticated = false;
  let queried = false;
  const status = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: false,
    authenticate: async () => { authenticated = true; return true; },
    queryIdentity: async () => { queried = true; return identity; },
  });
  assert.equal(status, "not_private_preview");
  assert.equal(authenticated, false);
  assert.equal(queried, false);
});

test("rejects unauthenticated requests without querying the database", async () => {
  let queried = false;
  const status = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: true,
    authenticate: async () => false,
    queryIdentity: async () => { queried = true; return identity; },
  });
  assert.equal(status, "unauthorized");
  assert.equal(queried, false);
});

test("fails closed on missing and invalid expected target configuration", async () => {
  let authenticated = false;
  let queried = false;
  for (const invalidEnv of [
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: undefined },
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: "not-a-digest" },
    { ...env, ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "bad role" },
    { ...env, DATABASE_URL: "https://not-a-database.invalid/path" },
  ]) {
    const status = await checkPrivatePreviewDatabaseIdentity({
      env: invalidEnv,
      privatePreview: true,
      authenticate: async () => { authenticated = true; return true; },
      queryIdentity: async () => { queried = true; return identity; },
    });
    assert.equal(status, "configuration_invalid");
  }
  assert.equal(authenticated, false);
  assert.equal(queried, false);
});

test("verifies only when independent endpoint, database and role expectations match", async () => {
  let queried = false;
  const status = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: true,
    authenticate: async () => true,
    queryIdentity: async () => { queried = true; return identity; },
  });
  assert.equal(status, "verified");
  assert.equal(queried, true);

  let mismatchQueried = false;
  let mismatchAuthenticated = false;
  const endpointMismatch = await checkPrivatePreviewDatabaseIdentity({
    env,
    privatePreview: true,
    authenticate: async () => { mismatchAuthenticated = true; return true; },
    queryIdentity: async () => { mismatchQueried = true; return identity; },
  });
  assert.equal(endpointMismatch, "identity_mismatch");
  assert.equal(mismatchAuthenticated, false);
  assert.equal(mismatchQueried, false);

  let portMismatchQueried = false;
  const portMismatch = await checkPrivatePreviewDatabaseIdentity({
    env: {
      ...matchesConfiguredEndpoint(env),
      DATABASE_URL: `postgresql://synthetic:password@${targetHost}:6432/ornigami_staging?sslmode=require`,
    },
    privatePreview: true,
    authenticate: async () => true,
    queryIdentity: async () => { portMismatchQueried = true; return identity; },
  });
  assert.equal(portMismatch, "identity_mismatch");
  assert.equal(portMismatchQueried, false);

  for (const mismatched of [
    { databaseName: "other_database", roleName: identity.roleName },
    { databaseName: identity.databaseName, roleName: "other_role" },
  ]) {
    const result = await checkPrivatePreviewDatabaseIdentity({
      env: matchesConfiguredEndpoint(env),
      privatePreview: true,
      authenticate: async () => true,
      queryIdentity: async () => mismatched,
    });
    assert.equal(result, "identity_mismatch");
  }
});

test("bounds a stalled query and maps thrown raw errors to fixed status", async () => {
  const stalled = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: true,
    authenticate: async () => true,
    queryIdentity: () => new Promise(() => undefined),
    timeoutMs: 15,
  });
  assert.equal(stalled, "verification_failed");

  const failureText = `password=secret ${targetHost} ornigami_staging ornigami_staging_owner`;
  const failed = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: true,
    authenticate: async () => { throw new Error(failureText); },
    queryIdentity: async () => { throw new Error(failureText); },
  });
  assert.equal(failed, "verification_failed");
  assert.equal(JSON.stringify({ status: failed }).includes("secret"), false);
  assert.equal(JSON.stringify({ status: failed }).includes(targetHost), false);
  assert.equal(JSON.stringify({ status: failed }).includes("ornigami_staging"), false);

  const queryFailure = await checkPrivatePreviewDatabaseIdentity({
    env: matchesConfiguredEndpoint(env),
    privatePreview: true,
    authenticate: async () => true,
    queryIdentity: async () => { throw new Error(failureText); },
  });
  assert.equal(queryFailure, "verification_failed");
  assert.deepEqual({ status: queryFailure }, { status: "verification_failed" });
});
