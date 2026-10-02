import assert from "node:assert/strict";
import test from "node:test";

import { loadTs } from "./auth-test-harness.mts";

type RouteResponse = Promise<Response>;
type InvitationRoutes = {
  GET(): RouteResponse;
  POST(request: Request): RouteResponse;
};
type InvitationTokenRoutes = {
  POST(request: Request, context: { params: Promise<{ token: string }> }): RouteResponse;
  DELETE(request: Request, context: { params: Promise<{ token: string }> }): RouteResponse;
};
type MemberRoutes = {
  DELETE(request: Request, context: { params: Promise<{ userId: string }> }): RouteResponse;
};
type Lifecycle = {
  hasCompleteTeamAccess(businessId: string): Promise<boolean>;
  reserveTeamInvitation(input: { actorId: string; businessId: string; email: string; tokenHash: string; lifetimeDays: number }): Promise<{ status: string }>;
  acceptTeamInvitation(userId: string, tokenHash: string): Promise<{ status: string }>;
  removeTeamMember(actorId: string, businessId: string, userId: string): Promise<{ status: string }>;
  cleanupFailedTeamInvitation(id: string, tokenHash: string): Promise<void>;
  teamMutationError(status: string): { message: string; httpStatus: number };
  teamFailureResponse(error: unknown, event: string): Response;
  isSameOriginMutation(request: Request): boolean;
  isUuid(value: string): boolean;
};

const ownerSession = { user: { id: "owner-id", email: "owner@example.com" } };
const memberSession = { user: { id: "member-id", email: "member@example.com" } };
const memberId = "10000000-0000-4000-8000-000000000001";
const invitationId = "20000000-0000-4000-8000-000000000002";

function harness() {
  const state = {
    session: ownerSession as typeof ownerSession | typeof memberSession | null,
    role: "owner",
    hasCompleteAccess: false,
    contextError: null as Error | null,
    sqlError: null as Error | null,
    reserveResult: { status: "reserved", invitationId } as { status: string; invitationId?: string },
    acceptResult: { status: "accepted" } as { status: string },
    removeResult: { status: "removed" } as { status: string },
    revokeResult: { status: "revoked" } as { status: string },
    deliveryError: false,
    databaseCalls: 0,
    queries: [] as Array<{ query: string; values: unknown[] }>,
    contextCalls: 0,
    acceptCalls: 0,
    removeCalls: 0,
    revokeCalls: 0,
    reservations: [] as Array<Record<string, unknown>>,
    cleanups: [] as Array<{ invitationId: string; tokenHash: string }>,
    deliveredTo: [] as string[],
    logs: [] as string[],
  };

  const databaseSql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join(" ");
    state.databaseCalls++;
    state.queries.push({ query, values });
    if (state.sqlError) throw state.sqlError;
    if (query.includes("team_reserve_invitation")) {
      state.reservations.push({ actorId: values[0], businessId: values[1], email: values[2], tokenHash: values[3], lifetimeDays: values[4] });
      return [{ result: state.reserveResult }];
    }
    if (query.includes("team_cleanup_invitation")) {
      state.cleanups.push({ invitationId: String(values[0]), tokenHash: String(values[1]) });
      return [];
    }
    if (query.includes("team_accept_invitation")) {
      state.acceptCalls++;
      return [{ result: state.acceptResult }];
    }
    if (query.includes("team_remove_member")) {
      state.removeCalls++;
      return [{ result: state.removeResult }];
    }
    if (query.includes("team_revoke_invitation")) {
      state.revokeCalls++;
      return [{ result: state.revokeResult }];
    }
    if (query.includes("team_has_complete_access")) return [{ allowed: state.hasCompleteAccess }];
    if (query.includes("business_members") || query.includes("team_members")) {
      return [
        { user_id: "owner-id", role: "owner", email: "owner@example.com", name: "Owner" },
        { user_id: "member-id", role: "member", email: "member@example.com", name: "Member" },
      ];
    }
    if (query.includes("team_invitations")) return [];
    return [];
  };
  const lifecycle = loadTs<Lifecycle>("src/lib/team-lifecycle.ts", {
    overrides: {
      "@/lib/db/neon": { sql: databaseSql },
      "@/lib/safe-logger": { safeLogger: { error: (event: string) => state.logs.push(event) } },
    },
  });

  const common = {
    "@/auth": { auth: async () => state.session },
    "@/lib/business-context": {
      resolveBusinessContext: async () => {
        state.contextCalls++;
        if (state.contextError) throw state.contextError;
        return {
          businessId: "business-id",
          ownerUserId: "owner-id",
          role: state.role,
          business: { id: "business-id", name: "A workspace" },
        };
      },
    },
    "@/lib/db/neon": { sql: databaseSql },
    "@/lib/billing/plans": { PLANS: { complete: { seats: 3 } } },
    "@/lib/team-lifecycle": lifecycle,
    "@/lib/team": {
      createTeamInvitationToken: () => "raw-invite-token",
      hashTeamInvitationToken: (token: string) => `hash:${token}`,
      sendTeamInvitationEmail: async (input: { email: string }) => {
        state.deliveredTo.push(input.email);
        if (state.deliveryError) throw new Error("provider outage");
        return { sent: true };
      },
      teamInvitationUrl: (token: string) => `https://app.example/team/invite/${token}`,
      TEAM_INVITATION_DAYS: 7,
    },
    "@/lib/safe-logger": { safeLogger: { error: (event: string) => state.logs.push(event) } },
  };

  const routeOverrides = common;
  const team = loadTs<InvitationRoutes>("src/app/api/team/route.ts", { overrides: routeOverrides });
  const invitations = loadTs<InvitationTokenRoutes>("src/app/api/team/invitations/[token]/route.ts", { overrides: routeOverrides });
  const members = loadTs<MemberRoutes>("src/app/api/team/members/[userId]/route.ts", { overrides: routeOverrides });
  return { state, team, invitations, members };
}

function request(path: string, method = "POST", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://app.example${path}`, {
    method,
    headers: { origin: "https://app.example", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>;
}

test("unauthenticated team reads and invite writes return 401", async () => {
  const h = harness();
  h.state.session = null;
  assert.equal((await h.team.GET()).status, 401);
  assert.equal((await h.team.POST(request("/api/team", "POST", { email: "new@example.com" }))).status, 401);
  assert.equal(h.state.contextCalls, 0);
});

test("owner team GET exposes cleanup permission after Complete access lapses", async () => {
  const h = harness();
  h.state.hasCompleteAccess = false;
  const response = await h.team.GET();
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.hasCompleteAccess, false);
  assert.equal(body.canManage, true);
  assert.equal(body.role, "owner");
  assert.equal((body.members as Array<{ role: string }>)[0]?.role, "owner");
});

test("member invite write is rejected by canonical business role", async () => {
  const h = harness();
  h.state.session = memberSession;
  h.state.role = "member";
  const response = await h.team.POST(request("/api/team", "POST", { email: "new@example.com" }));
  assert.equal(response.status, 403);
  assert.deepEqual(await json(response), { error: "Only the workspace owner can invite teammates." });
  assert.equal(h.state.reservations.length, 0);
});

test("owner reservation conflicts return 409 before provider delivery", async () => {
  const h = harness();
  h.state.reserveResult = { status: "seats_full" };
  const response = await h.team.POST(request("/api/team", "POST", { email: "new@example.com" }));
  assert.equal(response.status, 409);
  assert.deepEqual(await json(response), { error: "This workspace has reached its 3-user limit." });
  assert.equal(h.state.deliveredTo.length, 0);
});

test("email provider failure removes the exact reservation token and row", async () => {
  const h = harness();
  h.state.deliveryError = true;
  const response = await h.team.POST(request("/api/team", "POST", { email: "New@Example.com" }));
  assert.equal(response.status, 502);
  assert.deepEqual(await json(response), { error: "The invitation could not be sent. Please try again." });
  assert.deepEqual(h.state.reservations, [{
    actorId: "owner-id",
    businessId: "business-id",
    email: "new@example.com",
    tokenHash: "hash:raw-invite-token",
    lifetimeDays: 7,
  }]);
  assert.deepEqual(h.state.cleanups, [{ invitationId, tokenHash: "hash:raw-invite-token" }]);
});

test("JSON acceptance returns the destination without dashboard provisioning", async () => {
  const h = harness();
  h.state.contextError = null;
  const response = await h.invitations.POST(
    request("/api/team/invitations/raw-token", "POST", undefined, { accept: "application/json" }),
    { params: Promise.resolve({ token: "raw-token" }) },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), { ok: true, redirectTo: "/dashboard/agents/review-replies/settings?team=accepted" });
  assert.equal(h.state.acceptCalls, 1);
  assert.equal(h.state.contextCalls, 0);
  assert.equal(h.state.queries.length, 1, "acceptance only runs its atomic lifecycle query");
  assert.match(h.state.queries[0]!.query, /team_accept_invitation/);
});

test("native form acceptance retains 303 redirect semantics", async () => {
  const h = harness();
  const response = await h.invitations.POST(
    request("/api/team/invitations/raw-token"),
    { params: Promise.resolve({ token: "raw-token" }) },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://app.example/dashboard/agents/review-replies/settings?team=accepted");
});

test("acceptance rejects an authenticated email mismatch with 403", async () => {
  const h = harness();
  h.state.acceptResult = { status: "email_mismatch" };
  const response = await h.invitations.POST(
    request("/api/team/invitations/raw-token"),
    { params: Promise.resolve({ token: "raw-token" }) },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await json(response), { error: "Verify and log in with the email address on the invitation." });
});

test("member removal returns owner conflict and member authorization denial", async () => {
  const h = harness();
  h.state.removeResult = { status: "owner_protected" };
  const ownerTarget = await h.members.DELETE(
    request(`/api/team/members/${memberId}`, "DELETE"),
    { params: Promise.resolve({ userId: memberId }) },
  );
  assert.equal(ownerTarget.status, 409);
  assert.deepEqual(await json(ownerTarget), { error: "The workspace owner cannot be removed." });

  h.state.session = memberSession;
  h.state.role = "member";
  const denied = await h.members.DELETE(
    request(`/api/team/members/${memberId}`, "DELETE"),
    { params: Promise.resolve({ userId: memberId }) },
  );
  assert.equal(denied.status, 403);
  assert.deepEqual(await json(denied), { error: "Only the workspace owner can remove teammates." });
  assert.equal(h.state.removeCalls, 1, "the member request is denied before lifecycle removal");
});

test("unexpected business lookup failures return generic JSON 500", async () => {
  const h = harness();
  h.state.contextError = new Error("private database detail");
  const response = await h.team.GET();
  assert.equal(response.status, 500);
  assert.deepEqual(await json(response), { error: "The team request could not be completed. Please try again." });
  assert.equal(h.state.logs.includes("team.get.failed"), true);
});
