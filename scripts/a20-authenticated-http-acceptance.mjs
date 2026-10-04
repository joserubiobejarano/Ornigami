import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, ".a20-fixture");
const credentialsPath = path.join(fixtureRoot, "credentials.json");
const markerPath = path.join(fixtureRoot, "marker.json");
const runtimePath = path.join(fixtureRoot, "runtime.json");
const resolvedFixtureRoot = realpathSync(fixtureRoot);
if (resolvedFixtureRoot !== fixtureRoot) throw new Error("A20 fixture path did not resolve to the task-owned worktree directory");
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
const runtime = JSON.parse(readFileSync(runtimePath, "utf8"));
const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
if (marker.task !== "A20" || marker.version !== 1 || marker.state !== "ready" || marker.database !== "a20_browser_fixture" || marker.host !== "127.0.0.1" ||
    !Number.isInteger(marker.port) || marker.port < 1024 ||
    marker.fixtureRoot !== resolvedFixtureRoot || marker.clusterPath !== path.join(resolvedFixtureRoot, "postgres", "data") ||
    runtime.task !== "A20" || !Number.isInteger(runtime.pid) || !Number.isInteger(runtime.port) || runtime.port < 1024 ||
    !runtime.buildId || !runtime.buildHash || !runtime.buildTree || runtime.url !== `http://127.0.0.1:${runtime.port}` ||
    credentials.task !== "A20" || credentials.url !== runtime.url || !credentials.credentials || !credentials.actors || !credentials.business?.id) {
  throw new Error("A20 private credentials metadata is missing or invalid");
}
const base = new URL(credentials.url);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || Number(base.port) !== runtime.port) {
  throw new Error("refusing non-fixture or non-loopback A20 app URL");
}

async function boundedFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
}

function cookieStore() {
  const values = new Map();
  function absorb(response) {
    const headers = response.headers;
    const setCookies = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
    for (const line of setCookies) {
      const pair = line.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (/;\s*max-age=0/i.test(line) || value === "") values.delete(name);
      else values.set(name, value);
    }
  }
  return {
    absorb,
    header: () => [...values].map(([name, value]) => `${name}=${value}`).join("; "),
  };
}

async function authenticate(role) {
  const account = credentials.credentials[role];
  const actor = credentials.actors[role];
  if (!account?.email || !account?.password || !actor?.id) throw new Error(`missing private ${role} account metadata`);
  const jar = cookieStore();
  const csrfResponse = await boundedFetch(new URL("/api/auth/csrf", base), { redirect: "manual" });
  jar.absorb(csrfResponse);
  if (!csrfResponse.ok) throw new Error(`Auth.js CSRF endpoint returned ${csrfResponse.status}`);
  const csrfBody = await csrfResponse.json();
  if (typeof csrfBody.csrfToken !== "string" || !csrfBody.csrfToken) throw new Error("Auth.js did not return a CSRF token");

  const form = new URLSearchParams({
    csrfToken: csrfBody.csrfToken,
    email: account.email,
    password: account.password,
    callbackUrl: new URL("/dashboard", base).href,
    json: "true",
  });
  const signInResponse = await boundedFetch(new URL("/api/auth/callback/credentials", base), {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
      origin: base.origin,
      referer: new URL("/login", base).href,
      "x-auth-return-redirect": "true",
    },
    body: form,
  });
  jar.absorb(signInResponse);
  if (!signInResponse.ok) throw new Error(`Auth.js credentials callback returned ${signInResponse.status}`);
  const signInText = await signInResponse.text();
  let signInBody = null;
  try { signInBody = JSON.parse(signInText); } catch { /* Auth.js can return a plain redirect URL. */ }
  const redirectValue = typeof signInBody === "string" ? signInBody
    : typeof signInBody?.url === "string" ? signInBody.url
    : signInResponse.headers.get("location");
  const redirect = typeof redirectValue === "string" ? new URL(redirectValue, base) : null;
  const localRedirect = redirect && redirect.protocol === "http:" &&
    [base.hostname, "localhost"].includes(redirect.hostname) && redirect.port === base.port;
  if (!localRedirect) throw new Error("Auth.js credentials callback did not return a loopback redirect on the fixture port");

  const sessionResponse = await boundedFetch(new URL("/api/auth/session", base), {
    headers: { cookie: jar.header() },
    redirect: "manual",
  });
  jar.absorb(sessionResponse);
  if (!sessionResponse.ok) throw new Error(`Auth.js session endpoint returned ${sessionResponse.status}`);
  const session = await sessionResponse.json();
  if (session?.user?.id !== actor.id) throw new Error("persisted Auth.js session subject did not match the fixture actor");
  return { jar, role };
}

async function request(session, method, route, body) {
  const url = new URL(route, base);
  const headers = { cookie: session.jar.header(), accept: "application/json" };
  const init = { method, redirect: "manual", headers };
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.origin = base.origin;
    headers.referer = new URL("/dashboard", base).href;
    headers["sec-fetch-site"] = "same-origin";
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return boundedFetch(url, init);
}

function fixtureSnapshot() {
  const child = spawnSync(process.execPath, [path.join(root, "scripts", "a20-app-fixture.mjs"), "snapshot"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  if (child.error || child.status !== 0) throw new Error("could not read the isolated A20 fixture snapshot");
  let snapshot;
  try { snapshot = JSON.parse(String(child.stdout).trim()); }
  catch { throw new Error("isolated A20 fixture snapshot was invalid"); }
  if (snapshot?.actors !== 3 || snapshot?.canonicalMembers < 1 || snapshot?.ownerVisits < 0 || !snapshot?.draft?.state) {
    throw new Error("isolated A20 fixture snapshot did not match the expected seeded records");
  }
  return snapshot;
}

function equalSnapshot(left, right) {
  const encode = (value) => JSON.stringify(value);
  return createHash("sha256").update(encode(left)).digest("hex") === createHash("sha256").update(encode(right)).digest("hex");
}

function errorClass(value) {
  const safe = String(value ?? "");
  if (safe === "Business access denied." || safe === "Business access denied") return "business-access-denied";
  if (safe === "Business or Google location access denied.") return "google-scope-denied";
  if (safe === "Cross-origin request rejected.") return "cross-origin-guard";
  if (safe === "Member not found." || safe === "This invitation or member could not be found.") return "member-not-found";
  if (safe === "Agent access is inactive for this business.") return "agent-access-denied";
  if (safe === "Only the workspace owner can manage teammates." || safe === "Only the workspace owner can remove teammates.") return "owner-only";
  if (safe === "Only the workspace owner can invite teammates.") return "owner-only";
  if (safe === "Business owner access required." || /^(?:Only the business owner|Business owner only|Owner access required)/i.test(safe)) return "owner-only";
  if (/^(?:Business|Workspace) access denied\.?$/i.test(safe)) return "workspace-access-denied";
  if (/^Agent access denied\.?$/i.test(safe)) return "agent-access-denied";
  return "unclassified";
}

function result(role, receipts) {
  const summarized = receipts.map(({ method, path, response, boundaryError, csrfRejected, safeErrorClass }) => ({
    method,
    path,
    status: response.status,
    authorizedBoundary: response.status === 403 && boundaryError,
    scopedNotFound: response.status === 404 && response.scopedNotFound === true,
    csrfRejected: response.status === 403 && csrfRejected === true,
    errorClass: safeErrorClass,
  }));
  const failed = receipts.filter(({ response, boundaryError }) =>
    !(response.status === 403 && boundaryError) && !(response.status === 404 && response.scopedNotFound === true));
  const safe = { suite: "A20 authenticated API boundary", actorRole: role, receipts: summarized, denied: failed.length === 0 };
  console.log(JSON.stringify(safe));
  if (failed.length) process.exitCode = 1;
}

function protectedMutations(businessId) {
  return [
    ["POST", "/api/review-booster/settings", {
      businessId,
      business_name: "A20 unauthorized mutation probe",
    }],
    ["POST", "/api/review-booster/visits", {
      businessId,
      customer_name: "A20 synthetic probe",
      customer_email: "probe@a20.example.test",
      visited_at: "2026-10-04",
      service_name: "Synthetic authorization probe",
    }],
    ["PUT", "/api/settings/reply", {
      businessId,
      businessName: "A20 unauthorized mutation probe",
    }],
    ["POST", "/api/reviews/draft", {
      businessId,
      reviewId: credentials.review?.googleReviewId ?? "a20-authenticated-browser-review",
      reply: "A20 synthetic unauthorized draft probe.",
      expectedVersion: 1,
    }],
    ["POST", "/api/google/disconnect", { businessId }],
    ["POST", `/api/stripe/portal?business_id=${encodeURIComponent(businessId)}`],
  ];
}

async function outsiderProbe() {
  const before = fixtureSnapshot();
  const session = await authenticate("outsider");
  const businessId = credentials.business.id;
  const routeSet = [
    ["GET", `/api/review-booster/settings?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/review-booster/visits?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/settings/reply?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/google/connection?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/google/oauth/start?businessId=${encodeURIComponent(businessId)}`],
    ...protectedMutations(businessId),
    ["DELETE", `/api/team/members/${encodeURIComponent(credentials.actors.member.id)}`, undefined, true],
  ];
  const receipts = [];
  for (const [method, route, body, scopedNotFoundExpected] of routeSet) {
    const response = await request(session, method, route, body);
    const errorBody = await response.clone().json().catch(() => ({}));
    const safeErrorClass = errorClass(errorBody.error ?? errorBody.code);
    const boundaryError = ["business-access-denied", "google-scope-denied", "owner-only", "workspace-access-denied", "agent-access-denied"].includes(safeErrorClass);
    const csrfRejected = safeErrorClass === "cross-origin-guard";
    const scopedNotFound = scopedNotFoundExpected === true && response.status === 404 && safeErrorClass === "member-not-found";
    receipts.push({ method, path: new URL(route, base).pathname, response: Object.assign(response, { scopedNotFound }), boundaryError, csrfRejected, safeErrorClass });
  }
  result("outsider", receipts);
  const after = fixtureSnapshot();
  const unchanged = equalSnapshot(before, after);
  console.log(JSON.stringify({ suite: "A20 outsider denied writes", fixtureUnchanged: unchanged }));
  if (!unchanged) process.exitCode = 1;
}

async function securityProbe() {
  const session = await authenticate("owner");
  const pages = ["/dashboard", "/dashboard/agents/review-replies/reviews"];
  const receipts = [];
  for (const route of pages) {
    const response = await boundedFetch(new URL(route, base), {
      headers: { cookie: session.jar.header(), accept: "text/html" },
      redirect: "manual",
    });
    const html = await response.text();
    const enforced = response.headers.get("content-security-policy") ?? "";
    const reportOnly = response.headers.get("content-security-policy-report-only") ?? "";
    const nonce = enforced.match(/\bnonce-([^'\s;]+)/)?.[1] ?? "";
    const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, attrs, body]) => !/\bsrc\s*=/i.test(attrs) && body.trim() && !/\btype\s*=\s*["'](?:application\/json|application\/ld\+json|importmap)["']/i.test(attrs));
    const nonces = inlineScripts.map(([, attrs]) => attrs.match(/\bnonce\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "");
    receipts.push({
      route,
      status: response.status,
      nonce,
      inlineScriptCount: inlineScripts.length,
      inlineNoncesMatch: Boolean(nonce) && inlineScripts.length > 0 && nonces.every((value) => value === nonce),
      reportOnlyTrustedTypes: /require-trusted-types-for\s+'script'/i.test(reportOnly) && /trusted-types/i.test(reportOnly),
      trustedTypesEnforced: /require-trusted-types-for\s+'script'/i.test(enforced),
      enforcedCspPresent: Boolean(enforced),
      authShellRendered: html.includes("Dashboard") || html.includes("review inbox"),
    });
  }
  const success = receipts.length === 2 && receipts.every((r) => r.status === 200 && r.inlineNoncesMatch &&
    r.reportOnlyTrustedTypes && !r.trustedTypesEnforced && r.enforcedCspPresent && r.authShellRendered);
  const rotating = Boolean(receipts[0]?.nonce && receipts[1]?.nonce && receipts[0].nonce !== receipts[1].nonce);
  const safe = receipts.map(({ route, status, inlineScriptCount, inlineNoncesMatch, reportOnlyTrustedTypes, trustedTypesEnforced, enforcedCspPresent, authShellRendered }) => ({
    route, status, inlineScriptCount, inlineNoncesMatch, reportOnlyTrustedTypes, trustedTypesEnforced, enforcedCspPresent, authShellRendered,
  }));
  console.log(JSON.stringify({ suite: "A20 signed-in CSP and hydration", actorRole: "owner", rotatingNonce: rotating, pages: safe, pass: success && rotating }));
  if (!success || !rotating) process.exitCode = 1;
}

async function removedMemberProbe() {
  const session = await authenticate("member");
  const before = await request(session, "GET", "/api/review-booster/settings");
  if (!before.ok) throw new Error(`member could not read its authorized workspace before removal (${before.status})`);
  const memberSettings = await before.clone().json().catch(() => ({}));
  if (memberSettings.business_role !== "member" || memberSettings.can_manage_settings !== false) {
    throw new Error("member did not receive the canonical workspace with owner-only settings disabled");
  }
  const teamBefore = await request(session, "GET", "/api/team");
  const teamState = await teamBefore.clone().json().catch(() => ({}));
  if (!teamBefore.ok || teamState.role !== "member" || teamState.canManage !== false) {
    throw new Error("member team access response did not enforce read-only role controls");
  }
  const replySettingsBefore = await request(session, "GET", `/api/settings/reply?businessId=${encodeURIComponent(credentials.business.id)}`);
  const replySettingsState = await replySettingsBefore.clone().json().catch(() => ({}));
  if (!replySettingsBefore.ok || replySettingsState.role !== "member" || replySettingsState.isOwner !== false || replySettingsState.canManageAutoReply !== false) {
    throw new Error("member Reply settings response did not enforce owner-only controls");
  }
  const googleConnectionBefore = await request(session, "GET", `/api/google/connection?businessId=${encodeURIComponent(credentials.business.id)}`);
  const googleState = await googleConnectionBefore.clone().json().catch(() => ({}));
  if (!googleConnectionBefore.ok || googleState.canManage !== false) throw new Error("member Google connection response exposed owner controls");
  const billingBefore = await request(session, "POST", `/api/stripe/portal?business_id=${encodeURIComponent(credentials.business.id)}`);
  const billingError = await billingBefore.clone().json().catch(() => ({}));
  const billingErrorClass = errorClass(billingError.error ?? billingError.code);
  if (billingBefore.status !== 403 || !["business-access-denied", "owner-only"].includes(billingErrorClass)) {
    throw new Error(`member billing portal did not return the expected business boundary (${billingBefore.status}/${billingErrorClass})`);
  }
  console.log(JSON.stringify({ suite: "A20 member billing boundary", status: billingBefore.status, errorClass: billingErrorClass }));
  const beforeOwnerMutations = fixtureSnapshot();
  const ownerMutations = [
    ["POST", "/api/review-booster/settings", { businessId: credentials.business.id, business_name: "A20 unauthorized mutation probe" }],
    ["PUT", "/api/settings/reply", { businessId: credentials.business.id, businessName: "A20 unauthorized mutation probe" }],
    ["POST", "/api/team", { email: "probe@a20.example.test" }],
    ["DELETE", `/api/team/members/${encodeURIComponent(credentials.actors.owner.id)}`],
    ["POST", "/api/google/disconnect", { businessId: credentials.business.id }],
  ];
  const ownerControlReceipts = [];
  for (const [method, route, body] of ownerMutations) {
    const response = await request(session, method, route, body);
    const errorBody = await response.clone().json().catch(() => ({}));
    const safeErrorClass = errorClass(errorBody.error ?? errorBody.code);
    const boundaryError = ["business-access-denied", "google-scope-denied", "owner-only", "workspace-access-denied", "agent-access-denied"].includes(safeErrorClass);
    const csrfRejected = safeErrorClass === "cross-origin-guard";
    ownerControlReceipts.push({ method, path: new URL(route, base).pathname, response, boundaryError, csrfRejected, safeErrorClass });
  }
  result("member-owner-controls", ownerControlReceipts);
  const afterOwnerMutations = fixtureSnapshot();
  const ownerControlsUnchanged = equalSnapshot(beforeOwnerMutations, afterOwnerMutations);
  console.log(JSON.stringify({ suite: "A20 member owner controls", fixtureUnchanged: ownerControlsUnchanged }));
  if (!ownerControlsUnchanged) process.exitCode = 1;
  console.log(JSON.stringify({ suite: "A20 member session prepared", actorRole: "member", beforeRemovalStatus: before.status }));
  console.log("Remove the fixture member through the owner UI, then press Enter here to probe the same persisted Auth.js session.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.once("line", resolve));
  rl.close();

  const businessId = credentials.business.id;
  const beforeSnapshot = fixtureSnapshot();
  if (beforeSnapshot.memberPresent !== 0) throw new Error("fixture member is still present after the interactive removal step");
  const receipts = [];
  for (const [method, route, body] of [
    ["GET", `/api/review-booster/settings?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/review-booster/visits?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/settings/reply?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/google/connection?businessId=${encodeURIComponent(businessId)}`],
    ["GET", `/api/google/oauth/start?businessId=${encodeURIComponent(businessId)}`],
    ...protectedMutations(businessId),
  ]) {
    const response = await request(session, method, route, body);
    const errorBody = await response.clone().json().catch(() => ({}));
    const safeErrorClass = errorClass(errorBody.error ?? errorBody.code);
    const boundaryError = ["business-access-denied", "google-scope-denied", "owner-only", "workspace-access-denied", "agent-access-denied"].includes(safeErrorClass);
    const csrfRejected = safeErrorClass === "cross-origin-guard";
    receipts.push({ method, path: new URL(route, base).pathname, response, boundaryError, csrfRejected, safeErrorClass });
  }
  result("removed-member-existing-session", receipts);
  const after = fixtureSnapshot();
  const unchanged = equalSnapshot(beforeSnapshot, after);
  console.log(JSON.stringify({ suite: "A20 removed-member denied writes", fixtureUnchangedAfterRemoval: unchanged }));
  if (!unchanged) process.exitCode = 1;
}

async function ownerWriteProbe() {
  const session = await authenticate("owner");
  const before = fixtureSnapshot();
  const settings = await request(session, "POST", "/api/review-booster/settings", {
    businessId: credentials.business.id, business_name: "A20 Verified Studio",
  });
  assert.equal(settings.status, 200, "owner settings must pass origin and authorization checks");
  const readSettings = await request(session, "GET", "/api/review-booster/settings");
  assert.equal(readSettings.status, 200);
  assert.equal((await readSettings.json()).name, "A20 Verified Studio");
  const visit = await request(session, "POST", "/api/review-booster/visits", {
    customer_name: "A20 Synthetic Guest", customer_email: "probe@a20.example.test",
    visited_at: new Date().toISOString(), service_name: "Synthetic intake",
  });
  assert.equal(visit.status, 201, "owner intake must persist in its workspace");
  assert.equal((await visit.json()).business_id, credentials.business.id);
  const reply = "A20 controlled server edit for conflict acceptance.";
  const payload = { businessId: credentials.business.id, reviewId: credentials.review.googleReviewId,
    reply, expectedVersion: before.draft.version };
  const saved = await request(session, "POST", "/api/reviews/draft", payload);
  assert.equal(saved.status, 200, "owner draft save must persist");
  const afterSave = fixtureSnapshot();
  assert.equal(afterSave.ownerVisits, before.ownerVisits + 1);
  assert.equal(afterSave.draft.version, before.draft.version + 1);
  assert.equal(afterSave.draft.sha256, createHash("sha256").update(reply).digest("hex"));
  const stale = await request(session, "POST", "/api/reviews/draft", { ...payload, reply: "A20 stale edit must not overwrite." });
  assert.equal(stale.status, 409);
  assert.equal(equalSnapshot(afterSave, fixtureSnapshot()), true, "stale save leaves the fixture unchanged");
  for (const [origin, site] of [["https://foreign.example.test", "same-origin"], [base.origin, "cross-site"]]) {
    const denied = await boundedFetch(new URL("/api/review-booster/settings", base), {
      method: "POST", headers: { cookie: session.jar.header(), origin, "sec-fetch-site": site,
        "content-type": "application/json" },
      body: JSON.stringify({ business_name: "A20 forbidden write" }), redirect: "manual",
    });
    assert.equal(denied.status, 403);
    assert.equal(errorClass((await denied.json()).error), "cross-origin-guard");
  }
  assert.equal(equalSnapshot(afterSave, fixtureSnapshot()), true, "foreign-origin and cross-site probes make no writes");
  console.log(JSON.stringify({ suite: "A20 authenticated owner persistence", settings: 200,
    intake: 201, draftSave: 200, staleSave: 409, persisted: true, csrfDenials: 2, pass: true }));
}

const action = process.argv[2];
if (action === "outsider") await outsiderProbe();
else if (action === "security") await securityProbe();
else if (action === "member-removal") await removedMemberProbe();
else if (action === "writes") await ownerWriteProbe();
else throw new Error("usage: node scripts/a20-authenticated-http-acceptance.mjs <outsider|security|member-removal|writes>");
