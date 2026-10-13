import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getStripeAcceptancePrerequisites,
  readStripeCliTestKey,
  runStripeProviderAcceptance,
} from "../scripts/a17-stripe-test-acceptance.mjs";

const readyEnv = {
  STRIPE_SECRET_KEY: `sk_test_${"t".repeat(20)}`,
};

test("provider preflight accepts only test keys and never returns credential material", () => {
  assert.equal(getStripeAcceptancePrerequisites(readyEnv).status, "ready");
  const live = getStripeAcceptancePrerequisites({ ...readyEnv, STRIPE_SECRET_KEY: `sk_live_${"l".repeat(20)}` });
  assert.equal(live.status, "blocked");
  assert.equal(live.keyMode, "live-prefix-blocked");
  assert.equal(JSON.stringify(live).includes("sk_live_"), false);
  assert.equal(getStripeAcceptancePrerequisites({}).status, "blocked");
});

test("Stripe CLI config reader returns only a well-formed test-mode key", () => {
  const dir = mkdtempSync(join(tmpdir(), "a17-stripe-config-"));
  const file = join(dir, "config.toml");
  try {
    writeFileSync(file, `live_mode_api_key = "sk_live_${"l".repeat(20)}"\ntest_mode_api_key = "sk_test_${"t".repeat(20)}"\n`);
    assert.equal(readStripeCliTestKey(file), `sk_test_${"t".repeat(20)}`);
    writeFileSync(file, `test_mode_api_key = "sk_live_${"l".repeat(20)}"\n`);
    assert.equal(readStripeCliTestKey(file), null);
    writeFileSync(file, `test_mode_api_key = "sk_test_${"t".repeat(20)}"\ntest_mode_api_key = "sk_test_${"u".repeat(20)}"\n`);
    assert.equal(readStripeCliTestKey(file), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("provider run rejects any object marked live and still archives earlier synthetic resources", async () => {
  const runId = "a1700000-0000-4000-8000-000000000009";
  let productArchived = false;
  try {
    await assert.rejects(runStripeProviderAcceptance({ runId, stripe: {
      products: {
        create: async () => ({ id: "prod_a17", livemode: false, active: true }),
        update: async (_id: string, params: { active: boolean }) => { productArchived = params.active === false; return { id: "prod_a17", livemode: false, active: false }; },
      },
      prices: { create: async () => ({ id: "price_a17", livemode: true, active: true }) },
    } }), /scenario failed during create synthetic EUR 39 monthly price/);
    assert.equal(productArchived, true);
  } finally { rmSync(join(process.cwd(), ".local", "a17-stripe-evidence", `provider-${runId}.json`), { force: true }); }
});

test("provider run fails closed without mutating an object marked live", async () => {
  const runId = "a1700000-0000-4000-8000-000000000010";
  let productArchived = false;
  try {
    await assert.rejects(runStripeProviderAcceptance({ runId, stripe: {
      products: {
        create: async () => ({ id: "prod_a17", livemode: true, active: true }),
        update: async () => { productArchived = true; return { id: "prod_a17", livemode: false, active: false }; },
      },
    } }), /scenario failed during create synthetic product/);
    assert.equal(productArchived, false);
  } finally { rmSync(join(process.cwd(), ".local", "a17-stripe-evidence", `provider-${runId}.json`), { force: true }); }
});

test("provider evidence records incomplete cleanup after a scenario failure", async () => {
  const runId = "a1700000-0000-4000-8000-000000000011";
  const evidencePath = join(process.cwd(), ".local", "a17-stripe-evidence", `provider-${runId}.json`);
  try {
    await assert.rejects(runStripeProviderAcceptance({ runId, stripe: {
      products: {
        create: async () => ({ id: "prod_a17", livemode: false, active: true }),
        update: async () => { throw new Error("private cleanup error"); },
      },
      prices: { create: async () => ({ id: "price_a17", livemode: true, active: true }) },
    } }), /cleanup incomplete/);
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    assert.equal(evidence.status, "scenario-failed-and-cleanup-incomplete");
  } finally { rmSync(evidencePath, { force: true }); }
});
