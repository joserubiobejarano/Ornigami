import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

type Workflow = {
  canGenerateReplyDraft(review: { google_review_id: string; status: string; draftState?: string }, draftText: string, saved: Record<string, string>): boolean;
  requiresManualReplyApproval(rating: number | null | undefined): boolean;
  hasDraftChangedSince(currentText: string | undefined, startingText: string): boolean;
  reconcileReviewDraft(input: {
    hasLocalText: boolean;
    localText?: string;
    savedSnapshot?: string;
    remoteText?: string | null;
    remoteVersion?: number;
    baseVersion?: number;
  }): { draftText?: string; savedSnapshot?: string; version: number; hasUnsavedLocalText: boolean };
};

const workflow = loadTs<Workflow>("src/components/reviews/review-workflow.ts", {});

test("Generate is available only for an unanswered review without an existing or local draft", () => {
  const review = { google_review_id: "r1", status: "new" };
  assert.equal(workflow.canGenerateReplyDraft(review, "", {}), true);
  assert.equal(workflow.canGenerateReplyDraft(review, "human text", {}), false);
  assert.equal(workflow.canGenerateReplyDraft(review, "", { r1: "saved AI text" }), false);
  assert.equal(workflow.canGenerateReplyDraft({ ...review, draftState: "human_edited" }, "", {}), false);
  assert.equal(workflow.canGenerateReplyDraft({ ...review, status: "replied" }, "", {}), false);
});

test("Only known 4- and 5-star ratings can skip manual approval", () => {
  assert.equal(workflow.requiresManualReplyApproval(4), false);
  assert.equal(workflow.requiresManualReplyApproval(5), false);
  for (const rating of [undefined, null, 0, 1, 2, 3, 6]) {
    assert.equal(workflow.requiresManualReplyApproval(rating), true, `rating ${rating} must be approved manually`);
  }
});

test("refresh keeps unsaved text and its old version when the remote draft advances", () => {
  const merged = workflow.reconcileReviewDraft({
    hasLocalText: true,
    localText: "my unsaved edit",
    savedSnapshot: "old saved text",
    remoteText: "another editor's text",
    remoteVersion: 3,
    baseVersion: 2,
  });
  assert.deepEqual(merged, {
    draftText: "my unsaved edit",
    savedSnapshot: "old saved text",
    version: 2,
    hasUnsavedLocalText: true,
  });
});

test("clean local state adopts the refreshed saved text and version", () => {
  const merged = workflow.reconcileReviewDraft({
    hasLocalText: true,
    localText: "old saved text",
    savedSnapshot: "old saved text",
    remoteText: "new saved text",
    remoteVersion: 4,
    baseVersion: 3,
  });
  assert.deepEqual(merged, {
    draftText: "new saved text",
    savedSnapshot: "new saved text",
    version: 4,
    hasUnsavedLocalText: false,
  });
});

test("first Generate treats an absent local draft as unchanged, but preserves new typing during the request", () => {
  assert.equal(workflow.hasDraftChangedSince(undefined, ""), false);
  assert.equal(workflow.hasDraftChangedSince("written while waiting", ""), true);
});
