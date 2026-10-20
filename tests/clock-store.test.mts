import assert from "node:assert/strict";
import test from "node:test";

import { createClockStore } from "../src/lib/clock-store.ts";

test("team clock publishes the initial client time, ticks, and clears its timer after unsubscribe", () => {
  let now = 1_000;
  let callback: (() => void) | undefined;
  let cleared = 0;
  const store = createClockStore({
    serverSnapshot: 0,
    refreshMs: 60_000,
    now: () => now,
    setTimer: (next, milliseconds) => {
      assert.equal(milliseconds, 60_000);
      callback = next;
      return 1;
    },
    clearTimer: (timer) => {
      assert.equal(timer, 1);
      cleared += 1;
    },
  });
  let updates = 0;
  const unsubscribe = store.subscribe(() => { updates += 1; });
  assert.equal(store.getServerSnapshot(), 0);
  assert.equal(store.getSnapshot(), 1_000);
  now = 5_000;
  store.refresh();
  assert.equal(store.getSnapshot(), 5_000);
  assert.equal(updates, 1);
  now = 61_000;
  callback?.();
  assert.equal(store.getSnapshot(), 61_000);
  assert.equal(updates, 2);
  unsubscribe();
  assert.equal(cleared, 1);
  assert.equal(store.getSnapshot(), null);
});

test("recent-visit clock captures hydration time once without starting a timer", () => {
  let now = 5_000;
  let timerRequested = false;
  const store = createClockStore({
    serverSnapshot: null,
    refreshMs: null,
    now: () => now,
    setTimer: () => { timerRequested = true; return 1; },
    clearTimer: () => undefined,
  });
  const unsubscribe = store.subscribe(() => undefined);
  assert.equal(store.getServerSnapshot(), null);
  assert.equal(store.getSnapshot(), 5_000);
  now = 10_000;
  assert.equal(store.getSnapshot(), 5_000);
  unsubscribe();
  assert.equal(timerRequested, false);
});
