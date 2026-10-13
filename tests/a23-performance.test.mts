import assert from "node:assert/strict";
import test from "node:test";
import { assessSamples, isLocalFixtureRedirect, nearestRankPercentile, summarizeSamples } from "../scripts/a23-performance-core.mjs";

test("nearest-rank percentile uses ceil(p*n) and leaves its input untouched", () => {
  const values = [9, 1, 7, 2, 3, 8, 5, 4, 6, 10];
  const before = [...values];
  assert.equal(nearestRankPercentile(values, 0.95), 10);
  assert.equal(nearestRankPercentile(values, 0.5), 5);
  assert.deepEqual(values, before);
});

test("sample summary reports nearest-rank p50 and p95 over full-body durations", () => {
  const summary = summarizeSamples(Array.from({ length: 30 }, (_, index) => ({ durationMs: index + 1 })));
  assert.deepEqual(summary, { count: 30, p50Ms: 15, p95Ms: 29, maxMs: 30 });
});

test("percentile rejects empty, invalid and out-of-range inputs", () => {
  assert.throws(() => nearestRankPercentile([], 0.95), TypeError);
  assert.throws(() => nearestRankPercentile([1, Number.NaN], 0.95), TypeError);
  assert.throws(() => nearestRankPercentile([1], 0), RangeError);
  assert.throws(() => nearestRankPercentile([1], 1.01), RangeError);
});

test("latency gate permits a slow tail within p95 while requiring enough clean samples", () => {
  const samples = Array.from({ length: 40 }, (_, index) => ({ durationMs: index < 2 ? 3200 : 100, ok: true }));
  const result = assessSamples(samples, { minimum: 40, latencyLimitMs: 3000 });
  assert.equal(result.p95Ms, 100);
  assert.equal(result.slowCount, 2);
  assert.equal(result.pass, true);
});

test("latency gate fails p95 violations, unexpected errors and inadequate sample counts", () => {
  const slowTail = Array.from({ length: 40 }, (_, index) => ({ durationMs: index < 3 ? 3201 : 100, ok: true }));
  assert.equal(assessSamples(slowTail, { minimum: 40 }).pass, false);
  const failed = Array.from({ length: 40 }, (_, index) => ({ durationMs: 10, ok: index !== 0 }));
  assert.equal(assessSamples(failed, { minimum: 40 }).pass, false);
  assert.equal(assessSamples(failed.slice(0, 39), { minimum: 40 }).pass, false);
});

test("Auth.js callback redirect accepts only the A20 loopback host and fixture port", () => {
  const base = new URL("http://127.0.0.1:43127");
  assert.equal(isLocalFixtureRedirect("http://127.0.0.1:43127/dashboard", base), true);
  assert.equal(isLocalFixtureRedirect("http://localhost:43127/dashboard", base), true);
  assert.equal(isLocalFixtureRedirect("/dashboard", base), true);
  assert.equal(isLocalFixtureRedirect("http://localhost:43128/dashboard", base), false);
  assert.equal(isLocalFixtureRedirect("https://localhost:43127/dashboard", base), false);
  assert.equal(isLocalFixtureRedirect("http://example.com:43127/dashboard", base), false);
  assert.equal(isLocalFixtureRedirect("http://user@localhost:43127/dashboard", base), false);
  assert.equal(isLocalFixtureRedirect(undefined, base), false);
});
