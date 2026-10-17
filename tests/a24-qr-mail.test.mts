import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const values: Record<string, string> = {
  QR_MAIL_ENABLED: "true",
  QR_MAIL_AUTHORITY_URL: "https://authority.example.test",
  QR_MAIL_BOOSTER_AUTHORITY_TOKEN: "fixture-booster-authority-token",
  QR_MAIL_BOOSTER_SOURCE_ID: "source-booster-fixture",
  QR_MAIL_BOOSTER_SOURCE_REVISION: "rev-booster-fixture",
  QR_MAIL_BOOSTER_SOURCE_REF: "manifest-booster-fixture",
  QR_MAIL_BOOSTER_POLICY_ID: "7",
  QR_MAIL_BOOSTER_ACCOUNT_BINDING: "account-booster-fixture",
  QR_MAIL_BOOSTER_BUSINESS_ID: "11",
  QR_MAIL_DIRECT_AUTHORITY_TOKEN: "fixture-direct-authority-token",
  QR_MAIL_DIRECT_SOURCE_ID: "source-direct-fixture",
  QR_MAIL_DIRECT_SOURCE_REVISION: "rev-direct-fixture",
  QR_MAIL_DIRECT_SOURCE_REF: "manifest-direct-fixture",
  QR_MAIL_DIRECT_POLICY_ID: "8",
  QR_MAIL_DIRECT_ACCOUNT_BINDING: "account-direct-fixture",
  QR_MAIL_DIRECT_BUSINESS_ID: "12",
  RESEND_API_KEY: "fixture-resend-key",
};

type Client = {
  sendAuthorizedResend(bytes: string, context: Record<string, unknown>): Promise<string>;
};

function loadClient(overrides: Record<string, string> = {}): Client {
  const env = { ...values, ...overrides };
  return loadTs<Client>("src/lib/qr-mail.ts", {
    "@/lib/env": {
      getOptionalEnv: (name: string) => env[name],
      getRequiredEnv: (name: string) => env[name] ?? (() => { throw new Error(`missing ${name}`); })(),
    },
  });
}

function authFixture(options: { verify?: boolean; replay?: boolean; providerStatus?: number } = {}) {
  const operations: string[] = [];
  const providerBodies: string[] = [];
  const providerKeys: string[] = [];
  const verifiedPrepared: Array<Record<string, unknown>> = [];
  let reservation: Record<string, unknown> | null = null;
  const expires = () => new Date(Date.now() + 90_000).toISOString();
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    if (target === "https://api.resend.com/emails") {
      providerBodies.push(String(init?.body));
      providerKeys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
      return Response.json({ id: "resend-fixture" }, { status: options.providerStatus ?? 200 });
    }
    const operation = target.split("/").at(-1)!;
    operations.push(operation);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (operation === "preflight") {
      return Response.json({ ok: true, snapshot: {
        policy_id: 7, provider: "resend", environment: "live", account_binding: "account-booster-fixture", business_id: 11,
        candidate_id: body.candidate_id, units: 1, queue_snapshot_ref: "queue-fixture", reviewed_policy_ref: "reviewed-fixture",
        checked_at: new Date().toISOString(), expires_at: expires(), mapping: {}, sources: [], windows: [],
      } });
    }
    if (operation === "reserve") {
      const request = body;
      reservation = {
        reservation_ref: "ref:00000000-0000-4000-8000-000000000001", policy_id: 7, provider: "resend", environment: "live",
        account_binding: "account-booster-fixture", business_id: 11, work_key: request.work_key, candidate_id: (request.snapshot as Record<string, unknown>).candidate_id,
        units: 1, queue_snapshot_ref: "queue-fixture", idempotency_key: request.idempotency_key,
        issued_at: new Date().toISOString(), expires_at: expires(), state: "reserved", fence: 1,
        replayed: options.replay ?? false, quota_charged: true, capacity_held: true, retry_permitted: false,
      };
      return Response.json({ ok: true, reservation });
    }
    if (operation === "verify") { verifiedPrepared.push(body.prepared as Record<string, unknown>); return Response.json({ ok: true, verified: options.verify ?? true }); }
    if (operation === "handoff") {
      reservation = { ...reservation!, state: "handoff", fence: 2 };
      return Response.json({ ok: true, reservation });
    }
    if (operation === "settle") {
      const outcome = body.outcome;
      reservation = {
        ...reservation!, state: outcome === "sent" ? "sent" : outcome === "unknown" ? "unknown" : "cancelled",
        capacity_held: outcome === "unknown",
      };
      return Response.json({ ok: true, reservation });
    }
    throw new Error(`unexpected authority operation ${operation}`);
  };
  return { operations, providerBodies, providerKeys, verifiedPrepared, fetcher };
}

const context = {
  purpose: "booster_followup", businessId: "native-business-uuid", candidateId: "native-visit-id",
  workKey: "durable-delivery-id", idempotencyKey: "existing-provider-key",
};

test("authority fence binds the exact payload before one provider call and preserves provider idempotency", async () => {
  const fixture = authFixture();
  const original = globalThis.fetch;
  const payload = JSON.stringify({ from: "fixture@example.test", to: "private@example.test", text: "fixture message" });
  try {
    globalThis.fetch = fixture.fetcher as typeof fetch;
    const result = await loadClient().sendAuthorizedResend(payload, context);
    assert.equal(result, "resend-fixture");
    assert.deepEqual(fixture.operations, ["preflight", "reserve", "verify", "handoff", "verify", "settle"]);
    assert.deepEqual(fixture.providerBodies, [payload]);
    assert.deepEqual(fixture.providerKeys, [context.idempotencyKey]);
    assert.equal(fixture.verifiedPrepared.length, 2);
    for (const prepared of fixture.verifiedPrepared) assert.equal(prepared.payload_digest, createHash("sha256").update(payload).digest("hex"));
    assert.deepEqual(fixture.verifiedPrepared[0], fixture.verifiedPrepared[1]);
    assert.equal(fixture.verifiedPrepared[0]?.business_id, 11);
    assert.equal(fixture.verifiedPrepared[0]?.purpose, context.purpose);
  } finally { globalThis.fetch = original; }
});

test("failed final verification and replayed reservations make zero provider calls", async () => {
  const original = globalThis.fetch;
  try {
    const denied = authFixture({ verify: false });
    globalThis.fetch = denied.fetcher as typeof fetch;
    await assert.rejects(loadClient().sendAuthorizedResend("{}", context));
    assert.equal(denied.providerBodies.length, 0);
    assert.equal(denied.operations.at(-1), "settle");

    const replay = authFixture({ replay: true });
    globalThis.fetch = replay.fetcher as typeof fetch;
    await assert.rejects(loadClient().sendAuthorizedResend("{}", context), /scope does not match/);
    assert.equal(replay.providerBodies.length, 0);
  } finally { globalThis.fetch = original; }
});

test("provider rejection settles unknown and the same work key cannot make another provider call", async () => {
  const fixture = authFixture({ providerStatus: 400 });
  const original = globalThis.fetch;
  try {
    globalThis.fetch = fixture.fetcher as typeof fetch;
    await assert.rejects(loadClient().sendAuthorizedResend("{}", context), /outcome is unknown/);
    assert.deepEqual(fixture.operations.slice(-1), ["settle"]);
    assert.equal(fixture.providerBodies.length, 1);
  } finally { globalThis.fetch = original; }
});

test("missing default-closed configuration refuses before authority or provider I/O", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { calls += 1; return Response.json({}); }) as typeof fetch;
  try {
    await assert.rejects(loadClient({ QR_MAIL_ENABLED: "false" }).sendAuthorizedResend("{}", context), /disabled/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
