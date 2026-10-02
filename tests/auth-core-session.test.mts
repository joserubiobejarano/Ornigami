import assert from "node:assert/strict";
import { Auth, type AuthConfig } from "@auth/core";
import { encode } from "@auth/core/jwt";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

test("Auth.js Core rejects stale or missing users and clears their JWT session cookie", async () => {
  let current: { id: string; auth_version: number } | null = { id: "u1", auth_version: 4 };
  const loaded = loadTs<{ authConfig: { callbacks: AuthConfig["callbacks"] } }>("src/auth.ts", {
    overrides: {
      "next-auth": { __esModule: true, default: () => ({ handlers: {}, auth: () => undefined, signIn: () => undefined, signOut: () => undefined }) },
      "next-auth/providers/google": { __esModule: true, default: () => ({ id: "google", type: "oauth" }) },
      "next-auth/providers/credentials": { __esModule: true, default: () => ({ id: "credentials", type: "credentials" }) },
      "@/lib/db/users": { findUserByEmail: async () => null, findUserById: async () => current, ensureUserFromOAuth: async () => ({ id: "u1", auth_version: 4 }) },
      "@/lib/auth-rate-limit": { clearCredentialsLoginFailures: async () => undefined, isCredentialsLoginRateLimited: async () => false, recordCredentialsLoginFailure: async () => undefined },
      "@/lib/env": { getRequiredEnv: (name: string) => name },
    },
  });
  const secret = "test-secret-long-enough-for-authjs-session-cookie";
  const config = {
    basePath: "/api/auth", providers: [], secret, trustHost: true,
    session: { strategy: "jwt" as const, maxAge: 3600 },
    callbacks: loaded.authConfig.callbacks,
  } satisfies AuthConfig;
  const staleJwe = await encode({ token: { sub: "u1", authVersion: 3, email: "person@example.com" }, secret, salt: "authjs.session-token", maxAge: 3600 });
  const missingJwe = await encode({ token: { sub: "deleted-user", authVersion: 3 }, secret, salt: "authjs.session-token", maxAge: 3600 });
  for (const [jwe, row] of [[staleJwe, { id: "u1", auth_version: 4 }], [missingJwe, null]] as const) {
    current = row;
    const response = await Auth(new Request("http://localhost:3000/api/auth/session", {
      headers: { cookie: `authjs.session-token=${jwe}` },
    }), config);
    assert.equal(response.status, 200);
    assert.equal(await response.json(), null);
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /authjs\.session-token=/);
    assert.match(cookie, /Max-Age=0/i);
  }
});
