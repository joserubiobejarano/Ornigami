import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  A10_LIVE_MAX_SENDS,
  adaptA20LiveAppFixture,
  adaptA20LivePreload,
  createA10ResendFetchGuard,
  inspectA10ResendRequest,
  secureA10PrivateDirectory,
  stageA10LiveAdapters,
} from "../scripts/a10-live-resend-guards.mjs";

const SENDER = "acceptance@reviews.ornigami.com";
const API_KEY = `re_${"x".repeat(32)}`;
const OWNED_RECIPIENT = "controlled@example.test";
const DELIVERY_1 = "a1000000-0000-4000-8000-000000000001";
const DELIVERY_2 = "a1000000-0000-4000-8000-000000000002";
const ATTEMPT_1 = "a1000000-0000-4000-8000-000000000011";
const ATTEMPT_2 = "a1000000-0000-4000-8000-000000000012";

function request({ recipient = OWNED_RECIPIENT, deliveryId = DELIVERY_1, attemptId = ATTEMPT_1, sender = SENDER, apiKey = API_KEY, path = "/emails", method = "POST", extra = {} } = {}) {
  const url = `https://api.resend.com${path}`;
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "idempotency-key": `ornigami-booster-${attemptId}`,
  });
  const payload = {
    from: `"A10 Synthetic Studio" <${sender}>`,
    to: recipient,
    subject: "A10 controlled acceptance",
    text: "Synthetic test message.",
    tags: [{ name: "ornigami_delivery_id", value: deliveryId }],
    ...extra,
  };
  return { url, init: { method, headers, body: JSON.stringify(payload) } };
}

async function withRoot(callback: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "a10-live-resend-"));
  try { await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("only an exact bounded Resend request to one owned inbox or the bounce fixture is valid", () => {
  const allowed = request();
  const result = inspectA10ResendRequest(allowed.url, allowed.init, { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT });
  assert.equal(result.deliveryId, DELIVERY_1);
  assert.equal(result.recipientLabel, "owned-test-inbox");
  assert.ok(!JSON.stringify(result).includes(OWNED_RECIPIENT));

  const bounce = request({ recipient: "bounced@resend.dev", deliveryId: DELIVERY_2, attemptId: ATTEMPT_2 });
  assert.equal(inspectA10ResendRequest(bounce.url, bounce.init, { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT }).recipientLabel, "resend-bounce-test");
  assert.throws(() => inspectA10ResendRequest(request({ recipient: "another@example.test" }).url, request({ recipient: "another@example.test" }).init,
    { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT }), /controlled test addresses/);
});

test("outbound guard rejects other hosts, methods, sender, credentials, tags, fanout and redirects", () => {
  const cases = [
    request({ path: "/webhooks" }),
    request({ path: "/emails?redirect=https://bad.test" }),
    request({ method: "GET" }),
    request({ sender: "spoof@example.test" }),
    request({ apiKey: "re_wrong_key" }),
    request({ extra: { cc: "other@example.test" } }),
    request({ extra: { bcc: [OWNED_RECIPIENT] } }),
    request({ extra: { tags: [{ name: "other", value: DELIVERY_1 }] } }),
    request({ attemptId: "not-a-uuid" }),
  ];
  for (const item of cases) assert.throws(() => inspectA10ResendRequest(item.url, item.init, { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT }));
  assert.throws(() => inspectA10ResendRequest("https://evil.example/emails", request().init, { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT }));
  const overCap = request();
  assert.throws(() => inspectA10ResendRequest(overCap.url, overCap.init, { sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT, maxSends: 3 }), /send cap/);
  assert.equal(A10_LIVE_MAX_SENDS, 2);
});

test("durable guard allows scoped Resend DNS/TLS only inside a validated fetch and forces manual redirects", async () => {
  await withRoot(async (workspaceRoot) => {
    const stateRoot = join(workspaceRoot, ".env.a10-live-resend");
    await secureA10PrivateDirectory(stateRoot);
    const stateDir = join(stateRoot, "provider-attempts");
    const guard = createA10ResendFetchGuard({ sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT, stateDir, workspaceRoot });
    assert.equal(guard.permitsNetwork({ host: "api.resend.com", port: 443 }), false);
    assert.equal(guard.permitsDns("api.resend.com"), false);
    const item = request();
    let calls = 0;
    const response = await guard.fetch(item.url, item.init, async (_input, init) => {
      calls += 1;
      assert.equal(init?.redirect, "manual");
      assert.equal(guard.permitsNetwork({ host: "api.resend.com", port: 443 }), true);
      assert.equal(guard.permitsDns("api.resend.com"), true);
      assert.equal(guard.permitsNetwork({ host: "api.stripe.com", port: 443 }), false);
      assert.equal(guard.permitsNetwork({ host: "api.resend.com", port: 80 }), false);
      return new Response(JSON.stringify({ id: "re_test_message" }), { status: 200 });
    });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(guard.permitsNetwork({ host: "api.resend.com", port: 443 }), false);
    const entries = await readdir(stateDir);
    assert.deepEqual(entries.sort(), ["attempt-1.json"]);
    const receipt = await readFile(join(stateDir, entries[0]!), "utf8");
    const attemptReceipt = JSON.parse(receipt);
    assert.equal(attemptReceipt.recipientLabel, "owned-test-inbox");
    assert.equal(attemptReceipt.status, "accepted");
    assert.equal(attemptReceipt.providerMessageId, "re_test_message");
    assert.ok(!receipt.includes(OWNED_RECIPIENT));
    assert.ok(!receipt.includes(API_KEY));
    await assert.rejects(guard.fetch(item.url, item.init, async () => { calls += 1; return new Response("duplicate"); }), /already has a durable provider attempt/);
    assert.equal(calls, 1);
  });
});

test("attempt ledger caps two unique delivery IDs across process restarts and preserves uncertain attempts", async () => {
  await withRoot(async (workspaceRoot) => {
    const stateRoot = join(workspaceRoot, ".env.a10-live-resend");
    await secureA10PrivateDirectory(stateRoot);
    const stateDir = join(stateRoot, "provider-attempts");
    const first = createA10ResendFetchGuard({ sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT, stateDir, workspaceRoot });
    const one = request();
    await assert.rejects(first.fetch(one.url, one.init, async () => { throw new TypeError("synthetic network fault"); }), /synthetic network fault/);
    const second = request({ recipient: "bounced@resend.dev", deliveryId: DELIVERY_2, attemptId: ATTEMPT_2 });
    const afterRestart = createA10ResendFetchGuard({ sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT, stateDir, workspaceRoot });
    await afterRestart.fetch(second.url, second.init, async () => new Response("ok", { status: 200 }));
    const firstAttempt = JSON.parse(await readFile(join(stateDir, "attempt-1.json"), "utf8"));
    const secondAttempt = JSON.parse(await readFile(join(stateDir, "attempt-2.json"), "utf8"));
    assert.equal(firstAttempt.status, "unknown");
    assert.equal(firstAttempt.outcome, "network_error");
    assert.equal(secondAttempt.status, "unknown");
    const third = request({ deliveryId: "a1000000-0000-4000-8000-000000000003", attemptId: "a1000000-0000-4000-8000-000000000013" });
    await assert.rejects(afterRestart.fetch(third.url, third.init, async () => new Response("must not send")), /send cap/);
    assert.equal((await readdir(stateDir)).filter((name) => name.endsWith(".json")).length, 2);
  });
});

test("attempt ledger rejects reuse of an application-format idempotency key for another delivery", async () => {
  await withRoot(async (workspaceRoot) => {
    const stateRoot = join(workspaceRoot, ".env.a10-live-resend");
    await secureA10PrivateDirectory(stateRoot);
    const stateDir = join(stateRoot, "provider-attempts");
    const guard = createA10ResendFetchGuard({ sender: SENDER, apiKey: API_KEY, ownedRecipient: OWNED_RECIPIENT, stateDir, workspaceRoot });
    const first = request();
    let calls = 0;
    await guard.fetch(first.url, first.init, async () => { calls += 1; return new Response(JSON.stringify({ id: "re_test_message" }), { status: 200 }); });
    const reused = request({ recipient: "bounced@resend.dev", deliveryId: DELIVERY_2 });
    await assert.rejects(guard.fetch(reused.url, reused.init, async () => { calls += 1; return new Response("unexpected"); }), /idempotency key already has/);
    assert.equal(calls, 1);
  });
});

test("A20 adapters are exact-fragment copies with private task-only runtime secrets and no OpenAI key", async () => {
  const workspaceRoot = process.cwd();
  const appSource = await readFile(join(workspaceRoot, "scripts", "a20-app-fixture.mjs"), "utf8");
  const preloadSource = await readFile(join(workspaceRoot, "scripts", "a20-preload.mjs"), "utf8");
  const adaptedApp = adaptA20LiveAppFixture(appSource, { workspaceRoot });
  const adaptedPreload = adaptA20LivePreload(preloadSource, { workspaceRoot, moduleUrl: "file:///C:/work/.a20-fixture/a10-live/a10-preload.mjs" });
  assert.equal((adaptedApp.match(/a10-preload\.mjs/g) || []).length, 2);
  assert.match(adaptedApp, /A10_LIVE_OWNED_RECIPIENT/);
  assert.match(adaptedApp, /Object\.entries\(env\)\.filter/);
  assert.doesNotMatch(adaptedApp, /OPENAI_API_KEY/);
  assert.match(adaptedPreload, /a10ResendGuard\.permitsDns\(host\)/);
  assert.match(adaptedPreload, /createA10ResendFetchGuard/);
  assert.match(adaptedPreload, /api\.resend\.com/);
  assert.doesNotMatch(adaptedPreload, /api\.stripe\.com/);
  assert.throws(() => adaptA20LiveAppFixture(appSource.replace("a20-local-only-token-encryption-key-never-valid", "drift"), { workspaceRoot }));
});

test("adapter staging writes only task copies below the secured ignored fixture", async () => {
  await withRoot(async (workspaceRoot) => {
    const sourceRoot = process.cwd();
    const sourceHashBefore = createHash("sha256").update(await readFile(join(sourceRoot, "scripts", "a20-app-fixture.mjs"))).digest("hex");
    const staged = await stageA10LiveAdapters({ workspaceRoot, sourceRoot });
    assert.equal(staged.fixtureRoot, join(workspaceRoot, ".a20-fixture"));
    assert.ok((await readFile(staged.appPath, "utf8")).includes("A10_TASK_AUTH_SECRET"));
    assert.ok((await readFile(staged.preloadPath, "utf8")).includes("createA10ResendFetchGuard"));
    assert.equal(createHash("sha256").update(await readFile(join(sourceRoot, "scripts", "a20-app-fixture.mjs"))).digest("hex"), sourceHashBefore);
  });
});
