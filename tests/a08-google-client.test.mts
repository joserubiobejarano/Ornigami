import assert from "node:assert/strict";
import test from "node:test";

import {
  createGoogleClient,
  decodeGoogleTokenRow,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "../src/lib/google.ts";
import { createGoogleLocationDiscovery } from "../src/lib/google-discovery.ts";
import {
  googleAccountName,
  googleInformationName,
  googleReviewName,
  googleReviewReplyUrl,
  googleReviewsUrl,
  parseGoogleLocationName,
} from "../src/lib/google-resources.ts";
import { decryptToken, encryptToken } from "../src/lib/encrypted-token.ts";

type TestTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope?: string | null;
  connection_version: string;
  stored_access_token: string;
  stored_refresh_token: string;
};

const futureExpiry = () => new Date(Date.now() + 5 * 60_000).toISOString();
const pastExpiry = () => new Date(Date.now() - 1_000).toISOString();
const token = (overrides: Partial<TestTokens> = {}): TestTokens => ({
  access_token: "access-old",
  refresh_token: "refresh-stays",
  expires_at: futureExpiry(),
  scope: "business.manage",
  connection_version: "generation-1",
  stored_access_token: "cipher-access-old",
  stored_refresh_token: "cipher-refresh-stays",
  ...overrides,
});

function makeClient(options: {
  initial?: TestTokens | null;
  refresh?: (refreshToken: string) => Promise<{ access_token: string; expires_in: number; token_type: string; refresh_token?: string; scope?: string }>;
  fetcher?: typeof fetch;
  save?: (userId: string, value: TestTokens) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeout?: number;
} = {}) {
  let current = options.initial === undefined ? token() : options.initial;
  const saves: TestTokens[] = [];
  const refresh = options.refresh ?? (async () => ({ access_token: "access-new", expires_in: 3600, token_type: "Bearer" }));
  const client = createGoogleClient({
    getTokens: async () => current,
    saveTokens: async (_userId, value) => {
      current = value;
      saves.push(value);
      await options.save?.(_userId, value);
    },
    refresh,
    fetcher: options.fetcher ?? (async () => Response.json({ ok: true })),
    now: options.now ?? Date.now,
    sleep: options.sleep ?? (async () => {}),
    requestTimeoutMs: options.timeout ?? 1000,
  });
  return { ...client, saves, get current() { return current; } };
}

test("Google resource helpers preserve structural slashes and reject unsafe path segments", () => {
  assert.equal(googleAccountName("A_2-x"), "accounts/A_2-x");
  assert.equal(googleInformationName("L-2_x"), "locations/L-2_x");
  assert.deepEqual(parseGoogleLocationName("accounts/A/locations/L_1"), {
    accountName: "accounts/A",
    accountId: "A",
    informationName: "locations/L_1",
    locationId: "L_1",
    locationName: "accounts/A/locations/L_1",
  });
  assert.throws(() => parseGoogleLocationName("accounts/A%2Fbad/locations/L"), /resource name/);
  assert.throws(() => googleReviewName("accounts/A", "L", "../escape"), /review ID/);
  assert.equal(googleReviewsUrl("accounts/A", "L_1", { pageSize: 100 }), "https://mybusiness.googleapis.com/v4/accounts/A/locations/L_1/reviews?pageSize=100");
  assert.equal(googleReviewReplyUrl("accounts/A", "L_1", "R-1"), "https://mybusiness.googleapis.com/v4/accounts/A/locations/L_1/reviews/R-1/reply");
});

test("encrypted credentials decrypt and legacy credentials upgrade through the production token decoder", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-google-token-encryption-key";
  const row = {
    access_token: encryptToken("access-secret"),
    refresh_token: encryptToken("refresh-secret"),
    expires_at: futureExpiry(),
    scope: "business.manage",
    connection_version: "generation-1",
    stored_access_token: encryptToken("access-secret"),
    stored_refresh_token: encryptToken("refresh-secret"),
  };
  const decoded = await decodeGoogleTokenRow("owner-1", row, async () => assert.fail("encrypted tokens need no upgrade"));
  assert.equal(decoded.access_token, "access-secret");
  assert.equal(decoded.refresh_token, "refresh-secret");

  let persisted: { accessToken: string; refreshToken: string } | undefined;
  const legacy = await decodeGoogleTokenRow("owner-1", {
    ...row,
    access_token: "legacy-access",
    refresh_token: "legacy-refresh",
  }, async (input) => { persisted = input; });
  assert.equal(legacy.access_token, "legacy-access");
  assert.equal(persisted?.accessToken, "legacy-access");
  assert.equal(persisted?.refreshToken, "legacy-refresh");
  const encryptedAgain = { access: encryptToken(persisted!.accessToken), refresh: encryptToken(persisted!.refreshToken) };
  assert.deepEqual(decryptToken(encryptedAgain.access), { value: "legacy-access", legacy: false });
  assert.deepEqual(decryptToken(encryptedAgain.refresh), { value: "legacy-refresh", legacy: false });
});

test("googleFetch receives decrypted bearer material and refreshed credentials persist encrypted", async () => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-google-token-encryption-key";
  let stored: TestTokens = {
    access_token: encryptToken("access-before"),
    refresh_token: encryptToken("refresh-before"),
    expires_at: pastExpiry(),
    scope: "business.manage",
    connection_version: "generation-1",
    stored_access_token: encryptToken("access-before"),
    stored_refresh_token: encryptToken("refresh-before"),
  };
  let sentAuthorization = "";
  const client = createGoogleClient({
    getTokens: async () => decodeGoogleTokenRow("owner-1", stored, async (input) => {
      stored = { access_token: encryptToken(input.accessToken), refresh_token: encryptToken(input.refreshToken), expires_at: input.expiresAt, scope: input.scope, connection_version: input.expectedConnectionVersion, stored_access_token: encryptToken(input.accessToken), stored_refresh_token: encryptToken(input.refreshToken) };
    }),
    saveTokens: async (_owner, tokens) => {
      stored = { access_token: encryptToken(tokens.access_token), refresh_token: encryptToken(tokens.refresh_token), expires_at: tokens.expires_at, scope: tokens.scope ?? null, connection_version: tokens.connection_version, stored_access_token: encryptToken(tokens.access_token), stored_refresh_token: encryptToken(tokens.refresh_token) };
    },
    refresh: async (refreshToken) => {
      assert.equal(refreshToken, "refresh-before");
      return { access_token: "access-after", expires_in: 3600, token_type: "Bearer" };
    },
    fetcher: async (_url, init) => {
      sentAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ ok: true });
    },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  await client.googleFetch("owner-1", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  assert.equal(sentAuthorization, "Bearer access-after");
  assert.notEqual(stored.access_token, "access-after");
  assert.notEqual(stored.refresh_token, "refresh-before");
  assert.equal(decryptToken(stored.access_token).value, "access-after");
  assert.equal(decryptToken(stored.refresh_token).value, "refresh-before");
});

test("token endpoints validate responses and never expose provider response bodies", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example";

  globalThis.fetch = async () => Response.json({ access_token: "a", expires_in: 3600, token_type: "Bearer", refresh_token: "r" });
  const exchanged = await exchangeCodeForTokens("code-value");
  assert.equal(exchanged.refresh_token, "r");

  globalThis.fetch = async () => Response.json({ access_token: "a2", expires_in: 3600, token_type: "Bearer" });
  const refreshed = await refreshAccessToken("r");
  assert.equal(refreshed.refresh_token, undefined);

  globalThis.fetch = async () => Response.json({ access_token: null, expires_in: "later", token_type: "Basic", secret: "provider-body-secret" });
  await assert.rejects(exchangeCodeForTokens("code"), (error: Error) => {
    assert.match(error.message, /invalid token response/);
    assert.doesNotMatch(error.message, /provider-body-secret|client-secret/);
    return true;
  });
  globalThis.fetch = async () => new Response("provider-body-secret", { status: 500 });
  await assert.rejects(refreshAccessToken("r"), (error: Error) => {
    assert.match(error.message, /500/);
    assert.doesNotMatch(error.message, /provider-body-secret/);
    return true;
  });
});

test("expired token refresh preserves omitted refresh token and coalesces per owner", async () => {
  let calls = 0;
  const stale = token({ expires_at: pastExpiry() });
  const client = makeClient({
    initial: stale,
    refresh: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { access_token: "access-rotated", expires_in: 3600, token_type: "Bearer" };
    },
  });
  const [one, two] = await Promise.all([
    client.googleFetch("owner-1", "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"),
    client.googleFetch("owner-1", "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"),
  ]);
  assert.equal(one.status, 200);
  assert.equal(two.status, 200);
  assert.equal(calls, 1);
  assert.equal(client.current?.refresh_token, "refresh-stays");
  assert.equal(client.saves.length, 1);
});

test("expired tokens and invalid token payloads fail without attempting Google API access", async () => {
  const client = makeClient({
    initial: token({ expires_at: pastExpiry() }),
    refresh: async () => ({ access_token: "", expires_in: 0, token_type: "Basic" }),
  });
  await assert.rejects(client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews"), /invalid token response/);

  const disconnected = createGoogleClient({
    getTokens: async () => null,
    saveTokens: async () => {},
    refresh: async () => assert.fail("no refresh should occur"),
    fetcher: async () => assert.fail("no API call should occur"),
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  await assert.rejects(disconnected.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews"), /No Google connection/);
});

test("a 401 refresh reuses a newer token already saved by another worker", async () => {
  let stored = token();
  let refreshCalls = 0;
  let apiCalls = 0;
  let retryAuthorization: string | null = null;
  const client = createGoogleClient({
    getTokens: async () => stored,
    saveTokens: async (_owner, next) => { stored = next; },
    refresh: async () => { refreshCalls += 1; return { access_token: "should-not-refresh", expires_in: 3600, token_type: "Bearer" }; },
    fetcher: async (_url, init) => {
      apiCalls += 1;
      if (apiCalls === 1) {
        stored = token({ access_token: "newer-worker-token" });
        return new Response(null, { status: 401 });
      }
      retryAuthorization = new Headers(init?.headers).get("authorization");
      return Response.json({ ok: true });
    },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  const response = await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  assert.equal(response.status, 200);
  assert.equal(refreshCalls, 0);
  assert.equal(apiCalls, 2);
  assert.equal(retryAuthorization, "Bearer newer-worker-token");
});

test("a selected location never retries against a replacement connection generation", async () => {
  let stored = token();
  let apiCalls = 0;
  let refreshCalls = 0;
  const client = createGoogleClient({
    getTokens: async () => stored,
    saveTokens: async (_owner, next) => { stored = next; },
    refresh: async () => { refreshCalls += 1; return { access_token: "unexpected", expires_in: 3600, token_type: "Bearer" }; },
    fetcher: async () => {
      apiCalls += 1;
      stored = token({ connection_version: "generation-2", access_token: "replacement" });
      return new Response(null, { status: 401 });
    },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  await assert.rejects(
    client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews", {}, "generation-1"),
    (error: Error) => error.name === "GoogleConnectionVersionError"
  );
  assert.equal(apiCalls, 1);
  assert.equal(refreshCalls, 0);

  const staleAtStart = makeClient({ initial: token({ connection_version: "generation-2" }), fetcher: async () => assert.fail("provider must not be called") });
  await assert.rejects(
    staleAtStart.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews", {}, "generation-1"),
    (error: Error) => error.name === "GoogleConnectionVersionError"
  );
});

test("a disconnect or credential replacement during refresh never sends or saves stale tokens", async () => {
  let current: TestTokens | null = token({ expires_at: pastExpiry() });
  let saves = 0;
  let requests = 0;
  const disconnected = createGoogleClient({
    getTokens: async () => current,
    saveTokens: async () => { saves += 1; },
    refresh: async () => {
      current = null;
      return { access_token: "stale-refreshed-token", expires_in: 3600, token_type: "Bearer" };
    },
    fetcher: async () => { requests += 1; return Response.json({}); },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  await assert.rejects(disconnected.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews"), /No Google connection/);
  assert.equal(saves, 0);
  assert.equal(requests, 0);

  current = token({ expires_at: pastExpiry() });
  const replaced = createGoogleClient({
    getTokens: async () => current,
    saveTokens: async () => { saves += 1; },
    refresh: async () => {
      current = token({ access_token: "replacement-token" });
      return { access_token: "stale-refreshed-token", expires_in: 3600, token_type: "Bearer" };
    },
    fetcher: async (_url, init) => {
      requests += 1;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer replacement-token");
      return Response.json({});
    },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  assert.equal((await replaced.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews")).status, 200);
  assert.equal(saves, 0);
});

test("a token snapshot CAS miss during refresh never returns or sends the rotated token", async () => {
  const starting = token({ expires_at: pastExpiry() });
  let current: TestTokens = starting;
  let sent = 0;
  let expectedSnapshot: { connection_version: string; stored_access_token: string; stored_refresh_token: string } | undefined;
  const client = createGoogleClient({
    getTokens: async () => current,
    saveTokens: async (_owner, _next, expected) => {
      expectedSnapshot = expected;
      // Simulate a concurrent refresh in the same OAuth generation winning the
      // database CAS after this worker's reread but before its UPDATE.
      current = token({ access_token: "other-worker-access", refresh_token: "other-worker-refresh", expires_at: futureExpiry(), connection_version: starting.connection_version, stored_access_token: "other-worker-cipher-access", stored_refresh_token: "other-worker-cipher-refresh" });
      return false;
    },
    refresh: async () => ({ access_token: "stale-worker-access", refresh_token: "stale-worker-refresh", expires_in: 3600, token_type: "Bearer" }),
    fetcher: async () => { sent += 1; return Response.json({}); },
    now: Date.now,
    sleep: async () => {},
    requestTimeoutMs: 1000,
  });
  await assert.rejects(client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews"), /changed or could not be saved/);
  assert.equal(sent, 0);
  assert.deepEqual(expectedSnapshot, {
    connection_version: starting.connection_version,
    stored_access_token: starting.stored_access_token,
    stored_refresh_token: starting.stored_refresh_token,
  });
  assert.equal(current.access_token, "other-worker-access");
});

test("provider origin checks prevent bearer exfiltration and redirect/cache behavior is constrained", async () => {
  let calls = 0;
  let observed: RequestInit | undefined;
  const client = makeClient({ fetcher: async (_url, init) => { calls += 1; observed = init; return Response.json({}); } });
  for (const url of [
    "http://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews",
    "https://evil.example/v4/accounts/A/locations/L/reviews",
    "https://mybusiness.googleapis.com.evil.example/v4/accounts/A/locations/L/reviews",
    "https://user:pass@mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews",
    "https://mybusiness.googleapis.com.evil.example/v4/accounts/A/locations/L/reviews",
  ]) await assert.rejects(client.googleFetch("owner", url), /not allowed/);
  assert.equal(calls, 0);
  await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  assert.equal(observed?.redirect, "error");
  assert.equal(observed?.cache, "no-store");
  assert.equal(calls, 1);
});

test("bounded retries honor Retry-After, retry only safe calls, and do not replay long waits", async () => {
  const sleeps: number[] = [];
  let count = 0;
  const client = makeClient({
    fetcher: async () => {
      count += 1;
      return count < 3 ? new Response(null, { status: 503 }) : Response.json({ done: true });
    },
    sleep: async (ms) => { sleeps.push(ms); },
  });
  const success = await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  assert.equal(success.status, 200);
  assert.equal(count, 3);
  assert.deepEqual(sleeps, [250, 500]);

  count = 0;
  const hugeWait = makeClient({ fetcher: async () => { count += 1; return new Response(null, { status: 429, headers: { "retry-after": "90" } }); } });
  const limited = await hugeWait.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  assert.equal(limited.status, 429);
  assert.equal(count, 1);

  let dateRetryCalls = 0;
  let dateRetryDelay = 0;
  const dateRetry = makeClient({
    fetcher: async () => {
      dateRetryCalls += 1;
      return dateRetryCalls === 1
        ? new Response(null, { status: 503, headers: { "retry-after": new Date(Date.now() + 1500).toUTCString() } })
        : Response.json({ done: true });
    },
    sleep: async (ms) => { dateRetryDelay = ms; },
  });
  assert.equal((await dateRetry.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews")).status, 200);
  assert.equal(dateRetryCalls, 2);
  assert.ok(dateRetryDelay > 0 && dateRetryDelay <= 1500);

  count = 0;
  const unsafe = await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews:batchGet", { method: "POST", body: "{}" });
  assert.equal(unsafe.status, 503);
  assert.equal(count, 1);

  count = 0;
  const replyClient = makeClient({ fetcher: async () => { count += 1; return count === 1 ? new Response(null, { status: 503, headers: { "retry-after": "1" } }) : Response.json({ done: true }); }, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal((await replyClient.googleFetch("owner", googleReviewReplyUrl("accounts/A", "L", "R"), { method: "PUT", body: JSON.stringify({ comment: "Thanks" }) })).status, 200);
  assert.equal(count, 2);
  assert.equal(sleeps.at(-1), 1000);
});

test("unrepeatable bodies and non-review PUT operations are never automatically replayed", async () => {
  let calls = 0;
  const client = makeClient({ fetcher: async () => { calls += 1; return new Response(null, { status: 503 }); } });
  await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews/R/reply", { method: "PUT", body: new ReadableStream() });
  await client.googleFetch("owner", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/L", { method: "PUT", body: "{}" });
  assert.equal(calls, 2);
});

test("request timeouts are sanitized", async () => {
  const client = makeClient({
    timeout: 5,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("secret-in-url-and-token")), { once: true });
    }),
  });
  await assert.rejects(client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews"), (error: Error) => {
    assert.match(error.message, /timed out/);
    assert.doesNotMatch(error.message, /secret-in-url-and-token/);
    return true;
  });
});

test("the response body remains under timeout control and upstream body errors are sanitized", async () => {
  const client = makeClient({
    timeout: 5,
    fetcher: async (_url, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(new Error("secret-upstream-body-error")), { once: true });
      },
    })),
  });
  const response = await client.googleFetch("owner", "https://mybusiness.googleapis.com/v4/accounts/A/locations/L/reviews");
  await assert.rejects(response.text(), (error: Error) => {
    assert.match(error.message, /Google API response body failed/);
    assert.doesNotMatch(error.message, /secret-upstream-body-error/);
    return true;
  });
});

test("location discovery follows both paginated APIs and preserves canonical ownership metadata", async () => {
  const seen: URL[] = [];
  const fetchGoogle = async (_owner: string, input: string | URL): Promise<Response> => {
    const url = new URL(input);
    seen.push(url);
    if (url.hostname === "mybusinessaccountmanagement.googleapis.com") {
      if (!url.searchParams.has("pageToken")) return Response.json({ accounts: [{ name: "accounts/A" }], nextPageToken: "next-account" });
      return Response.json({ accounts: [{ name: "accounts/B" }] });
    }
    if (url.pathname.includes("/accounts/A/locations")) {
      assert.equal(url.searchParams.get("readMask"), "name,title,storeCode,storefrontAddress,metadata,categories");
      assert.equal(url.searchParams.get("pageSize"), "100");
      if (!url.searchParams.has("pageToken")) return Response.json({ locations: [{ name: "locations/L1", title: "Shop A", storeCode: "s-1", storefrontAddress: { locality: "Madrid" }, metadata: { placeId: "place-a", newReviewUri: "https://g.page/r/a/review" } }], nextPageToken: "next-location" });
      return Response.json({ locations: [{ name: "locations/L2", title: "Shop A2", metadata: { placeId: "place-b" } }] });
    }
    return Response.json({ locations: [{ name: "locations/L3", title: "Shop B" }] });
  };
  const discover = createGoogleLocationDiscovery(fetchGoogle as never);
  const locations = await discover("owner-1");
  assert.deepEqual(locations.map(({ locationName, accountName, informationName }) => ({ locationName, accountName, informationName })), [
    { locationName: "accounts/A/locations/L1", accountName: "accounts/A", informationName: "locations/L1" },
    { locationName: "accounts/A/locations/L2", accountName: "accounts/A", informationName: "locations/L2" },
    { locationName: "accounts/B/locations/L3", accountName: "accounts/B", informationName: "locations/L3" },
  ]);
  assert.equal(locations[0]?.placeId, "place-a");
  assert.equal(locations[0]?.reviewUrl, "https://g.page/r/a/review");
  assert.deepEqual(locations[0]?.address, { locality: "Madrid" });
  assert.equal(seen.length, 5);
});

test("location discovery rejects repeated pagination tokens and malformed resource names", async () => {
  const repeated = createGoogleLocationDiscovery(async () => Response.json({ accounts: [], nextPageToken: "same" }) as never);
  await assert.rejects(repeated("owner"), /repeated pagination token/);
  const malformed = createGoogleLocationDiscovery(async () => Response.json({ accounts: [{ name: "accounts/a/b" }] }) as never);
  await assert.rejects(malformed("owner"), /resource name/);
});

test("location discovery enforces a global request budget and deduplicates repeated resources", async () => {
  let requestCount = 0;
  const tooMany = createGoogleLocationDiscovery((async (_owner: string, input: string | URL) => {
    requestCount += 1;
    const url = new URL(input);
    if (url.hostname === "mybusinessaccountmanagement.googleapis.com") {
      return Response.json({ accounts: Array.from({ length: 201 }, (_, index) => ({ name: `accounts/A${index}` })) });
    }
    return Response.json({ locations: [] });
  }) as never);
  await assert.rejects(tooMany("owner"), /request limit/);
  assert.equal(requestCount, 200);

  const dedupe = createGoogleLocationDiscovery((async (_owner: string, input: string | URL) => {
    const url = new URL(input);
    if (url.hostname === "mybusinessaccountmanagement.googleapis.com") {
      return Response.json({ accounts: [{ name: "accounts/A" }, { name: "accounts/A" }] });
    }
    return Response.json({ locations: [{ name: "locations/L" }, { name: "locations/L" }] });
  }) as never);
  assert.deepEqual((await dedupe("owner")).map((location) => location.locationName), ["accounts/A/locations/L"]);
});
