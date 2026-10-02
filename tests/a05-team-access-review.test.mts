import assert from "node:assert/strict";
import test from "node:test";

import { fakeSql, loadTs } from "./a02-test-support.mts";

const ownerId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const businessId = "33333333-3333-4333-8333-333333333333";
const invitationId = "44444444-4444-4444-8444-444444444444";

function teamLifecycle(db = fakeSql(() => [])) {
  return loadTs<typeof import("../src/lib/team-lifecycle.ts")>("src/lib/team-lifecycle.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/safe-logger": { safeLogger: { error() {} } },
  });
}

test("team mutations reject cross-site and unmarked requests while allowing same-origin requests", () => {
  const { isSameOriginMutation } = teamLifecycle();
  const target = "https://app.example.test/api/team";

  assert.equal(isSameOriginMutation(new Request(target, { method: "POST", headers: { Origin: "https://app.example.test", "Sec-Fetch-Site": "same-origin" } })), true);
  assert.equal(isSameOriginMutation(new Request(target, { method: "POST", headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" } })), false);
  assert.equal(isSameOriginMutation(new Request(target, { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } })), false);
  assert.equal(isSameOriginMutation(new Request(target, { method: "POST" })), false);
  assert.equal(isSameOriginMutation(new Request(target, { method: "POST", headers: { "Sec-Fetch-Site": "same-origin" } })), true);
});

test("a removed member cannot resolve the explicit original workspace or pass Booster member checks", async () => {
  let memberPresent = true;
  const business = {
    id: businessId,
    owner_user_id: ownerId,
    name: "Workspace",
    business_type: null,
    city: null,
    country: null,
    website: null,
    phone: null,
    google_review_url: null,
    rebooking_url: null,
    tone: "warm",
    language: "en",
    email_from_name: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const db = fakeSql((query) => {
    if (query.includes("FROM public.users actor")) {
      return memberPresent ? [{ ...business, actor_role: "member" }] : [];
    }
    return [];
  });
  const businessContext = loadTs<typeof import("../src/lib/business-context.ts")>("src/lib/business-context.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/validators": { DbBusinessRowSchema: { parse: (row: unknown) => row } },
  });
  const beforeRemoval = await businessContext.resolveBusinessContext(memberId, businessId);
  assert.equal(beforeRemoval?.role, "member");
  memberPresent = false;
  const resolved = await businessContext.resolveBusinessContext(memberId, businessId);
  assert.equal(resolved, null);
  assert.equal(db.calls.length, 2);
  assert.deepEqual(db.calls.map((call) => call.values), [[businessId, memberId], [businessId, memberId]]);

  memberPresent = true;
  const boosterDb = fakeSql(() => memberPresent ? [{}] : []);
  const booster = loadTs<typeof import("../src/modules/review-booster/services/review-booster-db.service.ts")>(
    "src/modules/review-booster/services/review-booster-db.service.ts",
    {
      "@/lib/db/neon": { sql: boosterDb.sql },
      "@/lib/billing/plans": { PLANS: {}, isPlanId: () => false },
      "@/lib/followup-retry-policy": { MAX_FOLLOWUP_ATTEMPTS: 3 },
    },
  );
  await booster.assertBusinessMember(businessId, memberId);
  memberPresent = false;
  await assert.rejects(booster.assertBusinessMember(businessId, memberId), /Business access denied/);
  assert.deepEqual(boosterDb.calls.map((call) => call.values), [[businessId, memberId], [businessId, memberId]]);
});

test("invitation revocation route uses the authenticated actor and propagates canonical owner denial", async () => {
  let actorPassedToLifecycle: string | undefined;
  let lifecycleCalls = 0;
  const route = loadTs<typeof import("../src/app/api/team/invitations/[token]/route.ts")>(
    "src/app/api/team/invitations/[token]/route.ts",
    {
      "next/server": { NextResponse: { json: Response.json, redirect: Response.redirect } },
      "@/auth": { auth: async () => ({ user: { id: memberId } }) },
      "@/lib/team-lifecycle": {
        isSameOriginMutation: () => true,
        isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
        revokeTeamInvitation: async (actorId: string, id: string) => {
          lifecycleCalls += 1;
          actorPassedToLifecycle = actorId;
          assert.equal(id, invitationId);
          // The SQL lifecycle contract checks businesses.owner_user_id, not the
          // historical business_members.role field, and denies this member.
          return { status: actorId === ownerId ? "revoked" : "forbidden" };
        },
        teamMutationError: (status: string) => status === "forbidden"
          ? { message: "Only the workspace owner can manage teammates.", httpStatus: 403 }
          : { message: "Unexpected result", httpStatus: 500 },
        teamFailureResponse: () => Response.json({ error: "unexpected" }, { status: 500 }),
      },
      "@/lib/team": { hashTeamInvitationToken: (value: string) => value },
    },
  );

  const response = await route.DELETE!(
    new Request(`https://app.example.test/api/team/invitations/${invitationId}`, {
      method: "DELETE",
      headers: { Origin: "https://app.example.test" },
    }),
    { params: Promise.resolve({ token: invitationId }) },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Only the workspace owner can manage teammates." });
  assert.equal(actorPassedToLifecycle, memberId);
  assert.equal(lifecycleCalls, 1);
});
