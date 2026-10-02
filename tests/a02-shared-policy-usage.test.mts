import assert from "node:assert/strict";
import test from "node:test";
import { fakeSql, loadTs } from "./a02-test-support.mts";

type Usage = {
  checkBusinessReviewReplyUsage(actor: string, business: string): Promise<{ allowed: boolean; used: number; limit: number }>;
  incrementBusinessReviewReplyUsage(actor: string, business: string): Promise<void>;
};
type Defaults = { getBusinessReplyDefaults(actor: string, business: string): Promise<{ business_name: string } | null> };
const businessId = "business-1", actorId = "member-1", ownerId = "owner-1";
const context = { actorUserId: actorId, businessId, role: "member", replyPolicyOwnerUserId: ownerId, usageOwnerUserId: ownerId };
class BusinessAccessError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
function usageMocks(db: ReturnType<typeof fakeSql>, resolveBusinessContext: (...args: string[]) => Promise<unknown>) {
  return {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { resolveBusinessContext, BusinessAccessError },
    "@/lib/validators": { ProfileUsageRowSchema: { parse: (row: unknown) => row } },
    "@/lib/review-reply-policy": { REVIEW_REPLY_SAFETY_LIMIT: 2000 },
  };
}
test("shared reply settings read canonical owner; denied business never queries profiles", async () => {
  const db = fakeSql(() => [{ business_name: "Owner shop" }]);
  const mod = loadTs<Defaults>("src/lib/reply-profile-defaults.ts", {
    "@/lib/db/neon": { sql: db.sql },
    "@/lib/business-context": { resolveBusinessContext: async (actor: string, id: string) => actor === actorId && id === businessId ? context : null },
  });
  assert.equal((await mod.getBusinessReplyDefaults(actorId, businessId))?.business_name, "Owner shop");
  assert.deepEqual(db.calls[0].values, [ownerId]);
  assert.equal(await mod.getBusinessReplyDefaults("stranger", businessId), null);
  assert.equal(db.calls.length, 1);
});
test("reply usage checks selected business and shared owner", async () => {
  const db = fakeSql(() => [{ review_replies_used: 8, review_replies_usage_period_start: "2026-10-01T00:00:00Z", current_period_start: "2026-10-01T00:00:00Z" }]);
  const mod = loadTs<Usage>("src/lib/usage.ts", usageMocks(db, async () => context));
  assert.deepEqual(await mod.checkBusinessReviewReplyUsage(actorId, businessId), { allowed: true, used: 8, limit: 2000 });
  assert.deepEqual(db.calls[0].values, [businessId, ownerId]);
});
test("unauthorized usage check and increment deny before profile SQL", async () => {
  const db = fakeSql(() => []);
  const mod = loadTs<Usage>("src/lib/usage.ts", usageMocks(db, async () => null));
  assert.equal((await mod.checkBusinessReviewReplyUsage(actorId, businessId)).allowed, false);
  await assert.rejects(mod.incrementBusinessReviewReplyUsage(actorId, businessId), (error: unknown) => error instanceof BusinessAccessError && error.status === 403);
  assert.equal(db.calls.length, 0);
});
test("missing owner profile fails closed and limit is shared", async () => {
  const db = fakeSql(() => []);
  const mod = loadTs<Usage>("src/lib/usage.ts", usageMocks(db, async () => context));
  assert.equal((await mod.checkBusinessReviewReplyUsage(actorId, businessId)).allowed, false);
  const atCap = fakeSql(() => [{ review_replies_used: 2000, review_replies_usage_period_start: "2026-10-01T00:00:00Z", current_period_start: "2026-10-01T00:00:00Z" }]);
  const capped = loadTs<Usage>("src/lib/usage.ts", usageMocks(atCap, async () => context));
  assert.equal((await capped.checkBusinessReviewReplyUsage(actorId, businessId)).allowed, false);
});
test("period change resets shared owner counter and increment uses same selected context", async () => {
  const db = fakeSql((query) => query.includes("SELECT") ? [{ review_replies_used: 2000, review_replies_usage_period_start: "2026-09-01T00:00:00Z", current_period_start: "2026-10-01T00:00:00Z" }] : []);
  const contexts: unknown[][] = [];
  const mod = loadTs<Usage>("src/lib/usage.ts", usageMocks(db, async (...args) => { contexts.push(args); return context; }));
  assert.equal((await mod.checkBusinessReviewReplyUsage(actorId, businessId)).used, 0);
  assert.deepEqual(db.calls[1].values, ["2026-10-01T00:00:00.000Z", ownerId]);
  await mod.incrementBusinessReviewReplyUsage(actorId, businessId);
  assert.deepEqual(contexts[1], [actorId, businessId]);
  assert.deepEqual(db.calls[2].values, [ownerId]);
});

test("legacy usage pair retains supplied user ownership even when actor belongs to other workspaces", async () => {
  const db = fakeSql(query => query.includes("SELECT") ? [{ review_replies_used: 3, review_replies_usage_period_start: "2026-10-01T00:00:00Z", current_period_start: "2026-10-01T00:00:00Z" }] : []);
  const mod = loadTs<typeof import("../src/lib/usage.ts")>("src/lib/usage.ts", usageMocks(db, async () => { throw new Error("legacy pair must not infer a workspace"); }));
  assert.equal((await mod.checkReviewReplyUsage(ownerId, businessId)).used, 3);
  await mod.incrementReviewReplyUsage(ownerId);
  assert.deepEqual(db.calls[0].values, [businessId, ownerId]);
  assert.deepEqual(db.calls[1].values, [ownerId]);
});
test("shared usage rejects empty business selection rather than guessing a workspace", async () => {
  const db = fakeSql(() => { throw new Error("must not query"); });
  const mod = loadTs<Usage>("src/lib/usage.ts", usageMocks(db, async () => { throw new Error("must not resolve omitted workspace"); }));
  assert.equal((await mod.checkBusinessReviewReplyUsage(actorId, "")).allowed, false);
  await assert.rejects(mod.incrementBusinessReviewReplyUsage(actorId, ""), (error: unknown) => error instanceof BusinessAccessError && error.status === 403);
});
