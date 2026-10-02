import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

type Draft = { replyId: number | null; reviewId: string; reply: string | null; state: string; version: number; updatedAt: string | null };
type Api = {
  saveReviewDraft(input: { businessId?: string; reviewId: string; reply: string; expectedVersion: number }): Promise<Draft>;
  DraftVersionConflictError: new(message: string, draft: Draft | null) => Error & { currentDraft: Draft | null };
};

const api = loadTs<Api>("src/modules/review-replies/services/review-replies-api.service.ts", {});

test("Save sends the workspace, current human text, and the version the edit was based on", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ ok: true, draft: {
      replyId: 19, reviewId: "review-1", reply: "edited response", state: "human_edited", version: 3, updatedAt: null,
    } });
  };
  try {
    const saved = await api.saveReviewDraft({
      businessId: "business-1", reviewId: "review-1", reply: "edited response", expectedVersion: 2,
    });
    assert.deepEqual(requestBody, {
      businessId: "business-1", reviewId: "review-1", reply: "edited response", expectedVersion: 2,
    });
    assert.equal(saved.version, 3);
    assert.equal(saved.reply, "edited response");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("409 keeps the server's current version available for an explicit user reload", async () => {
  const previousFetch = globalThis.fetch;
  const currentDraft: Draft = {
    replyId: 24, reviewId: "review-1", reply: "the other saved version", state: "human_edited", version: 5, updatedAt: null,
  };
  globalThis.fetch = async () => Response.json({
    ok: false, code: "conflict", error: "Draft changed; reload it before saving", currentDraft,
  }, { status: 409 });
  try {
    await assert.rejects(
      api.saveReviewDraft({ reviewId: "review-1", reply: "my preserved text", expectedVersion: 4 }),
      (error: unknown) => error instanceof api.DraftVersionConflictError && error.currentDraft?.version === 5
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
