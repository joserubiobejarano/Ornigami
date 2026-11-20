import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  BuilderInviteRedemptionError,
  BuilderStoreUnavailable,
  issueBuilderInvite,
  readBuilderIdentityStore,
  redeemBuilderInvite,
  revokeBuilderInvite,
  revokeBuilderSession,
  revokeBuilderSubject,
  validateBuilderSession,
} from "../builder-runtime/lib/identity-store.ts";
import { readBuilderRuntimeConfig } from "../builder-runtime/lib/runtime-config.ts";

const root = process.cwd();
const tempRoot = path.join(root, ".local", "test-identity-store");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

function storeDir(name: string): string {
  return mkdtempSync(path.join(tempRoot, `${name}-`));
}

test("issued invites store only hashes and redeem into an expiring subject session", async () => {
  const dir = storeDir("roundtrip");
  const issued = await issueBuilderInvite({
    storeDir: dir,
    label: "Synthetic identity A",
    inviteTtlSeconds: 3600,
    now: new Date("2026-11-20T10:00:00.000Z"),
  });
  assert.match(issued.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(issued.subject.id, /^sub_[a-f0-9]{24}$/);

  const rawStore = readFileSync(
    path.join(dir, "identity-store.json"),
    "utf8",
  );
  assert.equal(rawStore.includes(issued.token), false);
  assert.equal(rawStore.includes(issued.invite.tokenHash), true);
  assert.equal(issued.invite.usedAt, undefined);

  const redeemed = await redeemBuilderInvite({
    storeDir: dir,
    token: issued.token,
    sessionTtlSeconds: 60,
    now: new Date("2026-11-20T10:01:00.000Z"),
  });
  assert.equal(redeemed.subject.id, issued.subject.id);
  assert.equal(redeemed.session.subjectId, issued.subject.id);
  assert.match(redeemed.token, /^[A-Za-z0-9_-]{40,}$/);

  const active = await validateBuilderSession({
    storeDir: dir,
    token: redeemed.token,
    now: new Date("2026-11-20T10:01:30.000Z"),
  });
  assert.equal(active?.subject.id, issued.subject.id);
  assert.equal(active?.session.id, redeemed.session.id);

  const stored = await readBuilderIdentityStore(dir);
  assert.equal(stored.invites[0].usedAt, "2026-11-20T10:01:00.000Z");
  assert.equal(stored.invites[0].redeemedSessionId, redeemed.session.id);
  assert.equal(stored.sessions[0].tokenHash === redeemed.token, false);
});

test("single-use redemption is atomic under concurrent attempts", async () => {
  const dir = storeDir("concurrent");
  const issued = await issueBuilderInvite({
    storeDir: dir,
    label: "Concurrent identity",
    inviteTtlSeconds: 3600,
  });

  const attempts = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      redeemBuilderInvite({
        storeDir: dir,
        token: issued.token,
        sessionTtlSeconds: 60,
      }),
    ),
  );
  const successes = attempts.filter((item) => item.status === "fulfilled");
  const failures = attempts.filter((item) => item.status === "rejected");
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 11);
  for (const failure of failures) {
    assert.ok(failure.status === "rejected");
    assert.ok(failure.reason instanceof BuilderInviteRedemptionError);
    assert.equal(failure.reason.code, "used");
  }

  const stored = await readBuilderIdentityStore(dir);
  assert.equal(stored.sessions.length, 1);
  await assert.rejects(
    redeemBuilderInvite({
      storeDir: dir,
      token: issued.token,
      sessionTtlSeconds: 60,
    }),
    (error) =>
      error instanceof BuilderInviteRedemptionError && error.code === "used",
  );
});

test("invites and sessions expire and can be revoked by operator scope", async () => {
  const dir = storeDir("expiry");
  const issued = await issueBuilderInvite({
    storeDir: dir,
    label: "Expiry identity",
    inviteTtlSeconds: 10,
    now: new Date("2026-11-20T10:00:00.000Z"),
  });
  await assert.rejects(
    redeemBuilderInvite({
      storeDir: dir,
      token: issued.token,
      sessionTtlSeconds: 60,
      now: new Date("2026-11-20T10:00:11.000Z"),
    }),
    (error) =>
      error instanceof BuilderInviteRedemptionError && error.code === "expired",
  );

  const second = await issueBuilderInvite({
    storeDir: dir,
    label: "Revocation identity",
    inviteTtlSeconds: 3600,
  });
  const redeemed = await redeemBuilderInvite({
    storeDir: dir,
    token: second.token,
    sessionTtlSeconds: 1,
    now: new Date("2026-11-20T10:00:00.000Z"),
  });
  assert.equal(
    await validateBuilderSession({
      storeDir: dir,
      token: redeemed.token,
      now: new Date("2026-11-20T10:00:02.000Z"),
    }),
    null,
  );

  const third = await issueBuilderInvite({
    storeDir: dir,
    label: "Session revocation",
    inviteTtlSeconds: 3600,
  });
  const thirdRedeemed = await redeemBuilderInvite({
    storeDir: dir,
    token: third.token,
    sessionTtlSeconds: 3600,
  });
  assert.equal(
    await revokeBuilderSession({
      storeDir: dir,
      sessionId: thirdRedeemed.session.id,
    }),
    true,
  );
  assert.equal(
    await validateBuilderSession({
      storeDir: dir,
      token: thirdRedeemed.token,
    }),
    null,
  );

  const fourth = await issueBuilderInvite({
    storeDir: dir,
    label: "Subject revocation",
    inviteTtlSeconds: 3600,
  });
  const fourthRedeemed = await redeemBuilderInvite({
    storeDir: dir,
    token: fourth.token,
    sessionTtlSeconds: 3600,
  });
  assert.equal(
    await revokeBuilderSubject({
      storeDir: dir,
      subjectId: fourthRedeemed.subject.id,
    }),
    true,
  );
  assert.equal(
    await validateBuilderSession({
      storeDir: dir,
      token: fourthRedeemed.token,
    }),
    null,
  );

  const fifth = await issueBuilderInvite({
    storeDir: dir,
    label: "Invite revocation",
    inviteTtlSeconds: 3600,
  });
  assert.equal(
    await revokeBuilderInvite({ storeDir: dir, inviteId: fifth.invite.id }),
    true,
  );
  await assert.rejects(
    redeemBuilderInvite({
      storeDir: dir,
      token: fifth.token,
      sessionTtlSeconds: 3600,
    }),
    (error) =>
      error instanceof BuilderInviteRedemptionError && error.code === "revoked",
  );
});

test("the operator CLI issues, lists and revokes durable records", async () => {
  const dir = storeDir("operator");
  const script = path.join(root, "scripts", "builder-invite-operator.mjs");
  const run = (args: string[]) =>
    spawnSync(
      process.execPath,
      ["--experimental-strip-types", script, ...args, "--json"],
      { cwd: root, encoding: "utf8" },
    );

  const issued = run([
    "issue",
    "--store",
    dir,
    "--label",
    "CLI identity",
    "--ttl-seconds",
    "600",
  ]);
  assert.equal(issued.status, 0, issued.stderr);
  const output = JSON.parse(issued.stdout.trim());
  assert.match(output.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(output.subjectId, /^sub_/);

  const list = run(["list", "--store", dir]);
  assert.equal(list.status, 0, list.stderr);
  const state = JSON.parse(list.stdout);
  assert.equal(state.subjects[0].id, output.subjectId);
  assert.equal(state.invites[0].id, output.inviteId);
  assert.equal("tokenHash" in state.invites[0], false);

  const revoked = run([
    "revoke-subject",
    "--store",
    dir,
    "--subject",
    output.subjectId,
  ]);
  assert.equal(revoked.status, 0, revoked.stderr);
  assert.equal(JSON.parse(revoked.stdout).revoked, true);
});

test("storage and configuration failures fail closed", async () => {
  const filePath = path.join(tempRoot, "not-a-directory");
  mkdirSafe(tempRoot);
  writeFileSync(filePath, "not a store directory");
  await assert.rejects(
    issueBuilderInvite({
      storeDir: filePath,
      label: "Broken",
      inviteTtlSeconds: 60,
    }),
    (error) => error instanceof BuilderStoreUnavailable,
  );

  assert.equal(readBuilderRuntimeConfig({}).mode, "closed");
  assert.throws(
    () => readBuilderRuntimeConfig({ BUILDER_RUNTIME_MODE: "invite" }),
    /BUILDER_RUNTIME_STORE_DIR/,
  );
  assert.throws(
    () =>
      readBuilderRuntimeConfig({
        BUILDER_RUNTIME_MODE: "invite",
        BUILDER_RUNTIME_STORE_DIR: ".local/test-identity-store/config",
        BUILDER_RUNTIME_TEST_GENERATION_DELAY_MS: "50",
      }),
    /ALLOW_TEST_HOOKS/,
  );
  assert.throws(
    () =>
      readBuilderRuntimeConfig({
        BUILDER_BETA_LEGACY_AUTH: "true",
      }),
    /legacy/i,
  );
});

test("generation limits and the test provider remain closed unless explicitly enabled", () => {
  const defaults = readBuilderRuntimeConfig({});
  assert.equal(defaults.mode, "closed");
  assert.equal(defaults.testProvider, "none");
  assert.equal(defaults.testProviderCostMicros, 0);
  assert.equal(defaults.providerTimeoutMs, 5_000);
  assert.equal(defaults.redeemWindowSeconds, 60);
  assert.equal(defaults.redeemClientAttemptLimit, 20);
  assert.equal(defaults.redeemGlobalAttemptLimit, 100);
  assert.equal(defaults.trustProxyHeaders, false);
  assert.deepEqual(defaults.limits, {
    windowSeconds: 24 * 60 * 60,
    reservationLeaseSeconds: 300,
    requestReserveMicros: 50_000,
    subjectRequests: 30,
    globalRequests: 300,
    subjectConcurrency: 2,
    globalConcurrency: 8,
    subjectSpendMicros: 5_000_000,
    globalSpendMicros: 50_000_000,
  });

  assert.throws(
    () => readBuilderRuntimeConfig({ BUILDER_RUNTIME_TEST_PROVIDER: "success" }),
    /ALLOW_TEST_HOOKS/,
  );
  assert.throws(
    () =>
      readBuilderRuntimeConfig({
        BUILDER_RUNTIME_ALLOW_TEST_HOOKS: "1",
        BUILDER_RUNTIME_TEST_PROVIDER: "sideways",
      }),
    /BUILDER_RUNTIME_TEST_PROVIDER/,
  );
  assert.throws(
    () => readBuilderRuntimeConfig({ BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT: "0" }),
    /BUILDER_RUNTIME_SUBJECT_REQUEST_LIMIT/,
  );
  assert.throws(
    () =>
      readBuilderRuntimeConfig({
        BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS: "25000",
      }),
    /ALLOW_TEST_HOOKS/,
  );

  assert.throws(
    () =>
      readBuilderRuntimeConfig({
        BUILDER_RUNTIME_REDEEM_CLIENT_ATTEMPT_LIMIT: "10",
        BUILDER_RUNTIME_REDEEM_GLOBAL_ATTEMPT_LIMIT: "5",
      }),
    /REDEEM_GLOBAL_ATTEMPT_LIMIT/,
  );

  const configured = readBuilderRuntimeConfig({
    BUILDER_RUNTIME_ALLOW_TEST_HOOKS: "1",
    BUILDER_RUNTIME_TEST_PROVIDER: "timeout",
    BUILDER_RUNTIME_TEST_PROVIDER_COST_MICROS: "25000",
    BUILDER_RUNTIME_PROVIDER_TIMEOUT_MS: "250",
  });
  assert.equal(configured.testProvider, "timeout");
  assert.equal(configured.testProviderCostMicros, 25_000);
  assert.equal(configured.providerTimeoutMs, 250);
});

function mkdirSafe(directory: string): void {
  mkdirSync(directory, { recursive: true });
}

test.after(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});
