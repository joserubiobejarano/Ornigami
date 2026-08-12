import assert from "node:assert/strict";
import test from "node:test";

import { decryptToken, encryptToken } from "../src/lib/encrypted-token.ts";
import { getTrustedRequestIp } from "../src/lib/trusted-request-ip.ts";

test("OAuth token encryption round-trips and does not expose plaintext", () => {
  const encrypted = encryptToken("refresh-token-value");
  assert.notEqual(encrypted, "refresh-token-value");
  assert.deepEqual(decryptToken(encrypted), { value: "refresh-token-value", legacy: false });
});

test("trusted IP extraction ignores the spoofable left-most forwarded hop", () => {
  const headers = new Headers({ "x-forwarded-for": "spoofed, proxy, trusted" });
  assert.equal(getTrustedRequestIp(headers), "trusted");
});
