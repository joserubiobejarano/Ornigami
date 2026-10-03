import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./auth-test-harness.mts";

const pagination = loadTs<typeof import("../src/lib/dashboard-pagination.js")>("src/lib/dashboard-pagination.ts");

test("A13 dashboard cursors are bounded, scope-bound and preserve stable keyset positions", () => {
  assert.equal(pagination.parseDashboardPageSize(null), 50);
  assert.equal(pagination.parseDashboardPageSize("1"), 1);
  assert.equal(pagination.parseDashboardPageSize("999"), 100);
  assert.equal(pagination.parseDashboardPageSize("0"), null);
  assert.equal(pagination.parseDashboardPageSize("1.5"), null);

  const cursor = pagination.encodeDashboardCursor({
    scope: '["business-a","location-a"]',
    timestamp: "2026-10-03 14:59:01.123456+00",
    id: "9223372036854775806",
  });
  assert.equal(JSON.stringify(pagination.decodeDashboardCursor(cursor, '["business-a","location-a"]')), JSON.stringify({
    scope: '["business-a","location-a"]',
    timestamp: "2026-10-03 14:59:01.123456+00",
    id: "9223372036854775806",
  }));
  assert.throws(() => pagination.decodeDashboardCursor(cursor, '["business-b","location-a"]'), /Invalid pagination cursor/);
  assert.throws(() => pagination.decodeDashboardCursor("%%%", '["business-a","location-a"]'), /Invalid pagination cursor/);
  assert.throws(() => pagination.decodeDashboardCursor(pagination.encodeDashboardCursor({
    scope: "x", timestamp: "2026-02-31 11:00:00+00", id: "1",
  }), "x"), /Invalid pagination cursor/);
  assert.throws(() => pagination.decodeDashboardCursor(pagination.encodeDashboardCursor({
    scope: "x", timestamp: "0000-02-29 11:00:00+00", id: "1",
  }), "x"), /Invalid pagination cursor/);
  const visitCursor = pagination.encodeDashboardCursor({
    scope: "visits", timestamp: "2026-10-03 14:59:01.123456+00", id: "00000000-0000-4000-8000-000000000001",
  });
  assert.throws(() => pagination.decodeDashboardCursor(visitCursor, "visits", { idType: "bigint" }), /Invalid pagination cursor/);
  assert.throws(() => pagination.decodeDashboardCursor(pagination.encodeDashboardCursor({
    scope: "visits", timestamp: null, id: "00000000-0000-4000-8000-000000000001",
  }), "visits", { idType: "uuid", timestampNullable: false }), /Invalid pagination cursor/);
  assert.throws(() => pagination.decodeDashboardCursor(pagination.encodeDashboardCursor({
    scope: "x", timestamp: null, id: "9223372036854775808",
  }), "x"), /Invalid pagination cursor/);
});

test("A13 page construction hides cursor fields and returns the last visible row position", () => {
  const source = [
    { google_review_id: "review-3", cursorId: "3", cursorTimestamp: null },
    { google_review_id: "review-2", cursorId: "2", cursorTimestamp: null },
    { google_review_id: "review-1", cursorId: "1", cursorTimestamp: null },
  ];
  const result = pagination.createDashboardPage(source, 2, "business/location");
  assert.equal(JSON.stringify(result.items), JSON.stringify([{ google_review_id: "review-3" }, { google_review_id: "review-2" }]));
  assert.equal(result.page.hasMore, true);
  assert.equal(JSON.stringify(pagination.decodeDashboardCursor(result.page.nextCursor, "business/location")), JSON.stringify({
    scope: "business/location", timestamp: null, id: "2",
  }));
  const last = pagination.createDashboardPage(source.slice(0, 2), 2, "business/location");
  assert.equal(last.page.nextCursor, null);
  assert.equal(last.page.hasMore, false);
});
