import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { loadTs } from "./a02-test-support.mts";

function loadTsx<T>(relative: string, mocks: Record<string, unknown>): T {
  const filename = resolve(relative);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const loaded: { exports: unknown } = { exports: {} };
  const nativeRequire = createRequire(filename);
  const localRequire = (id: string) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@/")) throw new Error(`Unmocked application dependency: ${id}`);
    return nativeRequire(id);
  };
  const execute = vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename }) as
    (require: typeof localRequire, module: { exports: unknown }, exports: unknown) => void;
  execute(localRequire, loaded, loaded.exports);
  return loaded.exports as T;
}

const reply = "Human reply";
const review = { google_review_id: "review-1", comment: "A review", star_rating: 5, status: "new", draftVersion: 2, draftUpdatedAt: null };

test("manual post only accepts explicit success and never retries uncertain results", async () => {
  const api = loadTs<{ ReplyPostError: new (...args: never[]) => Error & { outcomeUncertain: boolean }; postReviewReply(input: object): Promise<unknown> }>(
    "src/modules/review-replies/services/review-replies-api.service.ts", {},
  );
  const originalFetch = globalThis.fetch;
  try {
    for (const body of [null, { ok: false }, {}]) {
      let calls = 0;
      globalThis.fetch = (async () => { calls += 1; return Response.json(body); }) as typeof fetch;
      await assert.rejects(api.postReviewReply({ reviewId: "r", locationName: "l", reply, expectedVersion: 2 }), (cause: unknown) => {
        assert.ok(cause instanceof api.ReplyPostError);
        assert.equal(cause.outcomeUncertain, true);
        return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("manual post network error, 409 conflict and confirmed success each make one request", async () => {
  const api = loadTs<{ ReplyPostError: new (...args: never[]) => Error & { outcomeUncertain: boolean; currentDraft?: { reply: string | null } | null }; postReviewReply(input: object): Promise<unknown> }>(
    "src/modules/review-replies/services/review-replies-api.service.ts", {},
  );
  const originalFetch = globalThis.fetch;
  const input = { reviewId: "review-1", locationName: "loc-1", reply, expectedVersion: 2 };
  try {
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error("socket closed"); }) as typeof fetch;
    await assert.rejects(api.postReviewReply(input), (cause: unknown) => cause instanceof api.ReplyPostError && cause.outcomeUncertain);
    assert.equal(calls, 1);

    const currentDraft = { replyId: 8, reviewId: "review-1", reply: "Changed elsewhere", state: "human_edited", version: 3, updatedAt: null };
    calls = 0;
    globalThis.fetch = (async () => { calls += 1; return Response.json({ error: "Conflict", currentDraft }, { status: 409 }); }) as typeof fetch;
    await assert.rejects(api.postReviewReply(input), (cause: unknown) => {
      assert.ok(cause instanceof api.ReplyPostError);
      assert.equal(cause.outcomeUncertain, true);
      assert.equal(cause.currentDraft?.reply, currentDraft.reply);
      return true;
    });
    assert.equal(calls, 1);

    const savedDraft = { replyId: 9, reviewId: "review-1", reply, state: "posted", version: 2, updatedAt: null };
    calls = 0;
    globalThis.fetch = (async () => { calls += 1; return Response.json({ ok: true, draft: savedDraft }); }) as typeof fetch;
    assert.deepEqual(await api.postReviewReply(input), savedDraft);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("save completion from the previous location cannot write into the current inbox", async () => {
  const stateSlots: unknown[] = [];
  const refSlots: Array<{ current: unknown }> = [];
  let hookIndex = 0;
  let selectedLocation = "loc-a";
  let captured: Record<string, (...args: never[]) => unknown> | undefined;
  let visibleWrites = 0;
  let resolveSave!: (value: unknown) => void;

  const useReviewInboxData = () => ({
    businessId: "business-1", locations: [], selectedLocation, setSelectedLocation() {}, reviews: [review],
    setReviews() { visibleWrites += 1; }, drafts: { "review-1": reply }, setDrafts() { visibleWrites += 1; },
    savedDraftSnapshots: {}, setSavedDraftSnapshots() { visibleWrites += 1; }, rememberDraftMetadata() {},
    autoReplyAllReviews: false, isOwner: true, loading: false, pageLoading: false, hasPrevious: false, hasMore: false,
    error: null, syncing: false, loadReviews: async () => {}, loadFirstReviews: async () => {}, loadNextReviews: async () => {},
    loadPreviousReviews: async () => {}, syncReviews: async () => {},
  });
  const react = {
    useState<T>(initial: T) {
      const index = hookIndex++;
      if (!(index in stateSlots)) stateSlots[index] = initial;
      return [stateSlots[index] as T, (next: T | ((value: T) => T)) => {
        stateSlots[index] = typeof next === "function" ? (next as (value: T) => T)(stateSlots[index] as T) : next;
      }] as const;
    },
    useRef<T>(initial: T) {
      const index = hookIndex++;
      refSlots[index] ??= { current: initial };
      return refSlots[index] as { current: T };
    },
    useEffect() { hookIndex += 1; },
  };
  const jsxRuntime = {
    jsx(type: unknown, props: Record<string, unknown>) {
      if (typeof type === "function") return (type as (props: Record<string, unknown>) => unknown)(props);
      return { type, props };
    },
    jsxs(type: unknown, props: Record<string, unknown>) {
      if (typeof type === "function") return (type as (props: Record<string, unknown>) => unknown)(props);
      return { type, props };
    },
  };
  const page = loadTsx<{ default(): unknown }>("src/modules/review-replies/pages/reviews-page.tsx", {
    react,
    "react/jsx-runtime": jsxRuntime,
    "@/components/dashboard": { DashboardCallout: "callout", DashboardEmptyState: "empty", DashboardPage: "page", DashboardPageHeader: "header" },
    "@/components/ui/button": { Button: "button" },
    "@/lib/utils": { cn: (...parts: string[]) => parts.join(" ") },
    "@/lib/form-controls": { nativeSelectClassName: "select" },
    "@/components/ui/skeleton": { Skeleton: "skeleton" },
    sonner: { toast: { error() {}, info() {}, success() {} } },
    "@/components/reviews/review-list": { ReviewList: (props: Record<string, (...args: never[]) => unknown>) => { captured = props; return { type: "list", props: {} }; } },
    "@/lib/stream-client": { readTextStream: async () => {} },
    "@/modules/review-replies/hooks/use-review-inbox-data": { useReviewInboxData },
    "@/modules/review-replies/components/review-inbox-summary": { ReviewInboxSummary: "summary" },
    "@/components/reviews/review-workflow": { hasDraftChangedSince: (current: string | undefined, initial: string) => current !== initial, shouldShowTestWorkflowActions: () => false },
    "@/modules/review-replies/services/review-replies-api.service": {
      DraftVersionConflictError: class extends Error { currentDraft = null; },
      ReplyPostError: class extends Error { outcomeUncertain = true; },
      postReviewReply: async () => null,
      saveReviewDraft: async () => new Promise((resolve) => { resolveSave = resolve; }),
    },
  });
  const render = () => { hookIndex = 0; page.default(); };
  render();
  assert.ok(captured?.onSaveDraft);
  captured!.onSaveDraft(review as never);
  await Promise.resolve();
  assert.ok(resolveSave, "save operation started and is still pending");

  selectedLocation = "loc-b";
  render();
  resolveSave({ replyId: 4, reviewId: review.google_review_id, reply, state: "human_edited", version: 3, updatedAt: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(visibleWrites, 0, "old-location save does not mutate the newly visible location's rows or drafts");
});
