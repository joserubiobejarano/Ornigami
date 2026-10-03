import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const validation = loadTs<{
  isSafeGoogleReviewUrl(value: unknown): value is string;
  isSafeBookingUrl(value: unknown): value is string;
  isSafeSenderName(value: unknown): value is string;
  extractSafeGoogleReviewUrl(raw: unknown, placeId?: string | null): string | null;
}>("src/modules/review-booster/services/settings-link-validation.ts", {});

test("review destinations accept only direct supported Google review forms", () => {
  for (const url of [
    "https://search.google.com/local/writereview?placeid=ChIJfixture",
    "https://g.page/acme-review/review",
    "https://g.page/r/CXfixture/review",
  ]) assert.equal(validation.isSafeGoogleReviewUrl(url), true, url);
  for (const url of [
    "http://search.google.com/local/writereview?placeid=x",
    "https://search.google.com.evil.example/local/writereview?placeid=x",
    "https://google.com/maps?cid=123",
    "https://www.google.com/maps/search/?api=1&query=review",
    "https://search.google.com/local/writereview?placeid=x&continue=https://evil.example",
    "https://g.page/acme-review/other",
    "https://g.page/r/CXfixture/review?continue=https://evil.example",
    "https://g.page/acme-review/review#other",
    "https://search.google.com:444/local/writereview?placeid=x",
    "https://user:pass@search.google.com/local/writereview?placeid=x",
    "https://search.google.com/local/writereview?placeid=x\nX-Test: yes",
  ]) assert.equal(validation.isSafeGoogleReviewUrl(url), false, url);
});

test("booking URLs require public HTTPS and reject private, credential, control, and IP destinations", () => {
  assert.equal(validation.isSafeBookingUrl("https://booking.example/schedule?service=hair"), true);
  for (const url of [
    "http://booking.example/schedule",
    "https://user:pass@booking.example/schedule",
    "https://localhost/schedule",
    "https://service.local/schedule",
    "https://printer.internal/schedule",
    "https://127.0.0.1/schedule",
    "https://10.0.0.5/schedule",
    "https://192.168.1.10/schedule",
    "https://[::1]/schedule",
    "https://[::ffff:127.0.0.1]/schedule",
    "https://booking.example/schedule\u0000",
    `https://booking.example/${"x".repeat(501)}`,
  ]) assert.equal(validation.isSafeBookingUrl(url), false, url);
});

test("Google provider metadata receives the same strict destination policy and invalid metadata is ignored", () => {
  assert.equal(validation.extractSafeGoogleReviewUrl({ metadata: { newReviewUri: "https://evil.example/" } }, null), null);
  assert.equal(validation.extractSafeGoogleReviewUrl({ metadata: { newReviewUri: "https://www.google.com/maps?continue=https://evil.example" } }, null), null);
  assert.equal(validation.extractSafeGoogleReviewUrl({ metadata: { newReviewUri: "https://g.page/r/CXfixture/review" } }, null), "https://g.page/r/CXfixture/review");
  assert.equal(validation.extractSafeGoogleReviewUrl({ metadata: { newReviewUri: "javascript:alert(1)" } }, "ChIJfixture"), "https://search.google.com/local/writereview?placeid=ChIJfixture");
});

const initialSettings = {
  id: "business-1", name: "Studio", business_type: "Salon", city: null,
  google_review_url: "https://search.google.com/local/writereview?placeid=old-place",
  rebooking_url: "https://book.example/studio", tone: "warm", language: "en", email_from_name: "Studio Team",
};
let actorRole: "owner" | "member" = "owner";
let sqlCalls: Array<{ query: string; values: unknown[] }> = [];
let googleOwnerSeen = "";
const settingsRoute = loadTs<{
  GET(request: Request): Promise<{ status: number; json(): Promise<Record<string, unknown>> }>;
  POST(request: Request): Promise<{ status: number; json(): Promise<Record<string, unknown>> }>;
}>("src/app/api/review-booster/settings/route.ts", {
  "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) } },
  "@/auth": { auth: async () => ({ user: { id: actorRole === "owner" ? "owner-1" : "member-1", email: "owner@example.com" } }) },
  "@/lib/api-security": {
    requireActiveAgentBusinessContext: async (_actor: string, _email: string, _agent: string, businessId?: string) => {
      if (businessId && businessId !== "business-1") throw Object.assign(new Error("Business access denied."), { status: 403 });
      return {
        actorUserId: actorRole === "owner" ? "owner-1" : "member-1", businessId: "business-1",
        ownerUserId: "owner-1", integrationOwnerUserId: "owner-1", role: actorRole,
        business: { id: "business-1", owner_user_id: "owner-1" },
      };
    },
    safeApiErrorResponse: (error: unknown) => ({ status: Number((error as { status?: number })?.status ?? 500), json: async () => ({ error: String((error as Error)?.message ?? "error") }) }),
  },
  "@/lib/business-context": { assertBusinessOwner: (context: { role: string }) => { if (context.role !== "owner") throw Object.assign(new Error("Business owner access required."), { status: 403 }); } },
  "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
  "@/lib/db/neon": { sql: (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), "");
    sqlCalls.push({ query, values });
    return Promise.resolve(query.includes("UPDATE public.businesses") ? [{ id: "business-1" }] : []);
  } },
  "@/lib/google-business": {
    getSelectedGoogleLocation: async () => { throw Object.assign(new Error("none"), { status: 409 }); },
    listBusinessGoogleLocations: async (context: { integrationOwnerUserId: string }) => { googleOwnerSeen = context.integrationOwnerUserId; return []; },
  },
  "@/modules/review-booster/services/review-booster-db.service": {
    getBusinessFollowupSettings: async () => ({ ...initialSettings }),
  },
  "@/modules/review-booster/services/settings-link-validation": validation,
});

function post(body: unknown) {
  return settingsRoute.POST(new Request("https://app.example/api/review-booster/settings", {
    method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

test("settings GET shares owner values with members and reports read-only role", async () => {
  actorRole = "member";
  const response = await settingsRoute.GET(new Request("https://app.example/api/review-booster/settings"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.business_role, "member");
  assert.equal(body.can_manage_settings, false);
  assert.equal(body.rebooking_url, initialSettings.rebooking_url);
  assert.equal(googleOwnerSeen, "owner-1");
  actorRole = "owner";
});

const pgBin = process.env.A07_PG_BIN ?? process.env.A04_PG_BIN ?? process.env.A08_PG_BIN ?? process.env.A06_PG_BIN ?? process.env.PG_BIN ?? (process.platform === "win32" ? "C:/Program Files/PostgreSQL/17/bin" : "");
const pgExe = (name: string) => pgBin ? join(pgBin, process.platform === "win32" ? `${name}.exe` : name) : name;
const pgPort = 55457;
const pgAvailable = ["initdb", "pg_ctl", "psql"].every((name) => {
  if (pgBin && existsSync(pgExe(name))) return true;
  try {
    execFileSync(pgExe(name), ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const pgRoot = resolve(process.cwd(), ".next");
const pgIds = { owner: "a0710000-0000-4000-8000-000000000001", member: "a0710000-0000-4000-8000-000000000002", business: "a0710000-0000-4000-8000-000000000003" };

function psql(statement: string): string {
  return execFileSync(pgExe("psql"), ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "-d", "postgres", "-c", statement], { encoding: "utf8" }).trim();
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

test("settings POST preserves concurrent legacy values, clears explicitly, retains invalid legacy links, and fences members (PostgreSQL)", { skip: !pgAvailable, timeout: 120_000 }, async () => {
  mkdirSync(pgRoot, { recursive: true });
  const dir = mkdtempSync(join(pgRoot, "a07-settings-pg-"));
  assert.ok(resolve(dir).startsWith(`${pgRoot}${sep}`));
  const dataDir = join(dir, "data");
  let started = false;
  try {
    execFileSync(pgExe("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { stdio: "ignore" });
    appendFileSync(join(dataDir, "postgresql.conf"), "\nunix_socket_directories = ''\n");
    execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-l", join(dir, "postgres.log"), "-o", `-h 127.0.0.1 -p ${pgPort} -F`, "-w", "start"], { stdio: "ignore" });
    started = true;
    psql(`CREATE TABLE public.businesses (
      id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, name text NOT NULL, business_type text,
      google_review_url text, tone text, language text, rebooking_url text, email_from_name text, updated_at timestamptz DEFAULT now()
    );
    INSERT INTO public.businesses(id,owner_user_id,name,business_type,google_review_url,tone,language,rebooking_url,email_from_name)
    VALUES ('${pgIds.business}','${pgIds.owner}','Studio','Salon','https://google.com/maps?continue=https://evil.example','warm','en','https://old-book.example','Old sender');`);
    let applyConcurrentSettings = false;
    const querySql = (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.reduce((out, part, index) => out + part + (index < values.length ? `$${index + 1}` : ""), "");
      const statement = query.replace(/\$(\d+)/g, (_match, n: string) => sqlLiteral(values[Number(n) - 1]));
      if (applyConcurrentSettings && query.includes("UPDATE public.businesses")) {
        psql(`UPDATE public.businesses SET rebooking_url='https://new-book.example', email_from_name='New sender', tone='casual' WHERE id='${pgIds.business}'`);
        applyConcurrentSettings = false;
      }
      const output = psql(statement);
      return Promise.resolve(output ? output.split(/\r?\n/).map((id) => ({ id })) : []);
    };
    const pgRoute = loadTs<{ POST(request: Request): Promise<{ status: number; json(): Promise<Record<string, unknown>> }> }>(
      "src/app/api/review-booster/settings/route.ts",
      {
        "next/server": { NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }) } },
        "@/auth": { auth: async () => ({ user: { id: actorRole === "owner" ? pgIds.owner : pgIds.member, email: "person@example.com" } }) },
        "@/lib/api-security": {
          requireActiveAgentBusinessContext: async (actor: string, _email: string, _agent: string, businessId?: string) => {
            if (businessId && businessId !== pgIds.business) throw Object.assign(new Error("Business access denied."), { status: 403 });
            return { actorUserId: actor, businessId: pgIds.business, ownerUserId: pgIds.owner, integrationOwnerUserId: pgIds.owner, role: actor === pgIds.owner ? "owner" : "member", business: { id: pgIds.business, owner_user_id: pgIds.owner } };
          },
          safeApiErrorResponse: (error: unknown) => ({ status: Number((error as { status?: number })?.status ?? 500), json: async () => ({ error: String((error as Error)?.message ?? "error") }) }),
        },
        "@/lib/business-context": { assertBusinessOwner: (context: { role: string }) => { if (context.role !== "owner") throw Object.assign(new Error("Business owner access required."), { status: 403 }); } },
        "@/lib/team-lifecycle": { isSameOriginMutation: () => true },
        "@/lib/db/neon": { sql: querySql },
        "@/lib/google-business": { getSelectedGoogleLocation: async () => { throw Object.assign(new Error("none"), { status: 409 }); }, listBusinessGoogleLocations: async () => [] },
        "@/modules/review-booster/services/review-booster-db.service": {
          getBusinessFollowupSettings: async () => {
            const row = JSON.parse(psql(`SELECT row_to_json(b) FROM public.businesses b WHERE id='${pgIds.business}'`)) as Record<string, unknown>;
            return { id: row.id, name: row.name, business_type: row.business_type, city: null, google_review_url: row.google_review_url, tone: row.tone, language: row.language, rebooking_url: row.rebooking_url, email_from_name: row.email_from_name };
          },
        },
        "@/modules/review-booster/services/settings-link-validation": validation,
      },
    );
    const call = (body: unknown) => pgRoute.POST(new Request("https://app.example/api/review-booster/settings", {
      method: "POST", headers: { origin: "https://app.example", "content-type": "application/json" }, body: JSON.stringify(body),
    }));

    // Model a stale route read: newer values are committed after the settings read but before this partial POST.
    applyConcurrentSettings = true;
    actorRole = "owner";
    const preserved = await call({ business_name: "Studio", google_review_url: "https://search.google.com/local/writereview?placeid=fixture" });
    assert.equal(preserved.status, 200);
    let row = JSON.parse(psql(`SELECT row_to_json(b) FROM public.businesses b WHERE id='${pgIds.business}'`)) as Record<string, unknown>;
    assert.equal(row.rebooking_url, "https://new-book.example");
    assert.equal(row.email_from_name, "New sender");
    assert.equal(row.tone, "casual");
    assert.equal(row.google_review_url, "https://search.google.com/local/writereview?placeid=fixture");

    const clear = await call({ business_name: "Studio", rebooking_url: null });
    assert.equal(clear.status, 200);
    row = JSON.parse(psql(`SELECT row_to_json(b) FROM public.businesses b WHERE id='${pgIds.business}'`)) as Record<string, unknown>;
    assert.equal(row.rebooking_url, null);
    assert.equal(row.email_from_name, "New sender");

    // Unsafe legacy review values survive unrelated changes, but are not reported as effective destinations.
    psql(`UPDATE public.businesses SET google_review_url='https://google.com/maps?continue=https://evil.example' WHERE id='${pgIds.business}'`);
    const correctedElsewhere = await call({ business_name: "Studio", tone: "professional" });
    assert.equal(correctedElsewhere.status, 200);
    const body = await correctedElsewhere.json();
    row = JSON.parse(psql(`SELECT row_to_json(b) FROM public.businesses b WHERE id='${pgIds.business}'`)) as Record<string, unknown>;
    assert.equal(row.google_review_url, "https://google.com/maps?continue=https://evil.example");
    assert.equal(body.effective_google_review_url, null);
    assert.equal(body.google_review_url_valid, false);

    actorRole = "member";
    const memberWrite = await call({ business_name: "Hijack", rebooking_url: "https://attacker.example" });
    assert.equal(memberWrite.status, 403);
    row = JSON.parse(psql(`SELECT row_to_json(b) FROM public.businesses b WHERE id='${pgIds.business}'`)) as Record<string, unknown>;
    assert.equal(row.name, "Studio");
    assert.equal(row.rebooking_url, null);
    actorRole = "owner";
  } finally {
    actorRole = "owner";
    if (started) execFileSync(pgExe("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], { stdio: "ignore" });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("members cannot mutate Booster settings and malformed or unsafe settings fail before writes", async () => {
  actorRole = "member";
  sqlCalls = [];
  assert.equal((await post({ business_name: "Studio", google_review_url: initialSettings.google_review_url })).status, 403);
  assert.equal(sqlCalls.length, 0);
  actorRole = "owner";
  for (const field of [
    { rebooking_url: 123 }, { rebooking_url: "http://booking.example/" },
    { rebooking_url: "https://127.0.0.1/" }, { rebooking_url: "https://user:pw@booking.example" },
    { email_from_name: { label: "Studio" } }, { email_from_name: "Studio\r\nBcc: attacker@example.com" },
    { email_from_name: "<attacker@example.com>" }, { google_review_url: "https://google.com/maps?continue=https://evil.example" },
  ]) {
    sqlCalls = [];
    const response = await post({ business_name: "Studio", google_review_url: initialSettings.google_review_url, ...field });
    assert.equal(response.status, 400, JSON.stringify(field));
    assert.equal(sqlCalls.length, 0);
  }
});

test("settings reject cross-business selection attempts without updating a fallback business", async () => {
  sqlCalls = [];
  const response = await post({ business_name: "Studio", businessId: "other-business", google_review_url: initialSettings.google_review_url });
  assert.equal(response.status, 403);
  assert.equal(sqlCalls.length, 0);
});

test("the optional booking CTA is localized, escaped, and omitted for an invalid legacy destination", async () => {
  const provider = loadTs<{ prepareResendPayload(input: Record<string, unknown>): Promise<Record<string, unknown>> }>(
    "src/modules/review-booster/services/resend.provider.ts",
    {
      "@/lib/env": { getRequiredEnv: () => "mail@example.com", getOptionalEnv: () => null },
      "@/modules/review-booster/services/unsubscribe-token.service": { buildUnsubscribeUrl: async () => "https://app.example/unsubscribe" },
      "@/modules/review-booster/services/settings-link-validation": validation,
    },
  );
  const labels = { en: "Book again", es: "Reserva de nuevo", fr: "Réserver à nouveau", de: "Erneut buchen", it: "Prenota di nuovo", pt: "Agende novamente" };
  for (const [language, label] of Object.entries(labels)) {
    const payload = await provider.prepareResendPayload({
      business_id: "business-1", business_name: 'Studio "West"', email_from_name: "Studio\r\nBcc: attacker@example.com",
      customer_email: "customer@example.com", subject: "Thanks", body: "See you soon", language,
      google_review_url: "https://search.google.com/local/writereview?placeid=place-1",
      review_link_url: "https://tracked.example/r/signed-token", rebooking_url: "https://booking.example/book?a=1&b=2",
    });
    assert.match(String(payload.text), new RegExp(`${label}: https://booking\\.example/book\\?a=1&b=2`));
    assert.match(String(payload.html), /href="https:\/\/booking\.example\/book\?a=1&amp;b=2"/);
    assert.match(String(payload.html), new RegExp(label));
    assert.equal((payload as { from: string }).from, '"Studio \\"West\\"" <mail@example.com>');
    assert.doesNotMatch(String(payload.from), /Bcc:/);
  }
  const invalidLegacy = await provider.prepareResendPayload({
    business_name: "Studio", customer_email: "customer@example.com", subject: "Thanks", body: "Hello",
    google_review_url: "https://search.google.com/local/writereview?placeid=place-1",
    review_link_url: "https://tracked.example/r/signed-token", rebooking_url: "https://127.0.0.1/book",
  });
  assert.doesNotMatch(String(invalidLegacy.text), /Book again/);
  assert.doesNotMatch(String(invalidLegacy.html), /127\.0\.0\.1/);
});

test("new unsafe review links fail while frozen retry payloads replay unchanged", async () => {
  const runner = loadTs<{ runEligibleFollowups(deps: Record<string, unknown>): Promise<Record<string, number>> }>(
    "src/modules/review-booster/services/followup-runner.service.ts",
    { "@/lib/followup-run-policy": { MAX_FOLLOWUPS_PER_RUN: 50 }, "@/modules/review-booster/services/settings-link-validation": validation },
  );
  const candidate = {
    visitId: "visit-1", businessId: "business-1", customerName: null, customerEmail: "customer@example.com",
    visitedAt: "2026-10-01T00:00:00Z", serviceName: null, businessName: "Studio", businessType: null, city: null,
    googleReviewUrl: "https://www.google.com/maps?continue=https://evil.example", rebookingUrl: null,
    tone: null, language: "en", emailFromName: null,
  };
  const baseDeps = (kind: string, frozenPayload: Record<string, unknown> | null) => {
    const log = { generated: 0, prepared: 0, sent: [] as Array<{ payload: unknown; key: string }>, released: 0 };
    const deps = {
      listCandidates: async () => [candidate], claim: async () => ({ kind, deliveryId: "delivery-1", fence: "fence-1", payload: frozenPayload, idempotencyKey: "stable-key", firstAttemptAt: kind === "recovery" ? "2026-10-02T00:00:00Z" : null }),
      buildSubject: () => "Subject", generateBody: async () => { log.generated += 1; return "New body"; },
      preparePayload: async () => { log.prepared += 1; return { from: "old", to: "customer@example.com", reply_to: "mail@example.com", subject: "new", text: "new", html: "new" }; },
      persistPayload: async () => true,
      beginSend: async () => ({ kind: "send", payload: frozenPayload ?? { from: "new", to: "customer@example.com", reply_to: "mail@example.com", subject: "new", text: "new", html: "new" }, idempotencyKey: "stable-key" }),
      sendPrepared: async (payload: unknown, key: string) => { log.sent.push({ payload: structuredClone(payload), key }); return "accepted"; },
      classifySendError: () => "ambiguous", finalizeAccepted: async () => true,
      release: async () => { log.released += 1; return true; }, markUnknown: async () => true,
    };
    return { deps, log };
  };
  const fresh = baseDeps("claimed", null);
  const rejected = await runner.runEligibleFollowups(fresh.deps);
  assert.equal(rejected.failed, 1);
  assert.equal(fresh.log.generated, 0);
  assert.equal(fresh.log.sent.length, 0);

  const frozen = Object.freeze({ from: "frozen", to: "customer@example.com", reply_to: "mail@example.com", subject: "Old", text: "Old exact payload", html: "<p>Old exact payload</p>" });
  const recovery = baseDeps("recovery", frozen);
  const replay = await runner.runEligibleFollowups(recovery.deps);
  assert.equal(replay.sent, 1);
  assert.equal(recovery.log.generated, 0);
  assert.equal(recovery.log.prepared, 0);
  assert.deepEqual(recovery.log.sent[0], { payload: frozen, key: "stable-key" });
});
