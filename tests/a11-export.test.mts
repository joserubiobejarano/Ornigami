import assert from "node:assert/strict";
import test from "node:test";

import { loadTs } from "./auth-test-harness.mts";

type ExportRoute = { GET(request: Request): Promise<Response> };
const ownerId = "10000000-0000-4000-8000-000000000001";
const businessId = "20000000-0000-4000-8000-000000000002";
const otherBusinessId = "30000000-0000-4000-8000-000000000003";

function harness(input: {
  userId?: string | null;
  result?: unknown;
  fail?: boolean;
} = {}) {
  const state = { calls: 0, query: "", values: [] as unknown[] };
  const route = loadTs<ExportRoute>("src/app/api/privacy/export/route.ts", { overrides: {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/auth": { auth: async () => input.userId === null ? null : ({ user: { id: input.userId ?? ownerId } }) },
    "@/lib/db/neon": { sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.calls++;
      state.query = strings.join(" ? ");
      state.values = values;
      if (input.fail) throw new Error("private database details");
      return input.result ?? [{ export_data: { version: 1, scope: "personal", projects: [], businesses: [] } }];
    } },
    "@/lib/safe-logger": { safeLogger: { error: () => {} } },
  } });
  return { route, state };
}

test("personal export defaults to account-only data and uses explicit safe projections", async () => {
  const fixture = {
    version: 1,
    scope: "personal",
    user: { id: ownerId, email: "owner@example.test" },
    projects: [{ title: "owned project" }],
    memberships: [{ business_id: businessId, role: "member" }],
    invitations: [{ business_id: businessId, role: "member", status: "revoked", revoked_at: "2026-01-01T00:00:00Z" }],
    billing: { trialHistory: { state: "consumed" } },
  };
  const { route, state } = harness({ result: [{ export_data: fixture }] });
  const response = await route.GET(new Request("https://app.example/api/privacy/export"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.deepEqual(await response.json(), fixture);
  assert.equal(state.calls, 1);
  assert.equal(state.values[0], ownerId);
  assert.match(state.query, /'projects'/);
  assert.match(state.query, /FROM public\.projects p INNER JOIN actor a ON a\.id = p\.user_id/);
  assert.match(state.query, /privacy_deletion_requested_at IS NULL/);
  assert.match(state.query, /'revoked_at', i\.revoked_at/);
  assert.doesNotMatch(state.query, /SELECT\s+\*/i);
  assert.doesNotMatch(state.query, /'email', i\.email/);
  assert.doesNotMatch(state.query, /password_hash|access_token|refresh_token|token_hash|raw_payload/);
});

test("workspace export requires the owner query and returns only workspace-scoped histories", async () => {
  const fixture = {
    version: 1,
    scope: "workspace",
    businesses: [{
      business: { id: businessId, name: "Owner workspace" },
      reviews: [{ google_review_id: "review-a" }],
      replies: [{ posted: true }],
      replyDraftState: [{ state: "approved", version: 3 }],
      replyUsageReservations: [{ state: "committed", usage_period_start: "2026-10-01T00:00:00Z" }],
      visits: [{ customer_email: "customer@example.test" }],
      messages: [{ status: "sent" }],
      boosterDeliveries: [{ state: "accepted", reservation_month: "2026-10-01" }],
      boosterQuotaLegacyUsage: [{ month_start_utc: "2026-09-01", accepted_count: 4 }],
      clicks: [{ clicked_at: "2026-01-01T00:00:00Z" }],
      unsubscribeSuppressions: [{ customer_email: "customer@example.test" }],
      invitations: [{ status: "revoked", revoked_at: "2026-01-01T00:00:00Z" }],
      bookingCredentials: [{ id: "credential-1", label: "Calendar", created_at: "2026-01-01T00:00:00Z", last_used_at: null, revoked_at: null }],
      replyPostOutcomes: [{ business_id: businessId, review_id: 12, outcome: "accepted", recorded_at: "2026-01-01T00:00:00Z" }],
    }],
  };
  const { route, state } = harness({ result: [{ export_data: fixture }] });
  const response = await route.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessId}`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fixture);
  assert.equal(state.values[0], ownerId);
  assert.equal(state.values[1], businessId);
  assert.match(state.query, /INNER JOIN actor a ON a\.id = b\.owner_user_id/);
  assert.match(state.query, /privacy_deletion_requested_at IS NULL/);
  for (const table of ["reviews", "review_replies", "review_reply_draft_state", "review_reply_usage_reservations", "followup_visits", "followup_messages", "booster_followup_deliveries", "booster_quota_legacy_usage", "review_link_clicks", "followup_unsubscribes", "team_invitations"]) {
    assert.match(state.query, new RegExp(`FROM public\\.${table} \\w+ WHERE \\w+\\.business_id = b\\.id`));
  }
  assert.match(state.query, /'bookingCredentials'/);
  assert.match(state.query, /'label', c\.label/);
  assert.doesNotMatch(state.query, /'encrypted_secret'/);
  assert.match(state.query, /'replyPostOutcomes'/);
  assert.match(state.query, /'outcome', o\.outcome/);
  assert.match(state.query, /'business_id', o\.business_id/);
  assert.match(state.query, /FROM public\.privacy_reply_post_outcomes o WHERE o\.business_id = b\.id/);
  assert.doesNotMatch(state.query, /'claim_token'|'actor_user_id'/);
  assert.doesNotMatch(state.query, /token_hash|stripe_payload|idempotency_key|raw_payload|access_token|refresh_token/);
  assert.doesNotMatch(state.query, /'user_id'|'invited_by'|'email', i\.email/);
  for (const sensitive of ["provider_payload", "idempotency_key", "lease_token", "provider_message_id", "error_message", "generation_token", "generation_fence", "posting_token", "posting_lease_until", "request_id", "actor_user_id"]) {
    assert.doesNotMatch(state.query, new RegExp(`'${sensitive}'`));
  }
});

test("member workspace and unowned business requests are denied, while invalid scope fails before SQL", async () => {
  const denied = harness({ result: [] });
  const memberResponse = await denied.route.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${businessId}`));
  assert.equal(memberResponse.status, 403);
  assert.deepEqual(await memberResponse.json(), { error: "Workspace not found or not owned by this account." });
  assert.equal(denied.state.calls, 1);

  const invalid = harness();
  const invalidResponse = await invalid.route.GET(new Request("https://app.example/api/privacy/export?scope=all"));
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalid.state.calls, 0);
});

test("stale sessions, malformed business ids, and database failures return private generic errors", async () => {
  const missingUser = harness({ userId: null });
  assert.equal((await missingUser.route.GET(new Request("https://app.example/api/privacy/export"))).status, 401);
  assert.equal(missingUser.state.calls, 0);

  const malformed = harness();
  assert.equal((await malformed.route.GET(new Request(`https://app.example/api/privacy/export?scope=workspace&businessId=${otherBusinessId},bad`))).status, 400);
  assert.equal(malformed.state.calls, 0);

  const failed = harness({ fail: true });
  const response = await failed.route.GET(new Request("https://app.example/api/privacy/export"));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Export is temporarily unavailable." });
});
