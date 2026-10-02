import assert from "node:assert/strict";
import test from "node:test";
import { loadTs, nextServerWithAfter, realBcryptWithCounter } from "./auth-test-harness.mts";

type AfterTask = () => Promise<void>;
type Route = (request: Request) => Promise<Response>;
const goodBody = { email: "Person@example.com", password: "password123", fullName: "Person", callbackUrl: "/dashboard/reviews?tab=all" };
function makeOverrides() {
  const tasks: AfterTask[] = [];
  const logs: string[] = [];
  const events: string[] = [];
  const rateKeys: string[] = [];
  let delivery = true;
  let allowed = true;
  let user: Record<string, unknown> | null = null;
  let createResult: { id: string } | null = { id: "new-user" };
  let sendFailure = false;
  let resetResult: { ok: boolean; callbackUrl: string | null } = { ok: true, callbackUrl: "/dashboard/reviews" };
  let resetThrows = false;
  let hashCalls = 0;
  let emailLookups = 0;
  let userCreates = 0;
  let verificationSends = 0;
  let resetSends = 0;
  let resetConsumes = 0;
  let resetAllowed = true;
  const overrides: Record<string, unknown> = {
    "next/server": nextServerWithAfter((task) => tasks.push(task)),
    "bcryptjs": realBcryptWithCounter(() => { hashCalls++; }),
    "@/lib/db/users": {
      findUserByEmail: async () => { events.push("lookup"); emailLookups++; return user; },
      createUserWithPassword: async () => { userCreates++; events.push("create-user"); return createResult; },
    },
    "@/lib/auth-verification": {
      authEmailDeliveryAvailable: () => delivery,
      createEmailVerification: async () => { events.push("verification-send"); verificationSends++; if (sendFailure) throw new Error("mail provider unavailable"); },
      createPasswordReset: async () => { events.push("password-reset-send"); resetSends++; if (sendFailure) throw new Error("mail provider unavailable"); },
      consumePasswordReset: async () => { resetConsumes++; if (resetThrows) throw new Error("database unavailable"); return resetResult; },
    },
    "@/lib/public-write-limiter": {
      checkPublicWriteRateLimit: async (key: string) => { rateKeys.push(key); return key.includes("reset-password") ? resetAllowed : allowed; },
    },
    "@/lib/safe-logger": { safeLogger: { error: (event: string) => logs.push(event) } },
  };
  return {
    overrides, tasks, logs, events, rateKeys,
    setDelivery: (value: boolean) => { delivery = value; }, setAllowed: (value: boolean) => { allowed = value; },
    setUser: (value: Record<string, unknown> | null) => { user = value; }, setCreateResult: (value: { id: string } | null) => { createResult = value; },
    setSendFailure: (value: boolean) => { sendFailure = value; }, setResetResult: (value: typeof resetResult) => { resetResult = value; },
    setResetThrows: (value: boolean) => { resetThrows = value; }, setResetAllowed: (value: boolean) => { resetAllowed = value; },
    get hashCalls() { return hashCalls; }, get emailLookups() { return emailLookups; }, get userCreates() { return userCreates; },
    get verificationSends() { return verificationSends; }, get resetSends() { return resetSends; }, get resetConsumes() { return resetConsumes; },
  };
}
function post(body: unknown) {
  return new Request("https://app.example/api/auth/test", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.8" }, body: JSON.stringify(body) });
}
async function json(response: Response) { return await response.json() as Record<string, unknown>; }

test("bounded auth input, real email parser, IP extraction, and hashed rate keys", async () => {
  const calls: string[] = [];
  const input = loadTs<typeof import("../src/lib/auth-recovery-input.js")>("src/lib/auth-recovery-input.ts", {
    overrides: { "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async (key: string) => { calls.push(key); return true; } } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await input.readBoundedJson(post({ email: "x@example.com" })))), { email: "x@example.com" });
  assert.equal(await input.readBoundedJson(new Request("https://app.example", { method: "POST", headers: { "content-length": "8193" }, body: "{}" })), null);
  const oversizedStream = new Request("https://app.example", { method: "POST", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); } }), duplex: "half" } as RequestInit);
  assert.equal(await input.readBoundedJson(oversizedStream), null);
  assert.equal(await input.readBoundedJson(post([])), null);
  assert.equal(input.normalizeAuthEmail(" Person@Example.com "), "person@example.com");
  assert.equal(input.normalizeAuthEmail("invalid"), null);
  assert.equal(input.authCallback("//evil.example"), "/dashboard");
  assert.equal(input.requestIp(post({})), "203.0.113.8");
  assert.equal(await input.allowAuthWrite("register", "person@example.com", "203.0.113.8"), true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((key) => !key.includes("person@example.com")));
});

test("actual bcrypt truncates after 72 bytes and shared policy rejects longer credentials", async () => {
  const policy = loadTs<typeof import("../src/lib/auth-password-policy.js")>("src/lib/auth-password-policy.ts");
  const bcrypt = await import("bcryptjs");
  const atLimit = "a".repeat(72);
  assert.equal(policy.isValidAuthPassword("short"), false);
  assert.equal(policy.isValidAuthPassword("é".repeat(36)), true);
  assert.equal(policy.isValidAuthPassword("é".repeat(37)), false);
  assert.equal(policy.isValidAuthPassword(`${atLimit}b`), false);
  const hash = await bcrypt.hash(atLimit, 4);
  assert.equal(await bcrypt.compare(`${atLimit}b`, hash), true);
});

test("register responds generically, hashes before account distinction, and defers mail", async () => {
  const h = makeOverrides();
  const route = loadTs<{ POST: Route }>("src/app/api/auth/register/route.ts", { overrides: h.overrides });
  const newResponse = await route.POST(post(goodBody));
  const newJson = await json(newResponse);
  assert.equal(newResponse.status, 200);
  assert.deepEqual(newJson, { ok: true, message: "If registration can be completed, a verification email will be sent." });
  assert.equal(newResponse.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(newResponse.headers.get("referrer-policy"), "no-referrer");
  assert.equal(h.hashCalls, 1);
  assert.deepEqual(h.events, ["lookup", "create-user"]);
  assert.equal(h.tasks.length, 1);
  assert.equal(h.verificationSends, 0);
  await h.tasks.shift()!();
  assert.equal(h.verificationSends, 1);
  h.setUser({ id: "existing", email: "person@example.com", password_hash: "already-hashed" });
  const existingResponse = await route.POST(post(goodBody));
  assert.deepEqual(await json(existingResponse), newJson);
  assert.equal(h.hashCalls, 2, "bcrypt cost is paid for existing addresses too");
  assert.equal(h.tasks.length, 0);
  assert.equal(h.userCreates, 1);
  h.setUser(null);
  h.setCreateResult(null);
  const conflictResponse = await route.POST(post(goodBody));
  assert.deepEqual(await json(conflictResponse), newJson);
  assert.equal(h.tasks.length, 0);
});

test("register enforces UTF-8 password bounds, rate limit, and configured delivery", async () => {
  const h = makeOverrides();
  const route = loadTs<{ POST: Route }>("src/app/api/auth/register/route.ts", { overrides: h.overrides });
  assert.equal((await route.POST(post({ ...goodBody, password: "short" }))).status, 400);
  assert.equal((await route.POST(post({ ...goodBody, password: "a".repeat(73) }))).status, 400);
  assert.equal(h.hashCalls, 0);
  h.setAllowed(false);
  assert.equal((await route.POST(post(goodBody))).status, 429);
  assert.equal(h.hashCalls, 0);
  h.setAllowed(true); h.setDelivery(false);
  assert.equal((await route.POST(post(goodBody))).status, 503);
  assert.equal(h.hashCalls, 0);
});

test("resend and recovery defer lookup, respond generically, and exclude OAuth-only reset", async () => {
  const h = makeOverrides();
  const resend = loadTs<{ POST: Route }>("src/app/api/auth/resend-verification/route.ts", { overrides: h.overrides });
  const forgot = loadTs<{ POST: Route }>("src/app/api/auth/forgot-password/route.ts", { overrides: h.overrides });
  const unknownVerify = await resend.POST(post({ email: goodBody.email, callbackUrl: goodBody.callbackUrl }));
  const unknownJson = await json(unknownVerify);
  assert.equal(h.emailLookups, 0);
  await h.tasks.shift()!();
  assert.equal(h.verificationSends, 0);
  h.setUser({ id: "verified", email_verified: "now", password_hash: "hash" });
  const existingVerify = await resend.POST(post({ email: goodBody.email, callbackUrl: goodBody.callbackUrl }));
  assert.deepEqual(await json(existingVerify), unknownJson);
  await h.tasks.shift()!();
  assert.equal(h.verificationSends, 0);
  h.setUser(null);
  const unknownReset = await forgot.POST(post({ email: goodBody.email, callbackUrl: goodBody.callbackUrl }));
  const resetJson = await json(unknownReset);
  await h.tasks.shift()!();
  h.setUser({ id: "oauth", email_verified: "now", password_hash: null });
  const oauthReset = await forgot.POST(post({ email: goodBody.email, callbackUrl: goodBody.callbackUrl }));
  assert.deepEqual(await json(oauthReset), resetJson);
  await h.tasks.shift()!();
  assert.equal(h.resetSends, 0);
  h.setUser({ id: "local", email_verified: "now", password_hash: "hash" });
  await forgot.POST(post({ email: goodBody.email, callbackUrl: goodBody.callbackUrl }));
  await h.tasks.shift()!();
  assert.equal(h.resetSends, 1);
});

test("email request paths fail closed for delivery/rate limits and hide provider errors", async () => {
  const h = makeOverrides();
  const resend = loadTs<{ POST: Route }>("src/app/api/auth/resend-verification/route.ts", { overrides: h.overrides });
  h.setDelivery(false);
  assert.equal((await resend.POST(post({ email: goodBody.email }))).status, 503);
  assert.equal(h.tasks.length, 0);
  h.setDelivery(true); h.setAllowed(false);
  assert.equal((await resend.POST(post({ email: goodBody.email }))).status, 429);
  assert.equal(h.tasks.length, 0);
  h.setAllowed(true); h.setUser({ id: "u1", email_verified: null, password_hash: "hash" }); h.setSendFailure(true);
  const response = await resend.POST(post({ email: goodBody.email }));
  const payload = await json(response);
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(payload).includes(goodBody.email), false);
  await h.tasks.shift()!();
  assert.ok(h.logs.includes("auth.verification.delivery_failed"));
});

test("reset validates and rate-limits tokens and returns only sanitized callback paths", async () => {
  const h = makeOverrides();
  const route = loadTs<{ POST: Route }>("src/app/api/auth/reset-password/route.ts", { overrides: h.overrides });
  const token = "A".repeat(43);
  assert.equal((await route.POST(post({ token, password: "short" }))).status, 400);
  h.setResetAllowed(false);
  assert.equal((await route.POST(post({ token, password: "password123" }))).status, 429);
  assert.ok(h.rateKeys.some((key) => key.includes("auth:reset-password:token:")));
  assert.ok(h.rateKeys.every((key) => !key.includes(token)));
  h.setResetAllowed(true);
  const response = await route.POST(post({ token, password: "password123" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true, message: "Password updated.", callbackUrl: "/dashboard/reviews" });
  assert.equal(h.resetConsumes, 1);
  h.setResetResult({ ok: false, callbackUrl: "/team/invite/abc" });
  const expired = await route.POST(post({ token, password: "password123" }));
  assert.equal(expired.status, 400);
  assert.deepEqual(await json(expired), {
    ok: false, error: "This recovery link is invalid or expired. Request a new one.", callbackUrl: "/team/invite/abc",
  });
  h.setResetResult({ ok: false, callbackUrl: "//evil.example/path" });
  const unsafe = await route.POST(post({ token, password: "password123" }));
  assert.equal((await json(unsafe)).callbackUrl, "/dashboard");
  h.setResetResult({ ok: false, callbackUrl: null });
  const unknown = await route.POST(post({ token, password: "password123" }));
  assert.equal(unknown.status, 400);
  assert.equal(Object.hasOwn(await json(unknown), "callbackUrl"), false);
  h.setResetThrows(true);
  assert.equal((await route.POST(post({ token, password: "password123" }))).status, 500);
  assert.ok(h.logs.includes("auth.reset_password.failed"));
});

test("mail helper requires production HTTPS config and handles Resend rejection", async () => {
  const statements: string[] = [];
  const requests: Array<{ url: string; authorization: string; body: { text: string } }> = [];
  const env: Record<string, string | undefined> = { RESEND_API_KEY: "test-key", EMAIL_FROM: "no-reply@example.com", NEXT_PUBLIC_APP_URL: "https://app.example" };
  let providerStatus = 503;
  const helper = loadTs<typeof import("../src/lib/auth-verification.js")>("src/lib/auth-verification.ts", {
    env: { NODE_ENV: "production" },
    overrides: {
      "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => { statements.push(strings.reduce((q, part, i) => q + part + (i < values.length ? `'${String(values[i]).replaceAll("'", "''")}'` : ""), "")); return []; } },
      "@/lib/env": { getOptionalEnv: (name: string) => env[name], getServerAppUrl: () => "https://app.example" },
    },
    fetch: async (input, init) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") ?? "", body: JSON.parse(String(init?.body)) as { text: string } });
      return new Response("provider response", { status: providerStatus });
    },
  });
  delete env.RESEND_API_KEY;
  assert.equal(helper.authEmailDeliveryAvailable(), false);
  env.RESEND_API_KEY = "test-key";
  assert.equal(helper.authEmailDeliveryAvailable(), true);
  env.NEXT_PUBLIC_APP_URL = "http://app.example";
  assert.equal(helper.authEmailDeliveryAvailable(), false);
  env.NEXT_PUBLIC_APP_URL = "https://app.example";
  await assert.rejects(helper.createEmailVerification("person@example.com", "user-id", "/team/invite/abc"));
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://api.resend.com/emails");
  assert.equal(requests[0]?.authorization, "Bearer test-key");
  assert.equal(statements.length, 1);
  const sentToken = requests[0]!.body.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  assert.match(requests[0]!.body.text, /callbackUrl=%2Fteam%2Finvite%2Fabc/);
  assert.ok(sentToken);
  assert.equal(statements[0]?.includes(sentToken), false);
  providerStatus = 200;
  await helper.createEmailVerification("person@example.com", "user-id", "/team/invite/abc");
  assert.equal(requests.length, 2);
});

test("verification redirects safely on success, expiry, cleanup, rate limit, and helper failure", async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  let helperResult: { ok: boolean; callbackUrl: string | null } = { ok: true, callbackUrl: "/team/invite/abc" };
  let helperThrows = false;
  let allowToken = true;
  const route = loadTs<{ GET(request: Request): Promise<Response> }>("src/app/api/auth/verify-email/route.ts", {
    overrides: {
      "@/lib/auth-verification": { verifyEmailToken: async () => { calls.push("verify"); if (helperThrows) throw new Error("db failure"); return helperResult; } },
      "@/lib/env": { getServerAppUrl: () => "https://app.example" },
      "@/lib/public-write-limiter": { checkPublicWriteRateLimit: async (key: string) => { calls.push(key); return allowToken || key.includes(":ip:"); } },
      "@/lib/safe-logger": { safeLogger: { error: (event: string) => logs.push(event) } },
    },
  });
  const request = (token: string, callbackUrl?: string) => {
    const url = new URL(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, "https://app.example");
    if (callbackUrl !== undefined) url.searchParams.set("callbackUrl", callbackUrl);
    return new Request(url, { headers: { "x-real-ip": "203.0.113.9" } });
  };
  const goodToken = "A".repeat(43);
  const success = await route.GET(request(goodToken, "/query/path"));
  const successUrl = new URL(success.headers.get("location")!);
  assert.equal(successUrl.searchParams.get("verified"), "1");
  assert.equal(successUrl.searchParams.get("callbackUrl"), "/team/invite/abc");
  assert.equal(success.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(success.headers.get("referrer-policy"), "no-referrer");
  helperResult = { ok: false, callbackUrl: "/team/invite/abc" };
  const expired = await route.GET(request(goodToken));
  assert.equal(new URL(expired.headers.get("location")!).searchParams.get("verified"), "0");
  assert.equal(new URL(expired.headers.get("location")!).searchParams.get("callbackUrl"), "/team/invite/abc");
  helperResult = { ok: false, callbackUrl: "//evil.example/path" };
  assert.equal(new URL((await route.GET(request(goodToken, "/query/path"))).headers.get("location")!).searchParams.get("callbackUrl"), "/dashboard");
  helperResult = { ok: false, callbackUrl: null };
  const cleaned = await route.GET(request(goodToken, "/team/invite/restore"));
  assert.equal(new URL(cleaned.headers.get("location")!).searchParams.get("verified"), "0");
  assert.equal(new URL(cleaned.headers.get("location")!).searchParams.get("callbackUrl"), "/team/invite/restore");
  const externalFallback = await route.GET(request(goodToken, "//evil.example/path"));
  assert.equal(new URL(externalFallback.headers.get("location")!).searchParams.get("callbackUrl"), "/dashboard");
  const beforeInvalid = calls.filter((value) => value === "verify").length;
  const invalid = await route.GET(request("short", "/team/invite/restore"));
  assert.equal(new URL(invalid.headers.get("location")!).searchParams.get("verified"), "0");
  assert.equal(new URL(invalid.headers.get("location")!).searchParams.get("callbackUrl"), "/team/invite/restore");
  assert.equal(calls.filter((value) => value === "verify").length, beforeInvalid);
  allowToken = false;
  const limited = await route.GET(request(goodToken, "/team/invite/restore"));
  assert.equal(new URL(limited.headers.get("location")!).searchParams.get("verified"), "0");
  assert.equal(new URL(limited.headers.get("location")!).searchParams.get("callbackUrl"), "/team/invite/restore");
  assert.equal(calls.filter((value) => value === "verify").length, beforeInvalid);
  allowToken = true; helperThrows = true;
  const failed = await route.GET(request(goodToken, "/team/invite/restore"));
  assert.equal(new URL(failed.headers.get("location")!).searchParams.get("callbackUrl"), "/team/invite/restore");
  assert.ok(logs.includes("auth.verify_email.failed"));
});

test("expired reset helper preserves its stored callback while the atomic consume rejects it", async () => {
  const statements: string[] = [];
  const helper = loadTs<typeof import("../src/lib/auth-verification.js")>("src/lib/auth-verification.ts", {
    overrides: {
      "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.reduce((text, part, i) => text + part + (i < values.length ? String(values[i]) : ""), "");
        statements.push(query);
        return query.trimStart().startsWith("SELECT") ? [{ callback_url: "/team/invite/abc" }] : [];
      } },
      "@/lib/env": { getOptionalEnv: () => undefined, getServerAppUrl: () => "https://app.example" },
    },
  });
  const result = await helper.consumePasswordReset("A".repeat(43), "replacement-hash");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, callbackUrl: "/team/invite/abc" });
  assert.equal(statements.length, 2);
  assert.match(statements[0]!, /^\s*SELECT/i);
  assert.match(statements[0]!, /password_reset_tokens/i);
  assert.match(statements[1]!, /^\s*WITH/i);
  assert.match(statements[1]!, /DELETE\s+FROM\s+public\.password_reset_tokens/i);
  assert.match(statements[1]!, /expires_at\s*>\s*now\(\)/i);
});
