import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

test("frozen credentials and OAuth reauthentication yield a PII-free recovery session", async () => {
  let frozen = false;
  let deleted = false;
  let lookupFails = false;
  const loaded = loadTs<{ authConfig: { providers: unknown[]; callbacks: {
    jwt(input: never): Promise<Record<string, unknown> | null>;
    session(input: never): Promise<Record<string, unknown>>;
  } } }>("src/auth.ts", { overrides: {
    "next-auth": { __esModule: true, default: () => ({ handlers: {}, auth: () => undefined, signIn: () => undefined, signOut: () => undefined }) },
    "next-auth/providers/google": { __esModule: true, default: () => ({ id: "google", type: "oauth" }) },
    "next-auth/providers/credentials": { __esModule: true, default: (config: unknown) => config },
    "bcryptjs": { compare: async () => true },
    "@/lib/db/users": {
      findUserByEmail: async () => ({ id: "user-1", auth_version: 2, email: "person@example.test", name: "Private Name", password_hash: "hash", image: "private-image", email_verified: "now", privacy_deletion_requested_at: frozen ? "now" : null }),
      findUserById: async (id: string) => {
        if (lookupFails) throw new Error("offline");
        if (deleted && id === "user-1") return null;
        if (id !== "user-1") return null;
        return { id, auth_version: 2, privacy_deletion_requested_at: frozen ? "now" : null };
      },
      ensureUserFromOAuth: async () => ({ id: "user-1", auth_version: 2, privacy_deletion_requested_at: frozen ? "now" : null }),
    },
    "@/lib/auth-rate-limit": { clearCredentialsLoginFailures: async () => {}, isCredentialsLoginRateLimited: async () => false, recordCredentialsLoginFailure: async () => {} },
    "@/lib/trusted-request-ip": { getTrustedRequestIp: () => "203.0.113.7" },
    "@/lib/env": { getRequiredEnv: (name: string) => name },
  } });

  const jwt = loaded.authConfig.callbacks.jwt;
  const session = loaded.authConfig.callbacks.session;
  frozen = true;
  const credentialProvider = loaded.authConfig.providers[1] as { authorize(input: unknown, request: { headers: Headers }): Promise<Record<string, unknown> | null> };
  const credentialUser = await credentialProvider.authorize({ email: "person@example.test", password: "Strong-password-123!" }, { headers: new Headers() });
  assert.equal(credentialUser?.privacyDeletionPending, true, "correct frozen credentials may authenticate only into the restricted session");
  const credentials = await jwt({
    token: {},
    user: { ...credentialUser, authVersion: 2 },
    account: null,
  } as never);
  assert.equal(credentials?.privacyDeletionPending, true);
  const restricted = await session({
    session: { user: { id: "user-1", email: "person@example.test", name: "Private Name", image: "private-image", authVersion: 2 } },
    token: credentials,
  } as never);
  assert.deepEqual(restricted, { user: {}, deletionUserId: "user-1", accountLifecycle: "deleting" });

  const oauth = await jwt({ token: {}, user: { email: "person@example.test", name: "Changed Name" }, account: { type: "oauth", provider: "google" } } as never);
  assert.deepEqual(oauth, { sub: "user-1", authVersion: 2, privacyDeletionPending: true });
  assert.equal(await jwt({ token: credentials, user: undefined, account: null } as never).then((v) => v?.privacyDeletionPending), true);

  deleted = true;
  assert.equal(await jwt({ token: credentials, user: undefined, account: null } as never), null,
    "the final user deletion invalidates the old JWT; completion after a lost final response needs a separate reviewed receipt contract");
  lookupFails = true;
  assert.equal(await jwt({ token: credentials, user: undefined, account: null } as never), null, "database errors fail closed");
});
