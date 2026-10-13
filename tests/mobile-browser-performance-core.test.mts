import assert from "node:assert/strict";
import test from "node:test";
import { maxClsSessionWindow, percentile, summarize, summarizeApiCalls } from "../scripts/mobile-browser-performance-core.mjs";

test("summaries use nearest-rank median and max for small repeatable lab samples", () => {
  assert.equal(percentile([9, 2, 5, 1, 7]), 5);
  assert.deepEqual(summarize([4, 1, 7]), { n: 3, p50: 4, max: 7 });
  assert.deepEqual(summarize([0.00123, 0.00124, 0.00125], 5), { n: 3, p50: 0.00124, max: 0.00125 });
  assert.equal(percentile([], 0.5), null);
});

test("CLS session window excludes recent-input shifts and resets at a one-second gap", () => {
  const shifts = [
    { value: 0.03, startTime: 100, hadRecentInput: false },
    { value: 0.04, startTime: 900, hadRecentInput: false },
    { value: 0.8, startTime: 1000, hadRecentInput: true },
    { value: 0.07, startTime: 2300, hadRecentInput: false },
    { value: 0.02, startTime: 2400, hadRecentInput: false },
  ];
  assert.deepEqual(maxClsSessionWindow(shifts), { value: 0.09, startTime: 2300, endTime: 2400 });
});

test("CLS session cannot roll a suffix past five seconds from the session start", () => {
  const shifts = [0, 900, 1800, 2700, 3600, 4500, 5400].map((startTime) => ({ value: 0.01, startTime, hadRecentInput: false }));
  assert.deepEqual(maxClsSessionWindow(shifts), { value: 0.06, startTime: 0, endTime: 4500 });
  assert.deepEqual(maxClsSessionWindow([
    { value: 0.04, startTime: 0, hadRecentInput: false },
    { value: 0.08, startTime: 5000, hadRecentInput: false },
  ]), { value: 0.08, startTime: 5000, endTime: 5000 });
  assert.deepEqual(maxClsSessionWindow([{ value: 0.0001, startTime: 12, hadRecentInput: false }]), { value: 0.0001, startTime: 12, endTime: 12 });
});

test("CLS session resets at the exact one-second gap boundary", () => {
  assert.deepEqual(maxClsSessionWindow([
    { value: 0.04, startTime: 100, hadRecentInput: false },
    { value: 0.08, startTime: 1100, hadRecentInput: false },
  ]), { value: 0.08, startTime: 1100, endTime: 1100 });
});

test("duplicate API counts aggregate only sanitized method and path", () => {
  assert.deepEqual(summarizeApiCalls([
    { method: "GET", pathname: "/api/a" }, { method: "GET", pathname: "/api/a" },
    { method: "GET", pathname: "/api/b" }, { method: "GET", pathname: "/dashboard" },
  ]), { total: 3, duplicates: [{ request: "GET /api/a", count: 2 }] });
});
