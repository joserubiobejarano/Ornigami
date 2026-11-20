import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { BuilderGenerationResponse } from "../src/lib/builder/generation.ts";
import { runLimitedBuilderGeneration } from "../builder-runtime/lib/generation-limits.ts";
import {
  readBuilderIdentityStore,
  revokeBuilderSession,
  withBuilderIdentityStore,
} from "../builder-runtime/lib/identity-store.ts";
import type { BuilderRuntimeConfig } from "../builder-runtime/lib/runtime-config.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-generation-limits");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

async function seedAdmission(
  storeDir: string,
  subjectId = "sub_a",
  sessionId = "ses_a",
): Promise<void> {
  await withBuilderIdentityStore(storeDir, (store) => {
    store.subjects.push({
      id: subjectId,
      label: "Synthetic runner subject",
      createdAt: new Date("2026-11-20T09:00:00.000Z").toISOString(),
    });
    store.sessions.push({
      id: sessionId,
      subjectId,
      tokenHash: "synthetic-token-hash",
      createdAt: new Date("2026-11-20T09:00:00.000Z").toISOString(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString(),
    });
  });
}

async function config(
  name: string,
  overrides: Partial<BuilderRuntimeConfig> = {},
  seed = true,
): Promise<BuilderRuntimeConfig> {
  const dir = mkdtempSync(path.join(tempRoot, `${name}-`));
  const runtime: BuilderRuntimeConfig = {
    mode: "invite",
    storeDir: dir,
    sessionTtlSeconds: 3600,
    cookieName: "ornigami_builder_session",
    secureCookies: false,
    appUrl: "http://127.0.0.1:3041",
    testGenerationDelayMs: 0,
    providerTimeoutMs: 5000,
    testProvider: "none",
    testProviderCostMicros: 0,
    limits: {
      windowSeconds: 3600,
      reservationLeaseSeconds: 60,
      requestReserveMicros: 50_000,
      subjectRequests: 10,
      globalRequests: 100,
      subjectConcurrency: 2,
      globalConcurrency: 4,
      subjectSpendMicros: 1_000_000,
      globalSpendMicros: 2_000_000,
    },
    redeemWindowSeconds: 60,
    redeemClientAttemptLimit: 20,
    redeemGlobalAttemptLimit: 100,
    trustProxyHeaders: false,
    ...overrides,
  };
  if (seed && runtime.storeDir) await seedAdmission(runtime.storeDir);
  return runtime;
}

function generated(): BuilderGenerationResponse {
  return {
    ok: true,
    preview: {} as never,
    generation: {
      status: "generated",
      provider: "test-stub",
      providerLabel: "Injected test provider",
      providerMode: "model",
      harnessVersion: "test",
      guidancePackVersion: "test",
    },
  };
}

function fallback(code: "timeout" | "invalid" | "provider-error" | "unavailable"): BuilderGenerationResponse {
  return {
    ok: true,
    preview: {} as never,
    generation: {
      status: "fallback",
      provider: "test-stub",
      providerLabel: "Injected test provider",
      providerMode: "model",
      harnessVersion: "test",
      guidancePackVersion: "test",
      code,
    },
  };
}

const signal = () => new AbortController().signal;

test("a limited success settles actual cost and records the provider dispatch", async () => {
  const runtime = await config("success");
  let calls = 0;
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "success-1",
    signal: signal(),
    generate: async () => {
      calls += 1;
      return { result: generated(), providerDispatched: true, actualCostMicros: 40_000 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  if (!result.ok) return;
  assert.equal(result.usage.state, "succeeded");
  assert.equal(result.usage.costMicros, 40_000);
  assert.equal((await readBuilderIdentityStore(runtime.storeDir!)).usage.length, 1);
});

test("timeout, invalid and provider-error outcomes remain unknown", async () => {
  for (const code of ["timeout", "invalid", "provider-error"] as const) {
    const runtime = await config(code);
    const result = await runLimitedBuilderGeneration({
      config: runtime,
      subjectId: "sub_a",
      sessionId: "ses_a",
      requestKey: `${code}-1`,
      signal: signal(),
      generate: async () => ({
        result: fallback(code),
        providerDispatched: true,
        actualCostMicros: 10_000,
      }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.usage.state, "unknown");
      assert.equal(result.usage.costMicros, 50_000);
      assert.equal(result.usage.settlementReason, code);
    }
  }
});

test("no provider dispatch is a failed zero-cost request", async () => {
  const runtime = await config("not-dispatched");
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "offline-1",
    signal: signal(),
    generate: async () => ({
      result: fallback("unavailable"),
      providerDispatched: false,
    }),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.usage.state, "failed");
    assert.equal(result.usage.costMicros, 0);
  }
});

test("cancellation before dispatch releases the reservation without a provider call", async () => {
  const runtime = await config("cancelled");
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "cancelled-1",
    signal: controller.signal,
    generate: async () => {
      calls += 1;
      return { result: generated(), providerDispatched: true };
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "cancelled");
  assert.equal(calls, 0);
  assert.equal((await readBuilderIdentityStore(runtime.storeDir!)).usage.length, 0);
});

test("a dispatched throw remains unknown and does not return a preview", async () => {
  const runtime = await config("threw");
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "threw-1",
    signal: signal(),
    generate: async () => ({
      result: null,
      providerDispatched: true,
      error: new Error("synthetic transport uncertainty"),
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "accounting_unavailable");
  const usage = (await readBuilderIdentityStore(runtime.storeDir!)).usage;
  assert.equal(usage[0].state, "unknown");
  assert.equal(usage[0].costMicros, 50_000);
});

test("duplicate request keys never call the provider twice", async () => {
  const runtime = await config("duplicate");
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return { result: generated(), providerDispatched: true, actualCostMicros: 10_000 };
  };
  const first = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "same-1",
    signal: signal(),
    generate,
  });
  assert.equal(first.ok, true);
  const second = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "same-1",
    signal: signal(),
    generate,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.failure.code, "duplicate");
  assert.equal(calls, 1);
  assert.equal((await readBuilderIdentityStore(runtime.storeDir!)).usage.length, 1);
});

test("an unavailable ledger denies dispatch with actionable feedback", async () => {
  const brokenStore = path.join(tempRoot, "broken-store");
  writeFileSync(brokenStore, "not a directory");
  const runtime = await config(
    "unavailable",
    { storeDir: brokenStore },
    false,
  );
  let calls = 0;
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "unavailable-1",
    signal: signal(),
    generate: async () => {
      calls += 1;
      return { result: generated(), providerDispatched: true };
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "accounting_unavailable");
    assert.match(result.failure.message, /No provider request was made/i);
  }
  assert.equal(calls, 0);
});

test("the request limit denies before the provider callback", async () => {
  const runtime = await config("request-limit", {
    limits: {
      windowSeconds: 3600,
      reservationLeaseSeconds: 60,
      requestReserveMicros: 50_000,
      subjectRequests: 1,
      globalRequests: 100,
      subjectConcurrency: 2,
      globalConcurrency: 4,
      subjectSpendMicros: 1_000_000,
      globalSpendMicros: 2_000_000,
    },
  });
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return { result: generated(), providerDispatched: true, actualCostMicros: 0 };
  };
  const first = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "limit-1",
    signal: signal(),
    generate,
  });
  const second = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "limit-2",
    signal: signal(),
    generate,
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.failure.code, "subject_requests");
  assert.equal(calls, 1);
});

test("revocation after reservation but before dispatch releases the reservation and never calls the provider", async () => {
  const runtime = await config("revoked-before-dispatch");
  let calls = 0;
  const result = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "revoked-1",
    signal: signal(),
    beforeDispatch: async () => {
      await revokeBuilderSession({
        storeDir: runtime.storeDir!,
        sessionId: "ses_a",
      });
    },
    generate: async () => {
      calls += 1;
      return { result: generated(), providerDispatched: true, actualCostMicros: 10_000 };
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "session_inactive");
  assert.equal(calls, 0);
  const usage = (await readBuilderIdentityStore(runtime.storeDir!)).usage;
  assert.equal(usage.length, 1);
  assert.equal(usage[0].state, "failed");
  assert.equal(usage[0].costMicros, 0);
  assert.equal(usage[0].settlementReason, "session_revoked_before_dispatch");
});

test("a missing request id or inactive session is denied before reservation", async () => {
  const runtime = await config("invalid-request");
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return { result: generated(), providerDispatched: true };
  };

  const missingId = await runLimitedBuilderGeneration({
    config: runtime,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "   ",
    signal: signal(),
    generate,
  });
  assert.equal(missingId.ok, false);
  if (!missingId.ok) assert.equal(missingId.failure.code, "invalid_request");

  const noAdmission = await config("no-admission", {}, false);
  const inactive = await runLimitedBuilderGeneration({
    config: noAdmission,
    subjectId: "sub_a",
    sessionId: "ses_a",
    requestKey: "no-admission-1",
    signal: signal(),
    generate,
  });
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.equal(inactive.failure.code, "session_inactive");
  assert.equal(calls, 0);
  const usage = (await readBuilderIdentityStore(noAdmission.storeDir!)).usage;
  assert.equal(usage.length, 0);
});

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
