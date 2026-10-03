import assert from "node:assert/strict";
import test from "node:test";
import { inspectSentryWorkflows, parseConfig, readBackSentryEvent, sendAndVerifySentryProbe, verifySentryProject } from "../scripts/a12-sentry-delivery-probe.mjs";

const config = {
  dsn: "https://public-key@o123.ingest.eu.sentry.io/456",
  publicKey: "public-key",
  projectId: "456",
  token: "read-token",
  org: "example-org",
  project: "example-project",
  apiOrigin: "https://eu.sentry.io",
};

test("Sentry probe event is fixed, stripped, uniquely tagged, and verified by API readback", async () => {
  let postBody = "";
  let reads = 0;
  const result = await sendAndVerifySentryProbe(config, {
    now: () => new Date("2026-10-03T16:00:00.000Z"),
    fetcher: async (url, init) => {
      assert.ok(init);
      if (init.method === "POST") {
        assert.equal(typeof init.body, "string");
        postBody = String(init.body);
        assert.equal(new URL(String(url)).hostname, "o123.ingest.eu.sentry.io");
        return new Response(null, { status: 200 });
      }
      reads += 1;
      const id = new URL(String(url)).pathname.split("/").at(-2);
      if (reads === 1) return new Response(null, { status: 404 });
      const envelopeEvent = JSON.parse(postBody.split("\n")[2]);
      return Response.json({
        eventID: id,
        message: envelopeEvent.message,
        tags: Object.entries(envelopeEvent.tags).map(([key, value]) => ({ key, value })),
      });
    },
  });
  assert.equal(result.status, "ingested_and_read_back");
  assert.equal(result.ingestStatus, 200);
  assert.ok("readbackStatus" in result);
  assert.equal(result.readbackStatus, 200);
  assert.equal(reads, 2);
  const envelope = postBody.split("\n");
  const event = JSON.parse(envelope[2]);
  assert.match(event.event_id, /^[0-9a-f]{32}$/);
  assert.deepEqual(Object.keys(event).sort(), ["event_id", "level", "logger", "message", "platform", "tags", "timestamp"].sort());
  assert.deepEqual(event.tags, { subsystem: "cron", job: "privacy_retention", reason: "controlled_smoke", probe_id: event.event_id });
  assert.equal(event.message, "A12 controlled Sentry transport probe");
  assert.doesNotMatch(postBody, /email|cookie|request|user|customer|private|secret/i);
});

test("Sentry event readback can be retried without resending the event", async () => {
  let requestCount = 0;
  const result = await readBackSentryEvent(config, "a".repeat(32), {
    retries: 1,
    retryDelayMs: 0,
    fetcher: async () => {
      requestCount += 1;
      return new Response(null, { status: requestCount === 1 ? 404 : 403 });
    },
  });
  assert.equal(result.status, "ingested_readback_unavailable");
  assert.equal(result.readbackStatus, 403);
  assert.equal(requestCount, 2);
});

test("Sentry project preflight verifies DSN numeric ID and exact slugs", async () => {
  const matched = await verifySentryProject(config, { fetcher: async () => Response.json({ id: "456", slug: config.project, organization: { slug: config.org } }) });
  assert.equal(matched.status, "project_identity_verified");
  const mismatch = await verifySentryProject(config, { fetcher: async () => Response.json({ id: "999", slug: config.project, organization: { slug: config.org } }) });
  assert.equal(mismatch.status, "project_identity_mismatch");
});

test("Sentry workflow inspection summarizes routing without exposing recipient identifiers", async () => {
  let requests = 0;
  const result = await inspectSentryWorkflows(config, { fetcher: async (url) => {
    requests += 1;
    const target = new URL(String(url));
    if (target.pathname === "/api/0/projects/example-org/example-project/") {
      return Response.json({ id: "456", slug: config.project, organization: { slug: config.org } });
    }
    assert.equal(target.pathname, "/api/0/organizations/example-org/workflows/");
    assert.equal(target.searchParams.get("project"), "456");
    assert.equal(target.searchParams.get("per_page"), "100");
    if (requests === 2) {
      return Response.json([{ enabled: true, lastTriggered: "2026-10-03T16:22:25.000Z", actionFilters: [{ actions: [{ type: "email", status: "active", config: { targetType: "team", targetIdentifier: "private-recipient-id" } }] }] }], {
        headers: { link: '<https://eu.sentry.io/api/0/organizations/example-org/workflows/?cursor=cursor-value>; rel="next"; results="true"; cursor="cursor-value"' },
      });
    }
    assert.equal(target.searchParams.get("cursor"), "cursor-value");
    return Response.json([{ enabled: false, lastTriggered: null, actionFilters: [{ actions: [{ type: "slack", status: "disabled", config: { targetType: "integration", targetIdentifier: "private-integration-id" } }] }] }]);
  } });
  assert.equal(requests, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    status: "workflows_read",
    workflowCount: 2,
    enabledCount: 1,
    disabledCount: 1,
    actionTypeCounts: { email: 1, slack: 1 },
    actionStatusCounts: { active: 1, disabled: 1 },
    routingTargetTypeCounts: { team: 1, integration: 1 },
    lastTriggeredDates: ["2026-10-03T16:22:25.000Z"],
    pagesRead: 2,
    completeInventory: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /private-recipient-id|private-integration-id/);
});

test("Sentry DSN parser validates allowed regional hosts and rejects unexpected hosts", () => {
  const parsed = parseConfig({ NEXT_PUBLIC_SENTRY_DSN: config.dsn, SENTRY_AUTH_TOKEN: config.token, SENTRY_ORG: config.org, SENTRY_PROJECT: config.project });
  assert.equal(parsed.apiOrigin, "https://eu.sentry.io");
  assert.throws(() => parseConfig({
    NEXT_PUBLIC_SENTRY_DSN: "https://key@attacker.test/456",
    SENTRY_AUTH_TOKEN: config.token,
    SENTRY_ORG: config.org,
    SENTRY_PROJECT: config.project,
  }), /sentry_probe_configuration_invalid/);
});

test("Sentry probe refuses redirects and does not expose provider response text", async () => {
  await assert.rejects(() => sendAndVerifySentryProbe(config, {
    fetcher: async () => new Response("secret redirect payload", { status: 302, headers: { location: "https://elsewhere.test" } }),
  }), /sentry_ingest_redirect_refused/);
  await assert.rejects(() => verifySentryProject(config, {
    fetcher: async () => new Response("private payload", { status: 200 }),
  }), /sentry_response_invalid/);
  await assert.rejects(() => verifySentryProject(config, {
    fetcher: async () => new Response("x".repeat(65_000), { status: 200 }),
  }), /sentry_response_too_large/);
});
