import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

test("auth JWTs bind to credentials and reject stale, deleted, legacy, or unverifiable users", async () => {
  let dbVersion = 7;
  let bumpDuringCompare = false;
  let lookupFails = false;
  let userDeleted = false;
  let oauthWrites = 0;
  let findByEmailCalls = 0;
  const row = { id: "u1", auth_version: 7, email: "person@example.com", name: "Person", image: null, password_hash: "hash", email_verified: "now" };
  const loaded = loadTs<{ authConfig: {
    providers: Array<{ kind: string; options: Record<string, unknown> }>;
    callbacks: {
      jwt(input: never): Promise<unknown>;
      session(input: never): Promise<unknown>;
      redirect(input: never): Promise<string>;
    };
  } }>("src/auth.ts", {
    overrides: {
      "next-auth": { __esModule: true, default: () => ({ handlers: {}, auth: () => undefined, signIn: () => undefined, signOut: () => undefined }) },
      "next-auth/providers/google": { __esModule: true, default: (options: unknown) => ({ kind: "google", options }) },
      "next-auth/providers/credentials": { __esModule: true, default: (options: unknown) => ({ kind: "credentials", options }) },
      bcryptjs: { compare: async () => { if (bumpDuringCompare) dbVersion++; return true; } },
      "@/lib/db/users": {
        findUserByEmail: async () => { findByEmailCalls++; return row; },
        findUserById: async (id: string) => {
          if (lookupFails) throw new Error("db unavailable");
          return !userDeleted && id === "u1" ? { id, auth_version: dbVersion } : null;
        },
        ensureUserFromOAuth: async () => { oauthWrites++; return { id: "u1", auth_version: dbVersion }; },
      },
      "@/lib/auth-rate-limit": {
        clearCredentialsLoginFailures: async () => undefined,
        isCredentialsLoginRateLimited: async () => false,
        recordCredentialsLoginFailure: async () => undefined,
      },
      "@/lib/env": { getRequiredEnv: (name: string) => name },
    },
  });
  const provider = loaded.authConfig.providers.find((item) => item.kind === "credentials");
  assert.ok(provider);
  const authorize = provider.options.authorize as (credentials: Record<string, unknown>, request: { headers: Headers }) => Promise<Record<string, unknown> | null>;
  const request = { headers: new Headers({ "x-real-ip": "203.0.113.2" }) };
  const user = await authorize({ email: "PERSON@example.com", password: "password123" }, request);
  assert.equal(user?.authVersion, 7);
  assert.equal(findByEmailCalls, 1);
  dbVersion = 7;
  bumpDuringCompare = true;
  const raced = await authorize({ email: "person@example.com", password: "password123" }, request);
  assert.equal(raced?.authVersion, 7);
  assert.equal(await loaded.authConfig.callbacks.jwt({ token: {}, user: raced, account: null } as never), null);

  bumpDuringCompare = false; dbVersion = 7;
  const jwt = loaded.authConfig.callbacks.jwt;
  const token = await jwt({ token: {}, user, account: null } as never) as { sub: string; authVersion: number };
  assert.deepEqual({ sub: token.sub, authVersion: token.authVersion }, { sub: "u1", authVersion: 7 });
  assert.ok(await jwt({ token, user: undefined, account: null } as never));
  assert.equal(await jwt({ token: { sub: "u1" }, user: undefined, account: null } as never), null);
  dbVersion = 8;
  assert.equal(await jwt({ token, user: undefined, account: null } as never), null);
  dbVersion = 7; userDeleted = true;
  assert.equal(await jwt({ token, user: undefined, account: null } as never), null);
  userDeleted = false; lookupFails = true;
  assert.equal(await jwt({ token, user: undefined, account: null } as never), null);
  lookupFails = false;

  const oauthToken = await jwt({ token: {}, user: { email: "person@example.com", name: "Person", image: null }, account: { type: "oauth", provider: "google" } } as never) as { sub: string; authVersion: number };
  assert.equal(oauthToken.sub, "u1");
  assert.equal(oauthToken.authVersion, 7);
  await jwt({ token: oauthToken, user: undefined, account: null } as never);
  assert.equal(oauthWrites, 1, "refresh cannot upsert or resurrect an OAuth user");
  const session = await loaded.authConfig.callbacks.session({ session: { user: {} }, token: oauthToken } as never) as { user: { id: string; authVersion: number } };
  assert.deepEqual(session.user, { id: "u1", authVersion: 7 });

  const redirect = loaded.authConfig.callbacks.redirect;
  const baseUrl = "https://app.example";
  assert.equal(await redirect({ url: "/dashboard/reviews?tab=all#top", baseUrl } as never), `${baseUrl}/dashboard/reviews?tab=all#top`);
  assert.equal(await redirect({ url: `${baseUrl}/dashboard/reviews?tab=all`, baseUrl } as never), `${baseUrl}/dashboard/reviews?tab=all`);
  for (const url of ["https://evil.example/path", "//evil.example/path", "/\\evil.example", "/%5c%5cevil.example", "/foo/..//evil.example"]) {
    assert.equal(await redirect({ url, baseUrl } as never), `${baseUrl}/dashboard`);
  }
});
