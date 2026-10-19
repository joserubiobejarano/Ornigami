import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { getDatabaseDeadline } from "../src/lib/db/deadline.ts";
import { isPrivatePreviewMode } from "../src/lib/private-preview.ts";
import { applyProxySecurityHeaders } from "../src/lib/security-headers.ts";
import {
  privatePreviewDatabaseIdentityHttpResponse,
  preflightPrivatePreviewDatabaseIdentity,
  runPrivatePreviewDatabaseIdentityRoute,
  withPrivatePreviewDatabaseIdentityDeadline,
} from "../src/lib/private-preview-database-identity.ts";
import {
  isRestrictedDeletionSession,
  withPrivatePreviewIdentityPreflight,
} from "../src/lib/private-preview-database-identity-proxy.ts";

const targetHost = "ep-synthetic-branch.eu-west-2.aws.neon.tech";
const baseEnv = {
  VERCEL_ENV: "preview",
  ORNIGAMI_PRIVATE_STAGING_MODE: "true",
  VERCEL_GIT_COMMIT_REF: "codex/ornigami-staging-readiness-20261018",
  DATABASE_URL: `postgresql://synthetic:password@${targetHost}/ornigami_staging?sslmode=require`,
  ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: createHash("sha256").update(`${targetHost}:5432`).digest("hex"),
  ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: "ornigami_staging",
  ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "ornigami_staging_owner",
};
const identity = { databaseName: "ornigami_staging", roleName: "ornigami_staging_owner" };
const identityPath = "/api/private-preview/database-identity";

type Request = {
  pathname: string;
  cookie?: string;
  session?: { user?: { id?: string } };
  auth?: { accountLifecycle?: string; deletionUserId?: string; user?: { id?: string } };
};
type Result = { status: number; body: unknown; headers: Record<string, string> };

function createComposedPath(env: Record<string, string | undefined>, onDeadline?: (deadline: number | undefined) => void) {
  const counts = { auth: 0, route: 0, routeAuthentication: 0, identityQuery: 0, preflight: 0 };
  const authenticatedProxy = async (request: Request): Promise<Result> => {
    counts.auth += 1;
    if (isRestrictedDeletionSession(request.auth)) {
      return { status: 403, body: { error: "Restricted account session" }, headers: { "Content-Security-Policy": "proxy-csp", "Strict-Transport-Security": "proxy-hsts" } };
    }
    counts.route += 1;
    return runPrivatePreviewDatabaseIdentityRoute({
      env,
      privatePreview: isPrivatePreviewMode(env),
      authenticate: async () => {
        counts.routeAuthentication += 1;
        return typeof request.session?.user?.id === "string";
      },
      queryIdentity: async () => {
        counts.identityQuery += 1;
        return withPrivatePreviewDatabaseIdentityDeadline(async () => {
          onDeadline?.(getDatabaseDeadline());
          return identity;
        });
      },
    });
  };

  const proxy = withPrivatePreviewIdentityPreflight({
    authenticatedProxy,
    pathname: (request: Request) => request.pathname,
    preflight: () => {
      counts.preflight += 1;
      return preflightPrivatePreviewDatabaseIdentity(env, isPrivatePreviewMode(env));
    },
    reject: (status) => {
      const response = privatePreviewDatabaseIdentityHttpResponse(status);
      return {
        ...response,
        headers: Object.fromEntries(applySecurityHeaders(response.headers)),
      };
    },
  });
  return { proxy, counts };
}

test("pre-auth proxy preflight rejects non-private mode without session or query I/O", async () => {
  const env = { ...baseEnv, VERCEL_ENV: "production" };
  const { proxy, counts } = createComposedPath(env);
  const response = await proxy({ pathname: identityPath, cookie: "authjs.session-token=present", session: { user: { id: "synthetic-user" } } });
  assert.deepEqual(counts, { auth: 0, route: 0, routeAuthentication: 0, identityQuery: 0, preflight: 1 });
  assert.deepEqual(response.body, { status: "not_private_preview" });
  assert.equal(response.status, 404);
});

function applySecurityHeaders(headers: Record<string, string>): Headers {
  const responseHeaders = new Headers(headers);
  applyProxySecurityHeaders(responseHeaders, "mocked-nonce");
  return responseHeaders;
}

test("pre-auth proxy preflight rejects missing/invalid expectations and endpoint mismatch with a cookie", async () => {
  const variants = [
    { ...baseEnv, ORNIGAMI_PREVIEW_DB_EXPECTED_NAME: undefined },
    { ...baseEnv, ORNIGAMI_PREVIEW_DB_EXPECTED_ENDPOINT_SHA256: "invalid" },
    { ...baseEnv, ORNIGAMI_PREVIEW_DB_EXPECTED_ROLE: "invalid role" },
    { ...baseEnv, DATABASE_URL: "https://wrong.invalid/db" },
    { ...baseEnv, DATABASE_URL: `postgresql://synthetic:password@other-${targetHost}/ornigami_staging` },
  ];
  for (const env of variants) {
    const { proxy, counts } = createComposedPath(env);
    const response = await proxy({ pathname: identityPath, cookie: "authjs.session-token=present", session: { user: { id: "synthetic-user" } } });
    assert.deepEqual(counts, { auth: 0, route: 0, routeAuthentication: 0, identityQuery: 0, preflight: 1 });
    assert.deepEqual(response.body, { status: variants.indexOf(env) < 4 ? "configuration_invalid" : "identity_mismatch" });
    assert.equal(response.status, 503);
    assert.equal(response.headers["cache-control"], "no-store, max-age=0");
    assert.match(response.headers["content-security-policy"], /nonce-mocked-nonce/);
    assert.equal(response.headers["strict-transport-security"], "max-age=31536000; includeSubDomains; preload");
  }
});

test("preflight security headers do not parse unrelated invalid environment values", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "invalid synthetic URL containing no secret";
  try {
    const headers = applySecurityHeaders({ "Cache-Control": "no-store, max-age=0" });
    assert.match(headers.get("Content-Security-Policy") ?? "", /nonce-mocked-nonce/);
    assert.equal(headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains; preload");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("matching preflight preserves unauthenticated, deleting and valid session behavior", async () => {
  const unauthenticated = createComposedPath(baseEnv);
  const unauthenticatedResponse = await unauthenticated.proxy({ pathname: identityPath });
  assert.equal(unauthenticatedResponse.status, 401);
  assert.deepEqual(unauthenticatedResponse.body, { status: "unauthorized" });
  assert.equal(unauthenticatedResponse.headers["Cache-Control"], "no-store, max-age=0");
  assert.equal(unauthenticated.counts.auth, 1);
  assert.equal(unauthenticated.counts.routeAuthentication, 1);
  assert.equal(unauthenticated.counts.identityQuery, 0);

  const deleting = createComposedPath(baseEnv);
  const deletingResponse = await deleting.proxy({
    pathname: identityPath,
    auth: { accountLifecycle: "deleting", deletionUserId: "synthetic-user" },
  });
  assert.equal(deletingResponse.status, 403);
  assert.deepEqual(deletingResponse.body, { error: "Restricted account session" });
  assert.equal(deleting.counts.auth, 1);
  assert.equal(deleting.counts.route, 0);
  assert.equal(deleting.counts.identityQuery, 0);

  let deadline: number | undefined;
  const valid = createComposedPath(baseEnv, (value) => { deadline = value; });
  const response = await valid.proxy({ pathname: identityPath, session: { user: { id: "synthetic-user" } } });
  assert.deepEqual(response.body, { status: "verified" });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
  assert.ok(deadline && deadline > Date.now() && deadline <= Date.now() + 4_000);
  assert.deepEqual(valid.counts, { auth: 1, route: 1, routeAuthentication: 1, identityQuery: 1, preflight: 1 });
});

test("query errors stay fixed and unrelated routes retain the authenticated proxy path", async () => {
  const failureText = `password=secret ${targetHost} ornigami_staging ornigami_staging_owner`;
  const failure = await runPrivatePreviewDatabaseIdentityRoute({
    env: baseEnv,
    privatePreview: true,
    authenticate: async () => true,
    queryIdentity: async () => { throw new Error(failureText); },
  });
  assert.equal(failure.status, 503);
  assert.deepEqual(failure.body, { status: "verification_failed" });
  assert.equal(JSON.stringify(failure).includes("secret"), false);
  assert.equal(JSON.stringify(failure).includes(targetHost), false);
  assert.equal(JSON.stringify(failure).includes("ornigami_staging"), false);

  let preflightCalled = false;
  let authenticatedCalls = 0;
  const sentinel = { status: 204, body: null, headers: { "x-existing": "unchanged" } };
  const unrelatedProxy = withPrivatePreviewIdentityPreflight({
    authenticatedProxy: async (_request: Request) => { authenticatedCalls += 1; return sentinel; },
    pathname: (request: Request) => request.pathname,
    preflight: () => { preflightCalled = true; return "configuration_invalid"; },
    reject: () => { throw new Error("unrelated route must not use identity preflight"); },
  });
  assert.equal(await unrelatedProxy({ pathname: "/api/dashboard/summary" }), sentinel);
  assert.equal(preflightCalled, false);
  assert.equal(authenticatedCalls, 1);
});
