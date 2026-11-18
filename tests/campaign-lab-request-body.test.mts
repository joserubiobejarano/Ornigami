import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJsonBody } from "../src/lib/campaign-lab/generation/request-body.ts";

function requestWithBody(
  body: string,
  contentLength?: string,
): Request {
  return new Request("http://localhost/api/campaign-lab/generate", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      ...(contentLength !== undefined
        ? { "content-length": contentLength }
        : {}),
    },
  });
}

test("the bounded reader counts actual UTF-8 bytes, not string length", async () => {
  const body = JSON.stringify({ text: "é".repeat(20) });
  const bytes = new TextEncoder().encode(body).byteLength;
  assert.ok(body.length < bytes, "the multibyte fixture must differ from byte length");

  const tooSmall = await readBoundedJsonBody(
    requestWithBody(body),
    bytes - 1,
  );
  assert.equal(tooSmall.ok, false);
  if (!tooSmall.ok) {
    assert.equal(tooSmall.status, 413);
    assert.match(tooSmall.message, /too large/i);
  }

  const accepted = await readBoundedJsonBody(requestWithBody(body), bytes);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal((accepted.value as { text: string }).text, "é".repeat(20));
  }
});

test("missing Content-Length cannot bypass the actual byte limit", async () => {
  const body = JSON.stringify({ text: "x".repeat(200) });
  const result = await readBoundedJsonBody(requestWithBody(body), 64);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.message, /too large/i);
  }
});

test("understated Content-Length cannot bypass the actual byte limit", async () => {
  const body = JSON.stringify({ text: "x".repeat(200) });
  const result = await readBoundedJsonBody(
    requestWithBody(body, "1"),
    64,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.message, /too large/i);
  }
});

test("declared over-limit bodies are rejected before parsing", async () => {
  const result = await readBoundedJsonBody(
    requestWithBody('{"ok":true}', "999999"),
    64,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
    assert.match(result.message, /too large/i);
  }
});

test("malformed JSON and empty bodies keep the actionable 400 response", async () => {
  for (const body of ["not json", "", "{"] as const) {
    const result = await readBoundedJsonBody(requestWithBody(body), 1024);
    assert.equal(result.ok, false, JSON.stringify(body));
    if (!result.ok) {
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.match(result.message, /JSON request body/i);
    }
  }
});
