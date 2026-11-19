import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { BrandEvidenceFileReader, parseBrandEvidence, reviewPalette, paletteTokens } from "../src/lib/campaign-lab/brand-review.ts";
import { resolveVisualDirection } from "../src/lib/campaign-lab/visual-directions.ts";

const raw = readFileSync(new URL("../docs/examples/brand-review/fjord/evidence.json", import.meta.url), "utf8");
const draft = parseBrandEvidence(raw);
const candidate = draft.candidates.find(candidate => candidate.observed === "#163f64ff")!;
const choices = { accent: { candidateId: candidate.id, value: "#163f64" } };
const clear = resolveVisualDirection("clear").tokens;
const editorial = resolveVisualDirection("editorial").tokens;

test("external accent correction/removal and direction changes revalidate current evidence", () => {
  const before = JSON.stringify(draft);
  assert.match(reviewPalette(draft, choices, clear, "#ffffff").error!, /contrast/);
  const corrected = reviewPalette(draft, choices, clear, "#123456");
  assert.ok(corrected.snapshot);
  assert.equal(paletteTokens(clear, corrected.snapshot, "#123456").accent, "#123456");
  assert.equal(paletteTokens(clear, reviewPalette(draft, choices, clear).snapshot).accent, "#163f64");
  const boundary = { accent: { ...choices.accent, value: "#646464" } };
  assert.match(reviewPalette(draft, boundary, editorial).error!, /contrast/);
  assert.ok(reviewPalette(draft, boundary, clear).snapshot);
  assert.match(reviewPalette(draft, boundary, editorial).error!, /contrast/);
  assert.equal(JSON.stringify(draft), before);
  assert.equal(corrected.snapshot.ownerConfirmed, false);
  assert.equal(corrected.snapshot.campaignFactsApproved, false);
  assert.equal(corrected.snapshot.mediaRightsApproved, false);
  assert.equal(corrected.snapshot.sourceBytesVerified, false);
});

test("alpha, invalid correction and absent references cannot produce an applyable snapshot", () => {
  const alpha = draft.candidates.find(candidate => candidate.observed === "#12345680")!;
  for (const value of ["", "#12345680", "white"]) {
    assert.ok(reviewPalette(draft, { accent: { candidateId: alpha.id, value } }, clear).error);
  }
  assert.ok(reviewPalette(draft, { accent: { candidateId: alpha.id, value: "#123456" } }, clear).snapshot);
  assert.ok(reviewPalette(draft, { accent: { candidateId: "missing", value: "#123456" } }, clear).error);
});

test("latest invalid import remains authoritative after old valid read and external correction", async () => {
  const reader = new BrandEvidenceFileReader();
  let finish!: (value: string) => void;
  const old = reader.read({ size: raw.length, text: () => new Promise(resolve => { finish = resolve; }) });
  const latest = await reader.read({ size: 1, text: async () => "{" });
  assert.equal(latest.stale, false);
  if (latest.stale) return;
  assert.ok(latest.error);
  assert.equal(latest.draft, undefined);
  assert.ok(reviewPalette(draft, choices, clear, "#123456").snapshot);
  finish(raw);
  assert.deepEqual(await old, { stale: true });
  assert.ok(latest.error);
  assert.equal(latest.draft, undefined);
});
