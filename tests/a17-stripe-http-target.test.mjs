import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/a17-stripe-http-target.mjs");

for (const scenario of [
  {
    name: "an inherited live key",
    key: "sk_live_AAAAAAAAAAAAAAAA",
    confirm: "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS",
    target: "isolated-test",
    expected: /inherited live Stripe key blocks this target/,
  },
  {
    name: "missing provider-object authorization",
    key: "sk_test_AAAAAAAAAAAAAAAA",
    confirm: "",
    target: "isolated-test",
    expected: /isolated-test marker and explicit test-resource authorization are required/,
  },
  {
    name: "missing isolated-target marker",
    key: "sk_test_AAAAAAAAAAAAAAAA",
    confirm: "I_AUTHORIZE_TEST_MODE_PROVIDER_OBJECTS",
    target: "",
    expected: /isolated-test marker and explicit test-resource authorization are required/,
  },
]) {
  test(`HTTP target launcher blocks ${scenario.name} before provider mutation`, () => {
    const child = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
      env: {
        ...process.env,
        STRIPE_SECRET_KEY: scenario.key,
        A17_STRIPE_CONFIRM: scenario.confirm,
        A17_STRIPE_TARGET: scenario.target,
      },
    });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 1);
    assert.match(child.stderr, scenario.expected);
    assert.doesNotMatch(child.stderr, /sk_(?:test|live)_/);
    assert.equal(child.stdout, "");
  });
}
