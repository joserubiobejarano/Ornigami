import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseArgs, processEvent } from "../scripts/privacy-rights-register.mjs";

const hash = "a".repeat(64);
const NOW = new Date("2026-10-13T10:00:00.000Z");
const received = "2026-10-01T12:00:00Z";

function routeArgs(i: number) {
  return ["route-receipt", "--route", i % 2 ? "privacy" : "support", "--observed-at", "2026-10-03T12:00:00Z", "--result", "delivered", "--evidence-sha256", hash];
}

test("timestamps require a real zoned calendar instant and reject future dates", () => {
  assert.throws(() => parseArgs(["route-receipt", "--route", "privacy", "--observed-at", "2026-02-30T12:00:00Z", "--result", "delivered", "--evidence-sha256", hash], NOW), /invalid_route_receipt/);
  assert.throws(() => parseArgs(["route-receipt", "--route", "privacy", "--observed-at", "2026-10-14T12:00:00Z", "--result", "delivered", "--evidence-sha256", hash], NOW), /invalid_route_receipt/);
  assert.throws(() => parseArgs(["open-case", "--received-at", "2026-10-01", "--type", "erasure", "--evidence-sha256", hash], NOW), /invalid_case/);
  assert.equal(parseArgs(["open-case", "--received-at", "2026-01-31T12:00:00Z", "--type", "erasure", "--evidence-sha256", hash], NOW).responseDueAt, "2026-02-28T12:00:00.000Z");
});

test("register serializes concurrent writes and requires evidenced safeguards and identity before completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "privacy-rights-register-"));
  const env = { ...process.env, XDG_STATE_HOME: root, LOCALAPPDATA: root };
  const options = { env, platform: process.platform, now: NOW };
  try {
    const opened = await processEvent(["open-case", "--received-at", received, "--type", "erasure", "--evidence-sha256", hash], options);
    assert.ok("caseId" in opened && opened.caseId);
    const caseId = (opened as { caseId: string }).caseId;
    const storePath = (opened as { path: string }).path;
    const openedStore = JSON.parse(await readFile(storePath, "utf8"));
    const item = openedStore.cases[0];
    assert.equal(item.id, opened.caseId);
    assert.equal(item.responseDueAt, "2026-11-01T12:00:00.000Z");
    assert.deepEqual(Object.values(item.safeguards as Record<string, { status: string }>).map((check) => check.status), ["pending", "pending", "pending"]);
    if (process.platform !== "win32") assert.equal((await stat(storePath)).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(openedStore).includes("@"), false);

    await Promise.all(Array.from({ length: 5 }, (_, i) => processEvent(routeArgs(i), options)));
    const concurrent = JSON.parse(await readFile(storePath, "utf8"));
    assert.equal(concurrent.routingReceipts.length, 5);
    assert.equal(concurrent.routingReceipts.filter((receipt: { route: string }) => receipt.route === "privacy").length, 2);
    assert.equal(concurrent.routingReceipts.filter((receipt: { route: string }) => receipt.route === "support").length, 3);

    await assert.rejects(processEvent(["update-case", "--case-id", caseId, "--state", "completed", "--outcome-documented", "yes", "--evidence-sha256", hash], options), /case_completion_gates_open/);
    await assert.rejects(processEvent(["update-case", "--case-id", caseId, "--state", "unresolved", "--reason-code", "provider_pending", "--next-review-at", "2026-12-01T10:00:00.000Z", "--evidence-sha256", hash], options), /invalid_case_update/);

    await processEvent(["update-case", "--case-id", caseId, "--state", "unresolved", "--reason-code", "provider_pending", "--next-review-at", "2026-10-20T10:00:00.000Z", "--evidence-sha256", hash], options);
    await assert.rejects(processEvent(["update-case", "--case-id", caseId, "--state", "completed", "--outcome-documented", "yes", "--evidence-sha256", hash], options), /provider_outcome_required/);
    await assert.rejects(processEvent(["update-case", "--case-id", caseId, "--state", "identity_review", "--identity-verified", "yes", "--evidence-sha256", hash], options), /provider_outcome_required/);
    await processEvent(["update-case", "--case-id", caseId, "--state", "identity_review", "--identity-verified", "yes", "--provider-outcome", "documented", "--evidence-sha256", hash], options);
    await processEvent(["update-case", "--case-id", caseId, "--state", "in_progress", "--preserved", "suppression,trial,unresolved", "--evidence-sha256", hash], options);
    await assert.rejects(processEvent(["update-case", "--case-id", caseId, "--state", "completed", "--evidence-sha256", hash], options), /invalid_case_update/);
    await processEvent(["update-case", "--case-id", caseId, "--state", "completed", "--outcome-documented", "yes", "--evidence-sha256", hash], options);

    const final = JSON.parse(await readFile(storePath, "utf8"));
    const completed = final.cases[0];
    assert.equal(completed.status, "completed");
    assert.ok(completed.identityVerifiedAt);
    assert.equal(completed.providerResolutionRequired, false);
    assert.equal(completed.providerResolutionEvidenceSha256, hash);
    assert.ok(completed.events.find((event: { state: string }) => event.state === "unresolved").nextReviewAt);
    assert.ok(Object.values(completed.safeguards as Record<string, { status: string; evidenceSha256: string }>).every((check) => check.status === "verified" && check.evidenceSha256 === hash));
    await writeFile(storePath, JSON.stringify({ format: "invalid", cases: [], routingReceipts: [] }), "utf8");
    await assert.rejects(processEvent(routeArgs(0), options), /register_schema_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("receipt cleanup defaults to dry run and only removes completed verified cases at the 365-day boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "privacy-rights-cleanup-"));
  const env = { ...process.env, XDG_STATE_HOME: root, LOCALAPPDATA: root };
  const cleanupNow = new Date("2026-10-13T10:00:00.000Z");
  const hashB = "b".repeat(64);
  const options = { env, platform: process.platform };
  async function createCompleted(completedAt: Date, evidenceHash: string) {
    const receivedAt = new Date(completedAt.getTime() - 86400000).toISOString();
    const opened = await processEvent(["open-case", "--received-at", receivedAt, "--type", "access", "--evidence-sha256", evidenceHash], { ...options, now: completedAt });
    assert.ok("caseId" in opened && opened.caseId);
    const caseId = opened.caseId!;
    await processEvent(["update-case", "--case-id", caseId, "--state", "identity_review", "--identity-verified", "yes", "--preserved", "suppression,trial,unresolved", "--evidence-sha256", evidenceHash], { ...options, now: completedAt });
    await processEvent(["update-case", "--case-id", caseId, "--state", "completed", "--outcome-documented", "yes", "--evidence-sha256", evidenceHash], { ...options, now: completedAt });
    return caseId;
  }

  try {
    const oldCase = await createCompleted(new Date(cleanupNow.getTime() - 365 * 86400000), hash);
    const newCase = await createCompleted(new Date(cleanupNow.getTime() - 364 * 86400000), hashB);
    const unresolvedOpen = await processEvent(["open-case", "--received-at", "2026-10-01T10:00:00Z", "--type", "erasure", "--evidence-sha256", hash], { ...options, now: cleanupNow });
    assert.ok("caseId" in unresolvedOpen && unresolvedOpen.caseId);
    const unresolvedId = (unresolvedOpen as { caseId: string }).caseId;
    await processEvent(["update-case", "--case-id", unresolvedId, "--state", "unresolved", "--reason-code", "scope_unclear", "--next-review-at", "2026-10-20T10:00:00.000Z", "--evidence-sha256", hash], { ...options, now: cleanupNow });
    await processEvent(["route-receipt", "--route", "privacy", "--observed-at", "2026-10-12T10:00:00Z", "--result", "delivered", "--evidence-sha256", hash], { ...options, now: cleanupNow });

    const storePath = join(root, process.platform === "win32" ? "Ornigami" : "ornigami", "privacy-rights", "register.json");
    const beforeDryRun = await readFile(storePath, "utf8");
    const first = await processEvent(["cleanup"], { ...options, now: cleanupNow });
    assert.deepEqual(first, { eligibleCount: 1, removedCount: 0, dryRun: true });
    assert.equal(await readFile(storePath, "utf8"), beforeDryRun, "dry run leaves register bytes untouched");
    assert.deepEqual(await processEvent(["cleanup", "--apply", "yes"], { ...options, now: cleanupNow }), { eligibleCount: 1, removedCount: 1, dryRun: false });
    const store = JSON.parse(await readFile(storePath, "utf8"));
    assert.equal(store.cases.some((item: { id: string }) => item.id === oldCase), false);
    assert.equal(store.cases.some((item: { id: string }) => item.id === newCase), true);
    assert.equal(store.cases.some((item: { id: string }) => item.id === unresolvedId), true);
    assert.equal(store.routingReceipts.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
