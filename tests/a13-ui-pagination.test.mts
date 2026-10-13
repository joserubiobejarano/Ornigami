import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./a02-test-support.mts";

const workflow = loadTs<{ reconcileReviewDraft(input: {
  hasLocalText: boolean; localText?: string; savedSnapshot?: string;
  remoteText?: string | null; remoteVersion?: number; baseVersion?: number;
}): { draftText?: string; savedSnapshot?: string; version: number; hasUnsavedLocalText: boolean } }>(
  "src/components/reviews/review-workflow.ts",
  {},
);

type PageResponse = {
  items: Array<Record<string, unknown>>;
  page: { nextCursor: string | null; hasMore: boolean };
};

type Inbox = {
  businessId?: string;
  locations: Array<{ name: string; locationName: string; selected?: boolean }>;
  selectedLocation: string;
  setSelectedLocation(location: string): void;
  reviews: Array<Record<string, unknown>>;
  drafts: Record<string, string>;
  setDrafts(update: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)): void;
  savedDraftSnapshots: Record<string, string>;
  loading: boolean;
  pageLoading: boolean;
  hasPrevious: boolean;
  hasMore: boolean;
  error: string | null;
  loadReviews(location?: string): Promise<void>;
  loadLocations(): Promise<void>;
  loadFirstReviews(): Promise<void>;
  loadNextReviews(): Promise<void>;
  loadPreviousReviews(): Promise<void>;
};

function createHarness(
  fetchPage: (location: string, cursor: string | null, businessId?: string) => Promise<PageResponse>,
  fetchLocations: (businessId?: string) => Promise<Array<{ name: string; locationName: string; selected: boolean }>> = async () => [
    { name: "loc-a", locationName: "loc-a", selected: true },
    { name: "loc-b", locationName: "loc-b", selected: true },
  ],
  fetchSettings: () => Promise<{ businessId?: string; role?: string } | null> = async () => ({ businessId: "business-1", role: "owner" }),
) {
  const slots: unknown[] = [];
  const setters: Array<((update: unknown) => void) | undefined> = [];
  const callbacks: Array<{ deps?: unknown[]; callback: (...args: never[]) => unknown } | undefined> = [];
  const effectDeps: Array<unknown[] | undefined> = [];
  const effectCleanups: Array<(() => void) | undefined> = [];
  let cursor = 0;
  let current: Inbox;
  let dirty = false;
  let queuedEffects: Array<() => void> = [];

  const react = {
    useState<T>(initial: T | (() => T)): [T, (update: T | ((current: T) => T)) => void] {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const setState = setters[index] ?? ((update: unknown) => {
        const previous = slots[index] as T;
        const next = typeof update === "function" ? (update as (current: T) => T)(previous) : update as T;
        if (!Object.is(previous, next)) {
          slots[index] = next;
          dirty = true;
        }
      });
      setters[index] = setState;
      return [slots[index] as T, setState as (update: T | ((current: T) => T)) => void];
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: unknown[]) {
      const index = cursor++;
      const previous = callbacks[index];
      const unchanged = deps && previous?.deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps?.[i]));
      if (unchanged) return previous.callback as T;
      callbacks[index] = { deps, callback };
      return callback;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = cursor++;
      const previous = effectDeps[index];
      const changed = !deps || !previous || deps.length !== previous.length || deps.some((value, i) => !Object.is(value, previous[i]));
      if (changed) {
        effectDeps[index] = deps;
        queuedEffects.push(() => {
          effectCleanups[index]?.();
          effectCleanups[index] = effect() || undefined;
        });
      }
    },
  };

  const hook = loadTs<{ useReviewInboxData(hasPaidAccess: boolean): Inbox }>(
    "src/modules/review-replies/hooks/use-review-inbox-data.ts",
    {
      react,
      sonner: { toast: { success() {}, error() {}, warning() {} } },
      "@/modules/review-replies/services/review-replies-api.service": {
        fetchReplySettings: fetchSettings,
        fetchReviewLocations: fetchLocations,
        fetchReviews: (location: string, businessId?: string, cursor?: string | null) => fetchPage(location, cursor ?? null, businessId),
      },
      "@/components/reviews/review-workflow": workflow,
    },
  );

  const render = () => {
    cursor = 0;
    queuedEffects = [];
    current = hook.useReviewInboxData(true);
    const effects = queuedEffects;
    queuedEffects = [];
    for (const effect of effects) effect();
  };
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      dirty = false;
      render();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!dirty && queuedEffects.length === 0) {
        // One extra render observes state updates scheduled by completed effects.
        render();
        if (!dirty && queuedEffects.length === 0) return;
      }
    }
    throw new Error("React hook harness did not settle");
  };
  render();
  return {
    get current() { return current!; },
    async settle() { await settle(); },
    async flush() {
      for (let i = 0; i < 4; i++) {
        dirty = false;
        render();
        await Promise.resolve();
        if (!dirty && queuedEffects.length === 0) return;
      }
    },
    unmount() { for (const cleanup of effectCleanups) cleanup?.(); },
    async act(action: (inbox: Inbox) => void | Promise<void>) {
      await action(current!);
      await settle();
    },
  };
}

test("settings and authorized default locations load in parallel before scoped review reads", async () => {
  let resolveSettings!: (value: { businessId: string; role: "owner" }) => void;
  const settings = new Promise<{ businessId: string; role: "owner" }>((resolve) => { resolveSettings = resolve; });
  let settingsCalls = 0;
  let locationCalls = 0;
  const reviewScopes: Array<string | undefined> = [];
  const harness = createHarness(async (_location, _cursor, businessId) => {
    reviewScopes.push(businessId);
    return { items: [review("scoped", 1, "Saved")], page: { nextCursor: null, hasMore: false } };
  }, async () => {
    locationCalls++;
    return [{ name: "loc-a", locationName: "loc-a", selected: true }];
  }, () => {
    settingsCalls++;
    return settings;
  });

  assert.equal(settingsCalls, 1);
  assert.equal(locationCalls, 1, "locations start before settings resolve");
  await harness.flush();
  assert.deepEqual(reviewScopes, [], "review reads wait for the business scope from settings");
  resolveSettings({ businessId: "business-authorized", role: "owner" });
  await harness.settle();
  assert.deepEqual(reviewScopes, ["business-authorized"]);
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["scoped"]);
});

test("a delayed location response waits for settings before the scoped review read", async () => {
  let resolveLocations!: (value: Array<{ name: string; locationName: string; selected: boolean }>) => void;
  const locations = new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((resolve) => { resolveLocations = resolve; });
  const reviewScopes: Array<string | undefined> = [];
  const harness = createHarness(async (_location, _cursor, businessId) => {
    reviewScopes.push(businessId);
    return { items: [review("delayed-location", 1, "Saved")], page: { nextCursor: null, hasMore: false } };
  }, () => locations);

  await harness.settle();
  assert.equal(harness.current.businessId, "business-1");
  assert.deepEqual(reviewScopes, [], "settings can resolve while locations remain pending");
  resolveLocations([{ name: "loc-a", locationName: "loc-a", selected: true }]);
  await harness.settle();
  assert.deepEqual(reviewScopes, ["business-1"]);
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["delayed-location"]);
});

test("loading stays true through delayed settings, locations, and the first reviews page", async () => {
  let resolveSettings!: (value: { businessId: string; role: "owner" }) => void;
  const settings = new Promise<{ businessId: string; role: "owner" }>((resolve) => { resolveSettings = resolve; });
  let resolveLocations!: (value: Array<{ name: string; locationName: string; selected: boolean }>) => void;
  const locations = new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((resolve) => { resolveLocations = resolve; });
  let resolveReviews!: (value: PageResponse) => void;
  const reviews = new Promise<PageResponse>((resolve) => { resolveReviews = resolve; });
  const harness = createHarness(async () => reviews, () => locations, () => settings);

  await harness.flush();
  assert.equal(harness.current.loading, true, "pending settings and locations keep initial loading active");
  resolveSettings({ businessId: "business-1", role: "owner" });
  resolveLocations([{ name: "loc-a", locationName: "loc-a", selected: true }]);
  await harness.flush();
  assert.equal(harness.current.pageLoading, true, "the first scoped review request has started");
  assert.equal(harness.current.loading, true, "the location response does not expose an empty inbox before reviews settle");
  resolveReviews({ items: [], page: { nextCursor: null, hasMore: false } });
  await harness.settle();
  assert.equal(harness.current.loading, false);
});

test("initial loading settles on an empty location result or failed bootstrap", async () => {
  const noLocations = createHarness(async () => ({ items: [], page: { nextCursor: null, hasMore: false } }), async () => []);
  await noLocations.settle();
  assert.equal(noLocations.current.selectedLocation, "");
  assert.equal(noLocations.current.loading, false);

  const failedBootstrap = createHarness(async () => ({ items: [], page: { nextCursor: null, hasMore: false } }), async () => {
    throw new Error("Locations unavailable");
  }, async () => { throw new Error("Settings unavailable"); });
  await failedBootstrap.settle();
  assert.equal(failedBootstrap.current.loading, false);
  assert.equal(failedBootstrap.current.error, "Locations unavailable");

  let resolveLocations!: (value: Array<{ name: string; locationName: string; selected: boolean }>) => void;
  const delayedLocations = new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((resolve) => { resolveLocations = resolve; });
  const noSettingsScope = createHarness(async () => ({ items: [], page: { nextCursor: null, hasMore: false } }),
    () => delayedLocations, async () => null);
  await noSettingsScope.flush();
  assert.equal(noSettingsScope.current.loading, true, "settings without a businessId still waits for the initial location response");
  resolveLocations([]);
  await noSettingsScope.settle();
  assert.equal(noSettingsScope.current.loading, false);
});

test("a pending location response after unmount is ignored", async () => {
  let resolveLocations!: (value: Array<{ name: string; locationName: string; selected: boolean }>) => void;
  const locations = new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((resolve) => { resolveLocations = resolve; });
  let reviewCalls = 0;
  const harness = createHarness(async () => {
    reviewCalls++;
    return { items: [], page: { nextCursor: null, hasMore: false } };
  }, () => locations);

  await harness.settle();
  harness.unmount();
  resolveLocations([{ name: "loc-a", locationName: "loc-a", selected: true }]);
  await harness.flush();
  assert.deepEqual(harness.current.locations, []);
  assert.equal(harness.current.selectedLocation, "");
  assert.equal(reviewCalls, 0);
});

test("a failed default location read retries once with the settings business scope", async () => {
  const calls: Array<string | undefined> = [];
  const harness = createHarness(async () => ({
    items: [review("first-workspace", 1, "Saved")], page: { nextCursor: null, hasMore: false },
  }), async (businessId) => {
    calls.push(businessId);
    if (!businessId) throw new Error("Workspace is still being created");
    return [{ name: "loc-a", locationName: "loc-a", selected: true }];
  });

  await harness.settle();
  assert.deepEqual(calls, [undefined, "business-1"]);
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["first-workspace"]);
});

test("failed default locations do not retry when settings fails or the hook unmounts", async () => {
  let locationCalls = 0;
  const settingsFailure = createHarness(async () => ({
    items: [], page: { nextCursor: null, hasMore: false },
  }), async () => {
    locationCalls++;
    throw new Error("No workspace yet");
  }, async () => { throw new Error("Settings unavailable"); });
  await settingsFailure.settle();
  assert.equal(locationCalls, 1, "settings failure does not cause a scoped retry");

  let resolveSettings!: (value: { businessId: string; role: "owner" }) => void;
  const settings = new Promise<{ businessId: string; role: "owner" }>((resolve) => { resolveSettings = resolve; });
  let resolveLocations!: (value: Array<{ name: string; locationName: string; selected: boolean }>) => void;
  const locations = new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((resolve) => { resolveLocations = resolve; });
  const unmounted = createHarness(async () => ({ items: [], page: { nextCursor: null, hasMore: false } }),
    async (businessId) => {
      locationCalls++;
      if (businessId) throw new Error("must not retry after unmount");
      return locations;
    }, () => settings);
  unmounted.unmount();
  resolveSettings({ businessId: "business-1", role: "owner" });
  resolveLocations([]);
  await unmounted.flush();
  assert.equal(locationCalls, 2, "only the initial read ran for the unmounted hook");
});

test("a newer location request supersedes the failed bootstrap read and prevents its retry", async () => {
  let rejectInitial!: (error: Error) => void;
  let calls = 0;
  const harness = createHarness(async (location) => ({
    items: [review(location, 1, "Saved")], page: { nextCursor: null, hasMore: false },
  }), async () => {
    calls++;
    if (calls === 1) return new Promise<Array<{ name: string; locationName: string; selected: boolean }>>((_resolve, reject) => { rejectInitial = reject; });
    return [{ name: "loc-new", locationName: "loc-new", selected: true }];
  });

  await harness.flush();
  await harness.act((inbox) => inbox.loadLocations());
  rejectInitial(new Error("late stale failure"));
  await harness.settle();
  assert.equal(calls, 2, "the superseded bootstrap read does not trigger a third request");
  assert.equal(harness.current.selectedLocation, "loc-new");
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["loc-new"]);
});

function review(id: string, version: number, reply: string) {
  return {
    google_review_id: id,
    reviewer_name: id,
    star_rating: 5,
    comment: "A review",
    status: "new",
    draftState: "human_edited",
    draftVersion: version,
    draftUpdatedAt: null,
    draftReply: reply,
    draft_reply: reply,
  };
}

test("a failed location read can be retried without connecting Google or posting a reply", async () => {
  let calls = 0;
  const harness = createHarness(async () => ({
    items: [review("recovered", 1, "Saved")], page: { nextCursor: null, hasMore: false },
  }), async () => {
    if (++calls <= 2) throw new Error("Temporary location read failure");
    return [{ name: "loc-a", locationName: "loc-a", selected: true }];
  });
  await harness.settle();
  assert.equal(calls, 2, "the failed bootstrap read retries once with the resolved business scope");
  assert.equal(harness.current.error, "Temporary location read failure");
  assert.equal(harness.current.selectedLocation, "");
  await harness.act((inbox) => inbox.loadLocations());
  assert.equal(calls, 3);
  assert.equal(harness.current.error, null);
  assert.equal(harness.current.selectedLocation, "loc-a");
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["recovered"]);
});

test("bounded pages preserve an unsaved human edit and its original version while navigating away and back", async () => {
  const calls: Array<{ location: string; cursor: string | null }> = [];
  const harness = createHarness(async (location, cursor) => {
    calls.push({ location, cursor });
    if (cursor === "cursor-page-2") return { items: [review("review-2", 1, "Second")], page: { nextCursor: null, hasMore: false } };
    if (cursor === null) return { items: [review("review-1", 2, "Remote changed")], page: { nextCursor: "cursor-page-2", hasMore: true } };
    throw new Error("unexpected cursor");
  });
  await harness.settle();
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-1"]);
  assert.equal(harness.current.reviews[0].draftVersion, 2);

  await harness.act((inbox) => inbox.setDrafts((previous) => ({ ...previous, "review-1": "My human edit" })));
  await harness.act((inbox) => inbox.loadNextReviews());
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-2"], "only one page is rendered at a time");
  assert.equal(harness.current.hasPrevious, true);
  assert.equal(harness.current.drafts["review-1"], "My human edit");

  await harness.act((inbox) => inbox.loadPreviousReviews());
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-1"]);
  assert.equal(harness.current.drafts["review-1"], "My human edit");
  assert.equal(harness.current.savedDraftSnapshots["review-1"], "Remote changed");
  assert.equal(harness.current.reviews[0].draftVersion, 2, "the stale baseline version remains paired with unsaved text");
  assert.deepEqual(calls.map((call) => call.cursor), [null, "cursor-page-2", null]);
});

test("a failed page request preserves visible rows and retries with the same opaque cursor", async () => {
  const calls: Array<string | null> = [];
  let failContinuation = true;
  const harness = createHarness(async (_location, cursor) => {
    calls.push(cursor);
    if (cursor === "cursor-page-2" && failContinuation) {
      failContinuation = false;
      throw new Error("Temporary page failure");
    }
    return cursor === null
      ? { items: [review("review-1", 1, "Draft")], page: { nextCursor: "cursor-page-2", hasMore: true } }
      : { items: [review("review-2", 1, "Draft 2")], page: { nextCursor: null, hasMore: false } };
  });
  await harness.settle();
  await harness.act((inbox) => inbox.loadNextReviews());
  assert.equal(harness.current.error, "Temporary page failure");
  assert.equal(harness.current.hasMore, true);
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-1"]);

  await harness.act((inbox) => inbox.loadNextReviews());
  assert.equal(harness.current.error, null);
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-2"]);
  assert.deepEqual(calls, [null, "cursor-page-2", "cursor-page-2"]);
});

test("late responses from the previous location cannot replace the newly selected location", async () => {
  let resolveStale!: (value: PageResponse) => void;
  const harness = createHarness((location, cursor) => {
    if (location === "loc-a" && cursor === "stale") return new Promise<PageResponse>((resolve) => { resolveStale = resolve; });
    if (location === "loc-a") return Promise.resolve({ items: [review("review-a", 1, "A")], page: { nextCursor: "stale", hasMore: true } });
    return Promise.resolve({ items: [review("review-b", 1, "B")], page: { nextCursor: null, hasMore: false } });
  });
  await harness.settle();
  let staleLoad!: Promise<void>;
  await harness.act((inbox) => { staleLoad = inbox.loadNextReviews(); });
  // Keep the continuation unresolved while the selected scope changes.
  harness.current.setSelectedLocation("loc-b");
  await harness.settle();
  resolveStale({ items: [review("stale-review", 9, "stale")], page: { nextCursor: null, hasMore: false } });
  await staleLoad;
  await harness.settle();
  assert.equal(harness.current.selectedLocation, "loc-b");
  assert.deepEqual(harness.current.reviews.map((item) => item.google_review_id), ["review-b"]);
});
