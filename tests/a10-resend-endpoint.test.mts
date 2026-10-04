import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, symlink, chmod } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { A10_RESEND_EVENTS, createA10Endpoint, getDryRunReport, parseArgs, validateEndpointUrl } from "../scripts/a10-resend-endpoint.mjs";
import { checkPrivateArtifact } from "../scripts/a12-support-access-verify.mjs";

const VALID_ENDPOINT = "https://acceptance.example.net/api/webhooks/resend";
const API_KEY = `re_${"k".repeat(32)}`;
const WEBHOOK_ID = "4dd369bc-aa82-4ff3-97de-514ae3000ee0";
const SIGNING_SECRET = `whsec_${Buffer.alloc(24, 7).toString("base64")}`;

async function withState(callback: (stateDir: string) => Promise<void>) {
  const stateDir = await mkdtemp(join(tmpdir(), "a10-resend-endpoint-"));
  try { await callback(stateDir); }
  finally { await rm(stateDir, { recursive: true, force: true }); }
}

function successResponse(body = { id: WEBHOOK_ID, signing_secret: SIGNING_SECRET }) {
  return new Response(JSON.stringify(body), { status: 201, headers: { "content-type": "application/json" } });
}

test("dry-run reports the exact seven events and does not create endpoint state", async () => {
  assert.deepEqual(getDryRunReport().events, A10_RESEND_EVENTS);
  const report = getDryRunReport();
  assert.ok("createsEndpoint" in report);
  assert.equal(report.createsEndpoint, false);
  assert.equal(getDryRunReport(VALID_ENDPOINT).validTarget, true);
  assert.equal(getDryRunReport("https://ornigami.com/api/webhooks/resend").validTarget, false);
});

test("CLI refuses duplicate flags and missing endpoint values", () => {
  assert.throws(() => parseArgs(["--create", "--create"]));
  assert.throws(() => parseArgs(["--endpoint"]));
  assert.throws(() => parseArgs(["--endpoint", VALID_ENDPOINT, "--endpoint", VALID_ENDPOINT]));
});

test("endpoint URL guard rejects production, non-HTTPS, nested paths, loopback, and private IPs", () => {
  for (const value of [
    "https://ornigami.com/api/webhooks/resend",
    "https://ornigami.com./api/webhooks/resend",
    "https://api.ornigami.com/api/webhooks/resend",
    "https://ornigami.vercel.app/api/webhooks/resend",
    "https://locallift-indol.vercel.app/api/webhooks/resend",
    "https://locallift-jose-rubios-projects-acf385c1.vercel.app/api/webhooks/resend",
    "https://locallift-git-main-jose-rubios-projects-acf385c1.vercel.app./api/webhooks/resend",
    "http://acceptance.example.net/api/webhooks/resend",
    "https://acceptance.example.net/nested/api/webhooks/resend",
    "https://acceptance.example.net/api/webhooks/resend/",
    "https://localhost/api/webhooks/resend",
    "https://127.0.0.1/api/webhooks/resend",
    "https://10.4.5.6/api/webhooks/resend",
    "https://[::1]/api/webhooks/resend",
    "https://[::ffff:7f00:1]/api/webhooks/resend",
    "https://8.8.8.8/api/webhooks/resend",
  ]) assert.throws(() => validateEndpointUrl(value));
  assert.equal(validateEndpointUrl(VALID_ENDPOINT).hostname, "acceptance.example.net");
});

test("missing guards fail before directory or network mutation", async () => {
  await withState(async (unusedDir) => {
    const stateDir = join(unusedDir, "not-created");
    let calls = 0;
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: undefined, isolatedTarget: true, stateDir, fetcher: async () => { calls += 1; throw new Error("must not fetch"); } }), /A10_RESEND_API_KEY/);
    assert.equal(calls, 0);
    await assert.rejects(readdir(stateDir));
  });
  let calls = 0;
  await assert.rejects(createA10Endpoint({ endpoint: "http://127.0.0.1/api/webhooks/resend", apiKey: API_KEY, isolatedTarget: true, stateDir: join(tmpdir(), "never-written-a10"), fetcher: async () => { calls += 1; throw new Error("must not fetch"); } }));
  assert.equal(calls, 0);
  await withState(async (unusedDir) => {
    const stateDir = join(unusedDir, "not-created");
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: false, stateDir, fetcher: async () => { calls += 1; throw new Error("must not fetch"); } }), /isolated-target acknowledgement/);
    assert.equal(calls, 0);
    await assert.rejects(readdir(stateDir));
  });
});

test("mocked provider success stores only sanitized receipt and endpoint secret locally", async () => {
  await withState(async (stateDir) => {
    const calls: Array<{ url: string | URL; options: RequestInit }> = [];
    const result = await createA10Endpoint({
      endpoint: VALID_ENDPOINT,
      apiKey: API_KEY,
      isolatedTarget: true,
      stateDir,
      now: () => new Date("2026-10-04T10:00:00.000Z"),
      fetcher: async (url, options) => {
        calls.push({ url: url as string | URL, options: options as RequestInit });
        return successResponse();
      },
    });
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.url, "https://api.resend.com/webhooks");
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.redirect, "manual");
    assert.deepEqual(JSON.parse(String(call.options.body)), { endpoint: VALID_ENDPOINT, events: A10_RESEND_EVENTS });
    assert.equal(result.webhookId, WEBHOOK_ID);
    assert.equal(result.secretStoredLocally, true);
    assert.equal(result.targetSecretInstalled, false);
    const receipt = await readFile(join(stateDir, "attempt.json"), "utf8");
    assert.equal(JSON.parse(receipt).status, "created");
    assert.equal(JSON.parse(receipt).secretStoredLocally, true);
    assert.equal(JSON.parse(receipt).targetSecretInstalled, false);
    assert.ok(!receipt.includes(SIGNING_SECRET));
    assert.ok(!receipt.includes(API_KEY));
    assert.equal(await readFile(join(stateDir, "webhook-secret.env"), "utf8"), `RESEND_WEBHOOK_SECRET=${SIGNING_SECRET}\n`);
    assert.equal((await checkPrivateArtifact(join(stateDir, "webhook-secret.env"))).status, "private_artifact_verified");
  });
});

test("a redirected state directory fails before provider mutation or secret storage", async () => {
  await withState(async (stateDir) => {
    const alias = join(stateDir, "redirected");
    await symlink(stateDir, alias, process.platform === "win32" ? "junction" : "dir");
    let calls = 0;
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true,
      stateDir: alias, fetcher: async () => { calls += 1; return successResponse(); } }), /real task-owned directory/);
    assert.equal(calls, 0);
    await assert.rejects(readFile(join(stateDir, "attempt.json")));
    await assert.rejects(readFile(join(stateDir, "webhook-secret.env")));
  });
});

test("broad state-directory access is secured or rejected before signing-secret exposure", async () => {
  await withState(async (stateDir) => {
    if (process.platform !== "win32") {
      await chmod(stateDir, 0o755);
      await createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true,
        stateDir, fetcher: async () => successResponse() });
      assert.equal((await checkPrivateArtifact(join(stateDir, "webhook-secret.env"))).access, "owner_only");
      return;
    }
    execFileSync("icacls.exe", [stateDir, "/grant", "*S-1-1-0:(OI)(CI)F"], { stdio: "ignore", windowsHide: true });
    let calls = 0;
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true,
      stateDir, fetcher: async () => { calls += 1; return successResponse(); } }), /not private/);
    assert.equal(calls, 0);
    await assert.rejects(readFile(join(stateDir, "attempt.json")));
    await assert.rejects(readFile(join(stateDir, "webhook-secret.env")));
  });
});

test("ambiguous failure retains an intent and refuses any repeat create without leaking provider error", async () => {
  await withState(async (stateDir) => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      throw new Error(`socket failed with body ${SIGNING_SECRET}`);
    };
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true, stateDir, fetcher }), (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /outcome is unknown/);
      assert.ok(!error.message.includes(SIGNING_SECRET));
      return true;
    });
    assert.equal(JSON.parse(await readFile(join(stateDir, "attempt.json"), "utf8")).status, "attempt_started");
    assert.equal(calls, 1);
    await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true, stateDir, fetcher }), /attempt already exists/);
    assert.equal(calls, 1);
    await assert.rejects(readFile(join(stateDir, "webhook-secret.env")));
  });
});

test("malformed success response and redirects are bounded, sanitized, and non-repeatable", async () => {
  for (const fetcher of [
    async () => successResponse({ id: WEBHOOK_ID, signing_secret: "whsec_short" }),
    async () => new Response("provider secret body", { status: 302, headers: { location: "https://evil.example" } }),
  ]) {
    await withState(async (stateDir) => {
      await assert.rejects(createA10Endpoint({ endpoint: VALID_ENDPOINT, apiKey: API_KEY, isolatedTarget: true, stateDir, fetcher }), (error) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("provider secret body"));
        assert.ok(!error.message.includes("whsec_short"));
        return true;
      });
      assert.ok(await readFile(join(stateDir, "attempt.json"), "utf8"));
      await assert.rejects(readFile(join(stateDir, "webhook-secret.env")));
    });
  }
});

test("provider response body deadline is enforced and leaves a durable ambiguity record", async () => {
  await withState(async (stateDir) => {
    const stalledBody = new ReadableStream({ pull() { return new Promise(() => {}); } });
    await assert.rejects(createA10Endpoint({
      endpoint: VALID_ENDPOINT,
      apiKey: API_KEY,
      isolatedTarget: true,
      stateDir,
      requestTimeoutMs: 20,
      fetcher: async () => new Response(stalledBody, { status: 201 }),
    }), /response could not be safely validated/);
    assert.equal(JSON.parse(await readFile(join(stateDir, "attempt.json"), "utf8")).status, "attempt_started");
  });
});

test("oversized response body cancels without waiting on a stalled cancellation", async () => {
  await withState(async (stateDir) => {
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(17 * 1024)); },
      cancel() { return new Promise<void>(() => {}); },
    });
    await assert.rejects(createA10Endpoint({
      endpoint: VALID_ENDPOINT,
      apiKey: API_KEY,
      isolatedTarget: true,
      stateDir,
      requestTimeoutMs: 20,
      fetcher: async () => new Response(oversized, { status: 201 }),
    }), /response could not be safely validated/);
    assert.equal(JSON.parse(await readFile(join(stateDir, "attempt.json"), "utf8")).status, "attempt_started");
  });
});
