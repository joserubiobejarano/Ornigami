import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{40}$/i;
const MAX_RESPONSE_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 8_000;

export function safeTargetOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("A17 base URL must be a local loopback HTTP URL"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local || url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("A17 base URL must be a local loopback HTTP origin without credentials, path, query, or fragment");
  }
  return url.origin;
}

function isLocalDatabase(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && /^a17_[a-z0-9_]{1,48}$/i.test(db);
  } catch { return false; }
}

/** @param {Record<string, string | undefined>} [env=process.env] */
export function getPrerequisiteReport(env = process.env) {
  const cookieNameOk = (value) => /^(?:authjs\.session-token|__Secure-authjs\.session-token)=[^\r\n;]+$/.test(value || "");
  const checks = {
    targetName: env.A17_TARGET_NAME === "isolated-local" ? "ready" : "blocked",
    localTarget: "blocked",
    isolatedDatabase: isLocalDatabase(env.DATABASE_URL) && env.A17_ISOLATED_DATABASE === new URL(env.DATABASE_URL).pathname.slice(1) ? "ready" : "blocked",
    expectedCommit: SHA.test(env.A17_EXPECTED_COMMIT || "") ? "ready" : "blocked",
    ownerSession: cookieNameOk(env.A17_OWNER_COOKIE) ? "ready" : "blocked",
    memberSession: cookieNameOk(env.A17_MEMBER_COOKIE) ? "ready" : "blocked",
    businessId: UUID.test(env.A17_BUSINESS_ID || "") ? "ready" : "blocked",
  };
  if (env.A17_BASE_URL) {
    try { safeTargetOrigin(env.A17_BASE_URL); checks.localTarget = "ready"; } catch { /* fail closed */ }
  }
  return checks;
}

async function readResponse(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw new Error("response exceeded bounded size");
  if (!response.body) throw new Error("response was empty");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("response exceeded bounded size");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new Error("response was not JSON"); }
}

async function getJson(fetcher, origin, path, cookie) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(new URL(path, `${origin}/`), {
      method: "GET", redirect: "manual", signal: controller.signal,
      headers: { accept: "application/json", cookie },
    });
    if (response.status >= 300 && response.status < 400) throw new Error("redirect refused");
    return { status: response.status, body: await readResponse(response) };
  } finally { clearTimeout(timer); }
}

function assertStatus(result, status, name) {
  if (result.status !== status) throw new Error(`${name} returned HTTP ${result.status}; expected ${status}`);
}

function containsCredentialField(value) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (/(access|refresh|id)[_-]?token|client[_-]?secret|api[_-]?key|authorization/i.test(key)) return true;
    if (containsCredentialField(child)) return true;
  }
  return false;
}

/** @param {{origin:string,businessId:string,locationName?:string,ownerCookie:string,memberCookie:string,fetcher?:typeof fetch}} options */
export async function runReadOnlyApplicationChecks({ origin, businessId, locationName, ownerCookie, memberCookie, fetcher = fetch }) {
  const target = safeTargetOrigin(origin);
  if (!UUID.test(businessId || "") || (locationName && !/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationName))) {
    throw new Error("A17 business or selected location identifier is invalid");
  }
  const validSessionCookie = (value) => /^(?:authjs\.session-token|__Secure-authjs\.session-token)=[^\r\n;]+$/.test(value || "");
  if (!validSessionCookie(ownerCookie) || !validSessionCookie(memberCookie) || ownerCookie.split("=", 1)[0] !== memberCookie.split("=", 1)[0]) {
    throw new Error("A17 owner/member session cookies must use the same supported Auth.js cookie name");
  }
  const business = encodeURIComponent(businessId);
  const owner = ownerCookie;
  const member = memberCookie;
  const checks = [];

  // Settings read exercises the shared workspace role/entitlement boundary.
  const [ownerSettings, memberSettings] = await Promise.all([
    getJson(fetcher, target, `/api/review-booster/settings?businessId=${business}`, owner),
    getJson(fetcher, target, `/api/review-booster/settings?businessId=${business}`, member),
  ]);
  assertStatus(ownerSettings, 200, "owner workspace settings");
  assertStatus(memberSettings, 200, "member workspace settings");
  if (ownerSettings.body.business_role !== "owner" || ownerSettings.body.can_manage_settings !== true ||
      memberSettings.body.business_role !== "member" || memberSettings.body.can_manage_settings !== false ||
      ownerSettings.body.businessId !== businessId || memberSettings.body.businessId !== businessId) {
    throw new Error("workspace settings role or business-scope invariant failed");
  }
  if (containsCredentialField(ownerSettings.body) || containsCredentialField(memberSettings.body)) {
    throw new Error("workspace settings response exposed a credential-shaped field");
  }
  const memberLocations = memberSettings.body.google_profile_locations;
  const selectedLocationId = memberSettings.body.selected_location_id;
  const ownerLocations = ownerSettings.body.google_profile_locations;
  checks.push({ id: "shared-workspace-settings", status: "passed" });
  if (!Array.isArray(memberLocations) || !Array.isArray(ownerLocations)) throw new Error("Google location response shape is invalid");
  if (memberLocations.length > 1) throw new Error("member Google discovery exposed locations beyond its selected business location");
  if (!locationName || !selectedLocationId || memberLocations.length === 0) {
    checks.push({ id: "selected-google-reviews", status: "blocked-no-controlled-selected-location" });
    return checks;
  }
  if (memberLocations[0]?.id !== selectedLocationId || memberLocations[0]?.selected !== true ||
      !ownerLocations.some((item) => item?.id === selectedLocationId && item?.selected === true)) {
    throw new Error("member Google discovery did not remain limited to the selected location");
  }

  // The same selected Google location and local review set must be visible to both
  // authorized workspace actors. The bodies are inspected only in memory.
  const reviewPath = `/api/reviews?businessId=${business}&loc=${encodeURIComponent(locationName)}`;
  const [ownerReviews, memberReviews] = await Promise.all([
    getJson(fetcher, target, reviewPath, owner), getJson(fetcher, target, reviewPath, member),
  ]);
  assertStatus(ownerReviews, 200, "owner selected-location reviews");
  assertStatus(memberReviews, 200, "member selected-location reviews");
  for (const [actor, result] of [["owner", ownerReviews], ["member", memberReviews]]) {
    if (containsCredentialField(result.body)) throw new Error("credential-shaped field in selected-location reviews");
    if (result.body.businessId !== businessId || result.body.locationName !== locationName || !Array.isArray(result.body.items) ||
        result.body.items.length === 0 || result.body.items.some((item) => typeof item?.google_review_id !== "string")) {
      throw new Error(`${actor} review list did not remain within the selected workspace location`);
    }
  }
  const ownerReviewIds = ownerReviews.body.items.map((item) => item.google_review_id).sort();
  const memberReviewIds = memberReviews.body.items.map((item) => item.google_review_id).sort();
  if (JSON.stringify(ownerReviewIds) !== JSON.stringify(memberReviewIds)) throw new Error("authorized workspace actors did not see the same selected-location review set");
  checks.push({ id: "selected-google-reviews", status: "passed", itemCount: ownerReviews.body.items.length });
  return checks;
}

function currentCommit(cwd) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

function workingTreeClean(cwd) {
  return execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim() === "";
}

/** @param {{commit:string,targetName?:string,applicationChecks?:Array<{id:string,status:string,itemCount?:number}>,prerequisiteChecks?:Record<string,string>,error?:unknown}} input */
export function buildEvidence({ commit, targetName, applicationChecks = [], prerequisiteChecks = {}, error = null }) {
  const blocked = Object.values(prerequisiteChecks).some((value) => value !== "ready");
  return {
    schema: "ornigami.a17.provider-acceptance.v1",
    recordedAt: new Date().toISOString(),
    candidateCommit: commit || null,
    targetName: targetName || null,
    applicationStatus: error ? "failed" : blocked || applicationChecks.some((check) => check.status !== "passed") ? "blocked" : applicationChecks.length ? "passed" : "not-run",
    applicationChecks,
    providers: {
      stripe: { status: "skipped-user-waived", scope: "Stripe tests excluded from this acceptance run" },
      resend: { status: "blocked-cross-workflow-acceptance", directProbe: "recorded-separately-if-run" },
      google: { status: "blocked-no-controlled-business-profile" },
      openai: { status: "blocked-cross-workflow-acceptance" },
      sentry: { status: "blocked-event-smoke-not-authorized", readAccessProbe: "recorded-separately-if-run" },
    },
    overallStatus: "blocked",
    error: error ? "application_check_failed" : null,
    prerequisites: prerequisiteChecks,
    note: "Read-only application checks do not establish live provider acceptance.",
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const cwd = process.cwd();
  const head = currentCommit(cwd);
  const prerequisites = getPrerequisiteReport();
  let checks = [];
  let error = null;

  if (args.has("--execute")) {
    if (process.env.A17_CONFIRM_READ_ONLY !== "I_AUTHORIZE_READ_ONLY_LOCAL_CHECKS") {
      error = "execution requires A17_CONFIRM_READ_ONLY=I_AUTHORIZE_READ_ONLY_LOCAL_CHECKS";
    } else if (!workingTreeClean(cwd) || process.env.A17_EXPECTED_COMMIT !== head) {
      error = "working tree must be clean and A17_EXPECTED_COMMIT must equal local HEAD";
    } else if (Object.values(prerequisites).some((status) => status !== "ready")) {
      error = "one or more controlled local target prerequisites are missing";
    } else {
      try {
        checks = await runReadOnlyApplicationChecks({
          origin: process.env.A17_BASE_URL,
          businessId: process.env.A17_BUSINESS_ID,
          locationName: process.env.A17_LOCATION_NAME,
          ownerCookie: process.env.A17_OWNER_COOKIE,
          memberCookie: process.env.A17_MEMBER_COOKIE,
        });
      } catch (cause) { error = cause instanceof Error ? cause.message : "application check failed"; }
    }
  }

  const evidence = buildEvidence({ commit: head, targetName: process.env.A17_TARGET_NAME, applicationChecks: checks, prerequisiteChecks: prerequisites, error });
  if (process.env.A17_EVIDENCE_FILE) {
    const path = process.env.A17_EVIDENCE_FILE;
    if (!path.toLowerCase().endsWith(".json")) throw new Error("A17_EVIDENCE_FILE must end in .json");
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = error ? 1 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(() => { process.stderr.write("A17 acceptance harness failed closed; inspect local configuration privately.\n"); process.exitCode = 1; });
}
