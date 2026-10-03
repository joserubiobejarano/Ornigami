import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  checkSentryProject,
  checkResendSenderDomain,
  loadAllowlistedEnv,
  RESEND_RECIPIENT_ALLOWLIST,
  runControlledResend,
} from "../scripts/a17-live-provider-probes.mjs";

const env = {
  RESEND_API_KEY: "re_0123456789abcdef",
  EMAIL_FROM: "acceptance@example.test",
  REPLY_TO_EMAIL: "reply@example.test",
  NEXT_PUBLIC_APP_URL: "https://app.example.test",
  REVIEW_BOOSTER_UNSUBSCRIBE_SECRET: "local-fixture-secret",
};

test("allowlisted env loader discards unrelated secrets and detects duplicate provider keys", () => {
  const source = join(process.cwd(), ".next", `a17-env-${process.pid}.tmp`);
  try {
    writeFileSync(source, "DATABASE_URL=postgres://secret/db\nRESEND_API_KEY=re_0123456789abcdef\nAUTH_SECRET='hidden-too'\n");
    const selected = loadAllowlistedEnv(source, new Set(["RESEND_API_KEY"]));
    assert.deepEqual(Object.keys(selected), ["RESEND_API_KEY"]);
    assert.equal(selected.RESEND_API_KEY, "re_0123456789abcdef");
    writeFileSync(source, "RESEND_API_KEY=re_one\nRESEND_API_KEY=re_two\n");
    assert.throws(() => loadAllowlistedEnv(source, new Set(["RESEND_API_KEY"])), /duplicate allowlisted key/);
  } finally { rmSync(source, { force: true }); }
});

test("controlled Resend send freezes one allowlisted recipient, payload hash and idempotency key", { timeout: 5_000 }, async () => {
  const root = join(process.cwd(), ".next", "a17-provider-evidence");
  const runId = "a1700000-0000-4000-8000-000000000001";
  const evidencePath = join(root, `resend-${runId}.json`);
  const claimPath = evidencePath + ".attempt-claim";
  rmSync(evidencePath, { force: true });
  rmSync(claimPath, { force: true });
  let calls = 0;
  let sent: { url: string; init: RequestInit } | undefined;
  try {
    const result = await runControlledResend({
      env, runId, stateRoot: root,
      fetcher: async (input, init) => {
        calls += 1;
        sent = { url: String(input), init: init! };
        return Response.json({ id: "re_test_message_123" }, { status: 200 });
      },
    });
    assert.equal(result.status, "provider-accepted", JSON.stringify(result));
    assert.equal(result.delivery, "unconfirmed", "provider acceptance does not claim recipient delivery");
    assert.equal(result.recipient, "joserubiobejarano@gmail.com");
    assert.equal(calls, 1);
    assert.equal(sent?.url, "https://api.resend.com/emails");
    const headers = new Headers(sent?.init.headers);
    assert.equal(headers.get("Idempotency-Key"), `a17-controlled-${runId}`);
    const body = JSON.parse(String(sent?.init.body));
    assert.equal(body.to, result.recipient);
    const state = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.equal(state.status, "accepted");
    assert.equal(state.payloadSha256, result.payloadSha256);
    assert.equal(state.idempotencyKey, `a17-controlled-${runId}`);
    assert.equal(state.providerMessageId, "re_test_message_123");
  } finally { rmSync(evidencePath, { force: true }); rmSync(claimPath, { force: true }); }
});

function writePreparedResendState(runId: string, evidencePath: string) {
  const recipient = "joserubiobejarano@gmail.com";
  const payload = {
    from: "Ornigami controlled test <acceptance@example.test>", to: recipient,
    subject: "Ornigami controlled Resend test", text: "fixture", html: "<p>fixture</p>",
    tags: [{ name: "ornigami_delivery_id", value: runId }],
  };
  const payloadSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  writeFileSync(evidencePath, JSON.stringify({
    schema: "ornigami.a17.resend-evidence.v1", runId, recipient,
    createdAt: new Date().toISOString(), payload, payloadSha256,
    idempotencyKey: "a17-controlled-" + runId, status: "prepared", attemptCount: 0,
  }) + "\n");
}

test("concurrent Resend invocations admit only one provider request for a run", { timeout: 5_000 }, async () => {
  const root = join(process.cwd(), ".next", "a17-provider-evidence");
  const runId = "a1700000-0000-4000-8000-000000000005";
  const evidencePath = join(root, "resend-" + runId + ".json");
  const claimPath = evidencePath + ".attempt-claim";
  rmSync(evidencePath, { force: true });
  rmSync(claimPath, { force: true });
  writePreparedResendState(runId, evidencePath);
  let calls = 0;
  let claimArrivals = 0;
  let releaseClaims!: () => void;
  const bothValidatedPreparedState = new Promise<void>((resolve) => { releaseClaims = resolve; });
  const beforeAttemptClaim = async () => {
    claimArrivals += 1;
    if (claimArrivals === 2) releaseClaims();
    await bothValidatedPreparedState;
  };
  const fetcher = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({ id: "re_concurrent_message" });
  };
  try {
    const results = await Promise.allSettled([
      runControlledResend({ env, runId, stateRoot: root, fetcher, beforeAttemptClaim }),
      runControlledResend({ env, runId, stateRoot: root, fetcher, beforeAttemptClaim }),
    ]);
    assert.equal(claimArrivals, 2, "both callers validated the same prepared state before either claim");
    assert.equal(calls, 1, "the same run cannot issue two provider requests");
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(readFileSync(claimPath, "utf8").includes(runId), true, "the permanent exclusive claim records the run");
  } finally { rmSync(evidencePath, { force: true }); rmSync(claimPath, { force: true }); }
});

test("an orphan or corrupt Resend attempt claim fails closed without provider I/O", async () => {
  const root = join(process.cwd(), ".next", "a17-provider-evidence");
  const runId = "a1700000-0000-4000-8000-000000000006";
  const evidencePath = join(root, "resend-" + runId + ".json");
  const claimPath = evidencePath + ".attempt-claim";
  rmSync(evidencePath, { force: true });
  rmSync(claimPath, { force: true });
  writePreparedResendState(runId, evidencePath);
  writeFileSync(claimPath, "interrupted-or-corrupt-claim\n");
  let calls = 0;
  try {
    await assert.rejects(runControlledResend({
      env, runId, stateRoot: root,
      fetcher: async () => { calls += 1; return Response.json({ id: "must-not-send" }); },
    }), /attempt claim already exists/);
    assert.equal(calls, 0);
    assert.equal(readFileSync(claimPath, "utf8"), "interrupted-or-corrupt-claim\n", "a stale claim is preserved for operator reconciliation");
  } finally { rmSync(evidencePath, { force: true }); rmSync(claimPath, { force: true }); }
});

test("controlled Resend rejects recipients outside the named allowlist without transport", async () => {
  let calls = 0;
  await assert.rejects(runControlledResend({
    env, runId: "a1700000-0000-4000-8000-000000000002", recipient: "customer@example.com",
    fetcher: async () => { calls += 1; return Response.json({ id: "bad" }); },
  }), /outside the controlled test mailbox allowlist/);
  assert.equal(calls, 0);
  assert.equal(RESEND_RECIPIENT_ALLOWLIST.size, 4);
});

test("ambiguous Resend result is recorded unknown and cannot be upgraded to delivery", async () => {
  const root = join(process.cwd(), ".next", "a17-provider-evidence");
  const runId = "a1700000-0000-4000-8000-000000000003";
  const evidencePath = join(root, `resend-${runId}.json`);
  const claimPath = evidencePath + ".attempt-claim";
  rmSync(evidencePath, { force: true });
  rmSync(claimPath, { force: true });
  let calls = 0;
  try {
    const result = await runControlledResend({
      env, runId, stateRoot: root,
      fetcher: async () => { calls += 1; throw new TypeError("network unavailable"); },
    });
    assert.deepEqual({ status: result.status, delivery: result.delivery }, { status: "unknown", delivery: "unconfirmed" });
    const state = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.equal(state.status, "unknown");
    assert.equal(state.failureClass, "unknown");
    await assert.rejects(runControlledResend({ env, runId, stateRoot: root, fetcher: async () => { calls += 1; return Response.json({ id: "should-not-send" }); } }), /no provider request made/);
    assert.equal(calls, 1, "an unknown outcome is never resent automatically");
  } finally { rmSync(evidencePath, { force: true }); rmSync(claimPath, { force: true }); }
});

test("Resend domain read probe is read-only, bounded to the configured sender domain, and refuses redirects", async () => {
  let calls = 0;
  const result = await checkResendSenderDomain({
    env,
    fetcher: async (input, init) => {
      calls += 1;
      assert.equal(String(input), "https://api.resend.com/domains?limit=100");
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "manual");
      return Response.json({ has_more: false, data: [{ name: "example.test", status: "verified", capabilities: { sending: "enabled" } }] });
    },
  });
  assert.equal(result.status, "verified-sending-enabled");
  assert.equal(calls, 1);
  const denied = await checkResendSenderDomain({ env, fetcher: async () => new Response(null, { status: 302, headers: { location: "https://attacker.test/" } }) });
  assert.equal(denied.status, "blocked-redirect-refused");
});

test("Resend sender-domain check follows bounded pagination before declaring absence", async () => {
  let calls = 0;
  const result = await checkResendSenderDomain({
    env,
    fetcher: async (input) => {
      calls += 1;
      const url = new URL(String(input));
      if (calls === 1) {
        assert.equal(url.searchParams.get("after"), null);
        return Response.json({ has_more: true, data: [{ id: "10000000-0000-4000-8000-000000000001", name: "first.example" }] });
      }
      assert.equal(url.searchParams.get("after"), "10000000-0000-4000-8000-000000000001");
      return Response.json({ has_more: false, data: [{ id: "10000000-0000-4000-8000-000000000002", name: "second.example" }] });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "sender-domain-not-listed");
  assert.equal(result.domainCount, 2);
  assert.equal(result.inventoryComplete, true);
});

test("Sentry read probe requires matching project identity and never follows redirects", async () => {
  let calls = 0;
  const verified = await checkSentryProject({
    env: { SENTRY_AUTH_TOKEN: "token-fixture", SENTRY_ORG: "ornigami", SENTRY_PROJECT: "web" },
    origin: "https://eu.sentry.io",
    fetcher: async (input, init) => {
      calls += 1;
      assert.match(String(input), /^https:\/\/eu\.sentry\.io\/api\/0\/projects\/ornigami\/web\/$/);
      assert.equal(init?.redirect, "manual");
      return Response.json({ slug: "web", organization: { slug: "ornigami" } });
    },
  });
  assert.equal(verified.status, "verified-project-read-access");
  const denied = await checkSentryProject({
    env: { SENTRY_AUTH_TOKEN: "token-fixture", SENTRY_ORG: "ornigami", SENTRY_PROJECT: "web" },
    fetcher: async () => { calls += 1; return new Response(null, { status: 302, headers: { location: "https://attacker.test/" } }); },
  });
  assert.equal(denied.status, "blocked-redirect-refused");
  assert.equal(calls, 2);
  assert.equal((await checkSentryProject({ env: {} })).status, "blocked-missing-configuration");
});
