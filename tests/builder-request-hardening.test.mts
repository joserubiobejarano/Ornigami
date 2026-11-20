import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { readBoundedUrlEncodedForm } from "../builder-runtime/lib/bounded-form.ts";
import {
  consumeRedemptionAttempt,
  redemptionClientKey,
  resetRedemptionAttempts,
} from "../builder-runtime/lib/redemption-limiter.ts";
import { readBuilderRuntimeConfig } from "../builder-runtime/lib/runtime-config.ts";
import { isSameOriginRequest } from "../builder-runtime/lib/request-origin.ts";
import {
  BUILDER_DRAFT_STORAGE_PREFIX,
  clearBuilderDraftStorage,
} from "../src/lib/builder/draft-storage.ts";
import { createBuilderRequestId } from "../src/lib/builder/request-id.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-request-hardening");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function config(overrides: Record<string, string> = {}) {
  return readBuilderRuntimeConfig({
    BUILDER_RUNTIME_MODE: "invite",
    BUILDER_RUNTIME_STORE_DIR: mkdtempSync(path.join(tempRoot, "store-")),
    NEXT_PUBLIC_APP_URL: "https://builder.example.test",
    ...overrides,
  });
}

function post(
  url: string,
  headers: Record<string, string>,
  body?: BodyInit | null,
): Request {
  return new Request(url, {
    method: "POST",
    headers,
    body,
    ...(body && typeof body !== "string" ? { duplex: "half" } : {}),
  } as RequestInit);
}

test("origin checks bind to the full configured origin, not request or proxy headers", () => {
  const runtime = config();

  const matching = post("http://internal-runtime:3000/api/builder/generate", {
    origin: "https://builder.example.test",
    "sec-fetch-site": "same-origin",
    host: "attacker.example.test",
    "x-forwarded-host": "attacker.example.test",
    "x-forwarded-proto": "http",
  });
  assert.equal(isSameOriginRequest(matching, runtime), true);

  for (const origin of [
    "http://builder.example.test",
    "https://builder.example.test.evil",
    "https://builder.example.test:444",
    "null",
  ]) {
    assert.equal(
      isSameOriginRequest(
        post("http://internal-runtime:3000/api/builder/generate", {
          origin,
          "sec-fetch-site": "same-origin",
        }),
        runtime,
      ),
      false,
      origin,
    );
  }

  assert.equal(
    isSameOriginRequest(
      post("http://internal-runtime:3000/api/builder/generate", {
        "sec-fetch-site": "same-origin",
      }),
      runtime,
    ),
    false,
    "a missing Origin is not sufficient",
  );
  assert.equal(
    isSameOriginRequest(
      post("http://internal-runtime:3000/api/builder/generate", {
        origin: "https://builder.example.test",
        "sec-fetch-site": "cross-site",
      }),
      runtime,
    ),
    false,
    "a cross-site fetch marker is rejected even with a matching Origin",
  );
});

test("redemption bodies are bounded by actual streamed bytes and one field", async () => {
  const valid = await readBoundedUrlEncodedForm(
    post("https://builder.example.test/api/builder/session/redeem", {
      "content-type": "application/x-www-form-urlencoded",
    }, "token=synthetic-token"),
    4_096,
  );
  assert.equal(valid.ok, true);
  if (valid.ok) assert.equal(valid.params.get("token"), "synthetic-token");

  const declared = await readBoundedUrlEncodedForm(
    post(
      "https://builder.example.test/api/builder/session/redeem",
      {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "5000",
      },
      "token=x",
    ),
    4_096,
  );
  assert.equal(declared.ok, false);
  if (!declared.ok) assert.equal(declared.status, 413);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("token="));
      controller.enqueue(new TextEncoder().encode("x".repeat(5_000)));
      controller.close();
    },
  });
  const streamed = await readBoundedUrlEncodedForm(
    post(
      "https://builder.example.test/api/builder/session/redeem",
      { "content-type": "application/x-www-form-urlencoded" },
      stream,
    ),
    4_096,
  );
  assert.equal(streamed.ok, false);
  if (!streamed.ok) assert.equal(streamed.status, 413);

  const wrongType = await readBoundedUrlEncodedForm(
    post(
      "https://builder.example.test/api/builder/session/redeem",
      { "content-type": "multipart/form-data; boundary=x" },
      "token=x",
    ),
    4_096,
  );
  assert.equal(wrongType.ok, false);
  if (!wrongType.ok) assert.equal(wrongType.status, 415);

  const malformed = await readBoundedUrlEncodedForm(
    post(
      "https://builder.example.test/api/builder/session/redeem",
      { "content-type": "application/x-www-form-urlencoded" },
      new Uint8Array([0xff, 0xfe, 0xfd]),
    ),
    4_096,
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.status, 400);
});

test("redemption attempts are bounded per client and globally per process", () => {
  resetRedemptionAttempts();
  const limits = {
    windowSeconds: 60,
    clientLimit: 2,
    globalLimit: 3,
    now: 1_000_000,
  };
  assert.equal(consumeRedemptionAttempt({ ...limits, clientKey: "a" }).ok, true);
  assert.equal(consumeRedemptionAttempt({ ...limits, clientKey: "a" }).ok, true);
  const clientDenied = consumeRedemptionAttempt({ ...limits, clientKey: "a" });
  assert.equal(clientDenied.ok, false);
  if (!clientDenied.ok) assert.ok(clientDenied.retryAfterSeconds >= 1);

  assert.equal(consumeRedemptionAttempt({ ...limits, clientKey: "b" }).ok, true);
  const globalDenied = consumeRedemptionAttempt({ ...limits, clientKey: "c" });
  assert.equal(globalDenied.ok, false);

  const afterWindow = consumeRedemptionAttempt({
    ...limits,
    clientKey: "a",
    now: 1_000_000 + 61_000,
  });
  assert.equal(afterWindow.ok, true);
});

test("forwarded client addresses are used only when the proxy is trusted", () => {
  const request = post(
    "https://builder.example.test/api/builder/session/redeem",
    { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  );
  assert.equal(
    redemptionClientKey(request, false),
    redemptionClientKey(request, false),
  );
  assert.equal(
    redemptionClientKey(request, true),
    redemptionClientKey(request, true),
  );
  assert.notEqual(
    redemptionClientKey(request, true),
    redemptionClientKey(request, false),
  );

  const invalid = post(
    "https://builder.example.test/api/builder/session/redeem",
    { "x-forwarded-for": "not-an-ip" },
  );
  assert.equal(
    redemptionClientKey(invalid, true),
    redemptionClientKey(invalid, false),
  );
});

test("builder request ids are unique UUIDs and logout clears only builder drafts", () => {
  const pattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ids = new Set(Array.from({ length: 100 }, () => createBuilderRequestId()));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, pattern);

  const values = new Map<string, string>([
    [`${BUILDER_DRAFT_STORAGE_PREFIX}:sub_a`, "draft A"],
    [`${BUILDER_DRAFT_STORAGE_PREFIX}:sub_b`, "draft B"],
    ["ornigami.other", "keep"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
  assert.equal(clearBuilderDraftStorage(storage), 2);
  assert.deepEqual([...values.keys()], ["ornigami.other"]);
});

test.after(() => {
  resetRedemptionAttempts();
  rmSync(tempRoot, { recursive: true, force: true });
});
