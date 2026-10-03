import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const owner = "a0700000-0000-4000-8000-000000000001";
const businessOne = "a0700000-0000-4000-8000-000000000002";
const businessTwo = "a0700000-0000-4000-8000-000000000003";
const credentialId = "a0700000-0000-4000-8000-000000000011";

function setup(options: { sessionUserId?: string | null; denyBusinessId?: string } = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const route = loadTs<{
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
    DELETE: (request: Request) => Promise<Response>;
  }>("src/app/api/review-booster/booking-credentials/route.ts", {
    "next/server": { NextResponse: { json: (payload: unknown, init?: ResponseInit) => Response.json(payload, init) } },
    "@/auth": { auth: async () => options.sessionUserId === null ? null : { user: { id: options.sessionUserId ?? owner } } },
    "@/lib/business-context": {
      BusinessAccessError: class BusinessAccessError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } },
      assertBusinessOwner: () => undefined,
      requireBusinessOwner: async (_actor: string, requested?: string | null) => {
        calls.push({ name: "owner", args: [_actor, requested] });
        if (options.denyBusinessId && requested === options.denyBusinessId) throw Object.assign(new Error("Business access denied."), { status: 403 });
        if (_actor !== owner) throw Object.assign(new Error("Business owner access required."), { status: 403 });
        const id = requested ?? businessOne;
        return { businessId: id, business: { id, owner_user_id: owner }, actorUserId: _actor, role: "owner" };
      },
    },
    "@/lib/api-security": { safeApiErrorResponse: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "error" }, { status: Number((error as { status?: number })?.status ?? 500) }) },
    "@/lib/team-lifecycle": { isSameOriginMutation: (request: Request) => request.headers.get("origin") === new URL(request.url).origin },
    "@/modules/review-booster/services/booking-intake.service": {
      createBookingCredential: async (...args: unknown[]) => { calls.push({ name: "create", args }); return { id: credentialId, secret: "synthetic-one-time-secret" }; },
      listBookingCredentials: async (...args: unknown[]) => { calls.push({ name: "list", args }); return [{ id: credentialId, label: "Calendar" }]; },
      revokeBookingCredential: async (...args: unknown[]) => { calls.push({ name: "revoke", args }); return true; },
      isBookingCredentialId: (id: string) => id === credentialId,
    },
  });
  return { route, calls };
}

const sameOrigin = { origin: "https://app.example", "sec-fetch-site": "same-origin" };

test("booking credential routes require signed-in owner and reject cross-origin mutations", async () => {
  const signedOut = setup({ sessionUserId: null });
  assert.equal((await signedOut.route.GET(new Request("https://app.example/api/review-booster/booking-credentials"))).status, 401);

  const member = setup({ sessionUserId: "a0700000-0000-4000-8000-000000000099" });
  assert.equal((await member.route.GET(new Request(`https://app.example/api/review-booster/booking-credentials?business_id=${businessOne}`))).status, 403);

  const crossOrigin = setup();
  const response = await crossOrigin.route.POST(new Request("https://app.example/api/review-booster/booking-credentials", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify({ business_id: businessOne, label: "Calendar" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(crossOrigin.calls.length, 0);
});

test("booking credentials remain explicitly business-scoped and secrets are returned once with no-store", async () => {
  const { route, calls } = setup();
  const get = await route.GET(new Request(`https://app.example/api/review-booster/booking-credentials?business_id=${businessTwo}`));
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("cache-control"), "private, no-store");
  await get.json();
  assert.deepEqual(calls.find((call) => call.name === "list")?.args, [businessTwo]);

  const create = await route.POST(new Request("https://app.example/api/review-booster/booking-credentials", {
    method: "POST", headers: { ...sameOrigin, "content-type": "application/json" }, body: JSON.stringify({ business_id: businessTwo, label: "Calendar" }),
  }));
  assert.equal(create.status, 201);
  assert.equal(create.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await create.json(), { id: credentialId, secret: "synthetic-one-time-secret", created: true, secretShownOnce: true });
  assert.deepEqual(calls.find((call) => call.name === "create")?.args, [businessTwo, owner, "Calendar"]);

  const revoke = await route.DELETE(new Request("https://app.example/api/review-booster/booking-credentials", {
    method: "DELETE", headers: { ...sameOrigin, "content-type": "application/json" }, body: JSON.stringify({ business_id: businessTwo, credential_id: credentialId }),
  }));
  assert.equal(revoke.status, 200);
  assert.deepEqual(calls.find((call) => call.name === "revoke")?.args, [businessTwo, owner, credentialId]);
});

test("invalid requested workspace never falls back to a default workspace", async () => {
  const { route, calls } = setup();
  const response = await route.POST(new Request("https://app.example/api/review-booster/booking-credentials", {
    method: "POST", headers: { ...sameOrigin, "content-type": "application/json" }, body: JSON.stringify({ business_id: "invalid", label: "Calendar" }),
  }));
  assert.equal(response.status, 400);
  assert.equal(calls.some((call) => call.name === "create"), false);
  assert.equal(calls.some((call) => call.name === "owner"), false);
});

test("credential listing rejects blank and repeated business selections", async () => {
  const { route, calls } = setup();
  for (const query of ["business_id=", `business_id=${businessOne}&business_id=${businessTwo}`]) {
    const response = await route.GET(new Request(`https://app.example/api/review-booster/booking-credentials?${query}`));
    assert.equal(response.status, 400);
  }
  assert.equal(calls.some((call) => call.name === "owner"), false);
});
