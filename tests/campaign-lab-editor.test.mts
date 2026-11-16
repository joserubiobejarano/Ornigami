import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVERTORIAL_MANIFEST,
  assessAdvertorialFit,
} from "../src/lib/campaign-lab/advertorial.ts";
import {
  createEditorPreviewState,
  createPreviewImageGate,
  recordPreviewImageEvent,
  retryPreviewImage,
  summarizePreviewImages,
} from "../src/lib/campaign-lab/editor.ts";
import type {
  PreviewImageEvent,
  PreviewImageGate,
} from "../src/lib/campaign-lab/editor.ts";
import {
  BASE_CATALOG,
  CAMPAIGN_FIXTURES,
  createFormValues,
} from "../src/lib/campaign-lab/fixtures.ts";
import type {
  CampaignCatalog,
  CampaignFixture,
  ProductFact,
} from "../src/lib/campaign-lab/types.ts";

function catalogWith(fixture: CampaignFixture): CampaignCatalog {
  return {
    ...BASE_CATALOG,
    fixtures: { ...BASE_CATALOG.fixtures, [fixture.id]: fixture },
  };
}

function fourFactFixture(): CampaignFixture {
  const source = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const finish: ProductFact = {
    id: "finish",
    label: "Finish",
    value: "Matte glaze",
    source: {
      document: "Morrow Ceramic approved product sheet",
      quote: "Finish: matte glaze.",
      reviewedBy: "Ornigami content review",
      reviewedOn: "2026-11-12",
    },
  };
  return {
    ...source,
    id: "sparse",
    label: "Four required facts review",
    brief: {
      ...source.brief,
      fixtureId: "sparse",
      productFacts: [...source.brief.productFacts, finish],
      requiredFactGroups: [
        {
          id: "rib-design",
          label: "the rib design",
          factIds: ["interior", "outlet", "body", "finish"],
        },
      ],
    },
  };
}

function loadedEvent(
  revision: string,
  assetId: string,
  attempt = 0,
  status: PreviewImageEvent["status"] = "loaded",
): PreviewImageEvent {
  return { revision, assetId, attempt, status };
}

function loadAll(
  gate: PreviewImageGate,
  revision: string,
  assetIds: readonly string[],
  attempt = 0,
): PreviewImageGate {
  return assetIds.reduce(
    (current, assetId) =>
      recordPreviewImageEvent(current, loadedEvent(revision, assetId, attempt)),
    gate,
  );
}

test("a four-fact pilot opens the editor with its validation issue instead of throwing", () => {
  const fixture = fourFactFixture();
  const catalog = catalogWith(fixture);
  const values = createFormValues(fixture, catalog);
  const state = createEditorPreviewState(fixture, values, catalog);

  assert.equal(state.preview, null);
  assert.equal(state.dirty, true);
  assert.ok(state.issues.length > 0);
  assert.match(
    state.issues[0]?.message ?? "",
    /Required fact group "the rib design" has 4 facts.*at most 3/,
  );
  assert.equal(state.issues[0]?.field, "advertorialLayout");
});

test("a four-fact required group never offers a nominal compatible layout", () => {
  const fixture = fourFactFixture();
  const catalog = catalogWith(fixture);
  const fit = assessAdvertorialFit(fixture, createFormValues(fixture, catalog), catalog);

  assert.equal(fit.fit, false);
  assert.equal(fit.compatibleLayout, undefined);
  assert.equal(fit.recommended, "single-product-offer");
  assert.ok(
    fit.missingInputs.some((message) => /has 4 facts.*at most 3/.test(message)),
  );
});

test("a valid preview still opens on first load", () => {
  const fixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const state = createEditorPreviewState(fixture, createFormValues(fixture));

  assert.ok(state.preview);
  assert.equal(state.dirty, false);
  assert.deepEqual(state.issues, []);
  assert.equal(state.preview.draft.layout, "advertorial-full");
});

test("approval waits for every image assigned to the current revision", () => {
  const fixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const state = createEditorPreviewState(fixture, createFormValues(fixture));
  assert.ok(state.preview);
  const revision = state.preview.revision;
  const assetIds = summarizePreviewImages(
    state.preview,
    createPreviewImageGate(revision),
  ).requiredAssetIds;
  assert.deepEqual(assetIds.sort(), [
    "morrow-ceramic-dripper-front",
    "morrow-prototype",
    "morrow-ribs",
  ]);

  let gate = createPreviewImageGate(revision);
  let summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.pendingAssetIds.sort(), assetIds.sort());

  gate = loadAll(gate, revision, assetIds.slice(0, 2));
  summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.pendingAssetIds, [assetIds[2]]);

  gate = loadAll(gate, revision, assetIds.slice(2));
  summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.failedAssetIds, []);
});

test("a failed required image blocks approval until its retry loads", () => {
  const fixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const state = createEditorPreviewState(fixture, createFormValues(fixture));
  assert.ok(state.preview);
  const revision = state.preview.revision;
  const assetIds = summarizePreviewImages(
    state.preview,
    createPreviewImageGate(revision),
  ).requiredAssetIds;
  const failedId = assetIds[1];
  const otherIds = assetIds.filter((assetId) => assetId !== failedId);

  let gate = createPreviewImageGate(revision);
  gate = loadAll(gate, revision, otherIds);
  gate = recordPreviewImageEvent(gate, loadedEvent(revision, failedId, 0, "error"));

  let summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.failedAssetIds, [failedId]);

  gate = retryPreviewImage(gate, revision, failedId);
  summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.pendingAssetIds, [failedId]);

  // An event for the failed first attempt cannot satisfy the retry.
  gate = recordPreviewImageEvent(gate, loadedEvent(revision, failedId, 0));
  summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, false);

  gate = recordPreviewImageEvent(gate, loadedEvent(revision, failedId, 1));
  summary = summarizePreviewImages(state.preview, gate);
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.failedAssetIds, []);
});

test("an image event from a superseded preview never unlocks the current approval", () => {
  const fixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const values = createFormValues(fixture);
  const first = createEditorPreviewState(fixture, values);
  const edited = createEditorPreviewState(
    fixture,
    { ...values, offer: "Free shipping through 31 December 2026" },
  );
  assert.ok(first.preview);
  assert.ok(edited.preview);
  assert.notEqual(first.preview.revision, edited.preview.revision);

  const currentRevision = edited.preview.revision;
  const currentAssets = summarizePreviewImages(
    edited.preview,
    createPreviewImageGate(currentRevision),
  ).requiredAssetIds;
  const oldAssets = summarizePreviewImages(
    first.preview,
    createPreviewImageGate(first.preview.revision),
  ).requiredAssetIds;
  assert.deepEqual(currentAssets.sort(), [...oldAssets].sort());

  let gate = createPreviewImageGate(first.preview.revision);
  gate = loadAll(gate, first.preview.revision, oldAssets);

  // Simulate a late event from the superseded preview after the edit.
  gate = recordPreviewImageEvent(
    gate,
    loadedEvent(first.preview.revision, oldAssets[0]),
  );
  let summary = summarizePreviewImages(edited.preview, gate);
  assert.equal(summary.ready, false);
  assert.deepEqual(summary.statuses, Object.fromEntries(currentAssets.map((id) => [id, "pending"])));

  gate = loadAll(gate, currentRevision, currentAssets);
  summary = summarizePreviewImages(edited.preview, gate);
  assert.equal(summary.ready, true);
});

test("both advertorial layouts remain available with the complete three-fact group", () => {
  const full = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
  const onePhoto = CAMPAIGN_FIXTURES["morrow-advertorial-one-photo"];
  const fullState = createEditorPreviewState(full, createFormValues(full));
  const onePhotoState = createEditorPreviewState(onePhoto, createFormValues(onePhoto));

  assert.ok(fullState.preview);
  assert.ok(onePhotoState.preview);
  assert.equal(fullState.preview.draft.layout, "advertorial-full");
  assert.equal(onePhotoState.preview.draft.layout, "advertorial-one-photo");
  assert.deepEqual(
    fullState.preview.draft.facts.map((fact) => fact.id),
    ["interior", "outlet", "body"],
  );
  assert.deepEqual(
    onePhotoState.preview.draft.facts.map((fact) => fact.id),
    ["interior", "outlet", "body"],
  );
  assert.equal(
    ADVERTORIAL_MANIFEST.layouts["advertorial-full"].maxFacts,
    3,
  );
  assert.equal(
    ADVERTORIAL_MANIFEST.layouts["advertorial-one-photo"].maxFacts,
    3,
  );
});
