import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvidence,
  getPrerequisiteReport,
  runReadOnlyApplicationChecks,
  safeTargetOrigin,
} from "../scripts/a17-provider-acceptance.mjs";

const businessId = "10000000-0000-4000-8000-000000000001";
const locationName = "accounts/123/locations/456";

function appFetcher({ leakToken = false, memberLocations = [{ id: "selected", selected: true }], noGoogle = false } = {}) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const isMember = new Headers(init?.headers).get("cookie")?.includes("member-session") || false;
    let body: Record<string, unknown>;
    if (url.pathname === "/api/review-booster/settings") {
      body = {
        businessId,
        business_role: isMember ? "member" : "owner",
        can_manage_settings: !isMember,
        selected_location_id: noGoogle ? null : "selected",
        google_profile_locations: noGoogle ? [] : isMember ? memberLocations : [{ id: "selected", selected: true }, { id: "other", selected: false }],
        ...(leakToken ? { access_token: "never-output" } : {}),
      };
    } else {
      body = { businessId, locationName, items: [{ google_review_id: "review-a" }] };
    }
    return Response.json(body);
  };
}

test("A17 read-only checks exercise owner/member settings and selected-location review reads", async () => {
  const result = await runReadOnlyApplicationChecks({
    origin: "http://127.0.0.1:3000", businessId, locationName,
    ownerCookie: "authjs.session-token=owner-session", memberCookie: "authjs.session-token=member-session", fetcher: appFetcher(),
  });
  assert.deepEqual(result.map(({ id }) => id), ["shared-workspace-settings", "selected-google-reviews"]);
  assert.equal(result[1]?.itemCount, 1);
});

test("A17 read-only checks fail closed on member location leakage and credential-shaped fields", async () => {
  await assert.rejects(runReadOnlyApplicationChecks({
    origin: "http://127.0.0.1:3000", businessId, locationName,
    ownerCookie: "authjs.session-token=owner-session", memberCookie: "authjs.session-token=member-session",
    fetcher: appFetcher({ memberLocations: [{ id: "selected", selected: true }, { id: "other", selected: false }] }),
  }), /member Google discovery/);
  await assert.rejects(runReadOnlyApplicationChecks({
    origin: "http://127.0.0.1:3000", businessId, locationName,
    ownerCookie: "authjs.session-token=owner-session", memberCookie: "authjs.session-token=member-session", fetcher: appFetcher({ leakToken: true }),
  }), /credential-shaped field/);
});

test("Booster workspace role checks remain useful while Google-dependent Replies are blocked", async () => {
  const checks = await runReadOnlyApplicationChecks({
    origin: "http://127.0.0.1:3000", businessId, locationName,
    ownerCookie: "authjs.session-token=owner-session", memberCookie: "authjs.session-token=member-session",
    fetcher: appFetcher({ noGoogle: true }),
  });
  assert.deepEqual(checks, [
    { id: "shared-workspace-settings", status: "passed" },
    { id: "selected-google-reviews", status: "blocked-no-controlled-selected-location" },
  ]);
});

test("A17 refuses remote targets, redirects, unpinned commits, and non-isolated databases", () => {
  assert.equal(safeTargetOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.throws(() => safeTargetOrigin("https://production.example"), /local loopback/);
  assert.throws(() => safeTargetOrigin("http://user:pass@localhost:3000"), /local loopback/);
  assert.throws(() => safeTargetOrigin("http://localhost:3000/path"), /local loopback/);
  const report = getPrerequisiteReport({
    A17_TARGET_NAME: "isolated-local",
    A17_BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://postgres@127.0.0.1:5432/a17_acceptance",
    A17_ISOLATED_DATABASE: "a17_acceptance",
    A17_EXPECTED_COMMIT: "a".repeat(40),
    A17_OWNER_COOKIE: "authjs.session-token=owner", A17_MEMBER_COOKIE: "authjs.session-token=member",
    A17_BUSINESS_ID: businessId, A17_LOCATION_NAME: locationName,
  });
  assert.ok(Object.values(report).every((value) => value === "ready"));
  assert.equal(getPrerequisiteReport({ ...process.env, A17_TARGET_NAME: "production", DATABASE_URL: "postgres://prod/db" }).targetName, "blocked");
});

test("read-only application checks cannot produce full provider acceptance evidence", () => {
  const evidence = buildEvidence({
    commit: "a".repeat(40), targetName: "isolated-local",
    applicationChecks: [{ id: "shared-workspace-settings", status: "passed" }],
    prerequisiteChecks: { localTarget: "ready" },
  });
  assert.equal(evidence.applicationStatus, "passed");
  assert.equal(evidence.providers.stripe.status, "skipped-user-waived");
  assert.equal(evidence.providers.resend.status, "blocked-cross-workflow-acceptance");
  assert.equal(evidence.providers.google.status, "blocked-no-controlled-business-profile");
  assert.equal(evidence.overallStatus, "blocked");
});
