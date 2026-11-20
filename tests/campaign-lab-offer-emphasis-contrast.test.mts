import assert from "node:assert/strict";
import test from "node:test";

import {
  contrast,
  offerBackground,
  paletteTokens,
  pickOfferEmphasisInk,
} from "../src/lib/campaign-lab/brand-review.ts";
import { resolveBrandTheme } from "../src/lib/campaign-lab/fixtures.ts";
import { resolveVisualDirection } from "../src/lib/campaign-lab/visual-directions.ts";
import type { BrandKitSnapshot } from "../src/lib/campaign-lab/brand-review.ts";

test("pale accent-only inputs keep the accent but resolve a readable emphasis ink", () => {
  for (const [brandId, accent] of [
    ["harbor-field", "#f4eee4"],
    ["harbor-field", "#ffffff"],
    ["morrow-ceramic", "#ffffff"],
    ["harbor-field", "#777777"],
  ] as const) {
    const theme = resolveBrandTheme(brandId, accent);
    assert.equal(theme.tokens.accent, accent);
    assert.ok(theme.tokens.offerEmphasisInk);
    assert.ok(
      contrast(
        theme.tokens.offerEmphasisInk,
        offerBackground(theme.tokens),
      ) >= 4.5,
      `${brandId} ${accent} emphasis contrast`,
    );
  }
});

test("normal reviewed accents remain the emphasis foreground", () => {
  for (const [brandId, accent] of [
    ["harbor-field", "#9a3f25"],
    ["harbor-field", "#2f5d4a"],
    ["morrow-ceramic", "#234a6b"],
  ] as const) {
    const theme = resolveBrandTheme(brandId, accent);
    assert.equal(theme.tokens.accent, accent);
    assert.equal(theme.tokens.offerEmphasisInk, accent);
  }
});

test("imported palettes keep their accepted accent and gain a readable emphasis token", () => {
  const snapshot: BrandKitSnapshot = {
    schemaVersion: "ornigami-brand-snapshot/1.0.0",
    draftSchemaVersion: "1.0.0",
    extractorVersion: "ornigami-brand-evidence/1.0.0",
    provenance: "imported-claims-unverified",
    reviewMethod: "local-operator-palette",
    selections: [
      {
        role: "accent",
        value: "#2f5d4a",
        candidateId: "a".repeat(64),
        originalValue: "#2f5d4aff",
        sourceId: "b".repeat(64),
        sourceSha256: "c".repeat(64),
        method: "css-declaration",
        category: "ui-color",
        review: "selected",
      },
    ],
    ownerConfirmed: false,
    campaignFactsApproved: false,
    mediaRightsApproved: false,
    sourceBytesVerified: false,
  };
  const tokens = paletteTokens(
    resolveVisualDirection("clear").tokens,
    snapshot,
  );
  assert.equal(tokens.accent, "#2f5d4a");
  assert.equal(tokens.offerEmphasisInk, "#2f5d4a");
  assert.ok(contrast(tokens.offerEmphasisInk!, offerBackground(tokens)) >= 4.5);
});

test("the emphasis foreground is never below 4.5:1 for arbitrary accent inputs", () => {
  const defaults = resolveVisualDirection("clear").tokens;
  for (let value = 0; value < 0x1000000; value += 0x111111) {
    const accent = `#${value.toString(16).padStart(6, "0")}`;
    const tokens = paletteTokens(defaults, undefined, accent);
    const ink = pickOfferEmphasisInk(tokens);
    assert.ok(
      contrast(ink, offerBackground(tokens)) >= 4.5,
      `${accent} resolved ${ink}`,
    );
  }
});
