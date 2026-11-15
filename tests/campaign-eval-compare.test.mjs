import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBlindSheet,
  compareDraftPair,
  loadArtifacts,
  loadPack,
} from "../scripts/campaign-eval-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "tests", "fixtures", "campaign-eval");
const packFile = path.join(fixtures, "cases.json");

function loadedPack() {
  return loadPack(packFile);
}

function baseline() {
  return loadArtifacts(path.join(fixtures, "baseline"));
}

function generated() {
  return loadArtifacts(path.join(fixtures, "samples", "generated"));
}

function compare(caseId) {
  const loaded = loadedPack();
  return {
    loaded,
    caseDef: loaded.casesById.get(caseId),
    result: compareDraftPair(
      baseline().drafts.get(caseId),
      generated().drafts.get(caseId),
      loaded.casesById.get(caseId),
      loaded.pack,
    ),
  };
}

function check(result, id) {
  return result.checks.find((item) => item.id === id);
}

test("identical fallback and generated drafts are called out explicitly", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const artifact = baseline().drafts.get("sparse-offer");
  const result = compareDraftPair(artifact, artifact, caseDef, loaded.pack);
  assert.equal(result.identical, true);
  assert.match(result.changes[0], /Identical drafts/);
  assert.equal(check(result, "image-identity").state, "passed");
  assert.equal(check(result, "offer-preserved").state, "passed");
});

test("a changed opening is reported without changing identity", () => {
  const { result } = compare("sparse-offer");
  assert.equal(result.identical, false);
  assert.equal(result.opening.headline.changed, true);
  assert.equal(result.opening.lede.changed, true);
  assert.equal(result.sections.changed, false);
  assert.equal(result.evidence.facts.same, true);
  assert.equal(check(result, "product-preserved").state, "passed");
  assert.equal(check(result, "offer-preserved").state, "passed");
  assert.equal(check(result, "destination-preserved").state, "passed");
  assert.equal(check(result, "image-identity").state, "passed");
  assert.ok(result.changes.some((change) => change.startsWith("Headline:")));
});

test("a changed section order and added evidence are reported separately", () => {
  const { result } = compare("rich-angle");
  assert.equal(result.identical, false);
  assert.equal(result.sections.changed, true);
  assert.deepEqual(result.sections.before, ["hero", "detail", "close"]);
  assert.deepEqual(result.sections.after, ["angle", "evidence", "detail", "close"]);
  assert.ok(result.sections.added.includes("evidence"));
  assert.ok(result.evidence.assets.added.includes("morrow-prototype"));
  assert.ok(result.evidence.assets.added.includes("morrow-ribs"));
  assert.equal(check(result, "image-identity").state, "passed");
  assert.ok(result.changes.some((change) => change.startsWith("Section order:")));
});

test("an offer change fails identity even when the rest of the draft matches", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const fallback = baseline().drafts.get("sparse-offer");
  const changed = structuredClone(generated().drafts.get("sparse-offer"));
  changed.campaign.offer = "25% off, 27–30 November 2026";
  const result = compareDraftPair(fallback, changed, caseDef, loaded.pack);
  assert.equal(check(result, "offer-preserved").state, "failed");
  assert.equal(check(result, "same-template-and-brief").state, "failed");
});

test("an unapproved fact fails the approved-facts check", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const fallback = baseline().drafts.get("sparse-offer");
  const changed = structuredClone(generated().drafts.get("sparse-offer"));
  changed.draft.facts.push({ label: "Weight", value: "1 kg" });
  const result = compareDraftPair(fallback, changed, caseDef, loaded.pack);
  assert.equal(check(result, "approved-facts-preserved").state, "failed");
});

test("a pilot comparison verifies each draft against its manifest facts", () => {
  const loaded = loadedPack();
  const original = loaded.casesById.get("sparse-offer");
  const fallback = baseline().drafts.get("sparse-offer");
  const requiredFact = original.approvedFacts.find((fact) =>
    fallback.draft.facts.some(({ label, value }) => label === fact.label && value === fact.value),
  );
  assert.ok(requiredFact);
  const pilot = {
    ...original,
    pilot: true,
    expected: { draft: { requiredFactIds: [requiredFact.id] } },
  };
  const incomplete = structuredClone(fallback);
  incomplete.draft.facts = incomplete.draft.facts.filter(({ label }) => label !== requiredFact.label);
  const invented = structuredClone(fallback);
  invented.draft.facts.push({ label: "Weight", value: "1 kg" });

  assert.equal(check(compareDraftPair(fallback, fallback, pilot, loaded.pack), "approved-facts-preserved").state, "passed");
  assert.equal(check(compareDraftPair(fallback, incomplete, pilot, loaded.pack), "approved-facts-preserved").state, "failed");
  assert.equal(check(compareDraftPair(invented, invented, pilot, loaded.pack), "approved-facts-preserved").state, "failed");
});

test("a different product image fails image identity", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const fallback = baseline().drafts.get("sparse-offer");
  const changed = structuredClone(generated().drafts.get("sparse-offer"));
  changed.draft.assetIds = ["not-an-approved-asset"];
  const result = compareDraftPair(fallback, changed, caseDef, loaded.pack);
  assert.equal(check(result, "image-identity").state, "failed");
});

test("the reviewer sheet uses neutral capture names and decision fields", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const artifact = baseline().drafts.get("sparse-offer");
  const result = compareDraftPair(artifact, artifact, caseDef, loaded.pack);
  const blind = buildBlindSheet({
    loaded,
    runId: "test-run",
    seed: "test-seed",
    pairs: [{
      caseId: caseDef.id,
      identical: result.identical,
      options: [
        { source: "fallback", file: "fallback.json", artifactCaseId: caseDef.id },
        { source: "generated", file: "generated.json", artifactCaseId: caseDef.id },
      ],
    }],
    capturesAvailable: true,
    captureFileNames: { "375": "mobile", "1440": "desktop" },
  });
  assert.match(blind.markdown, /mobile\.png/);
  assert.match(blind.markdown, /desktop\.png/);
  assert.doesNotMatch(blind.markdown, /375\.png/);
  assert.match(blind.markdown, /Page I would approve/);
  assert.match(blind.markdown, /Edits to approval \(count\)/);
  assert.match(blind.markdown, /Time to approval \(minutes\)/);
  assert.match(blind.markdown, /Automated comparison: the two drafts are identical/);
  assert.doesNotMatch(blind.markdown, /provider-map\.json[\s\S]*generated/i);
  assert.deepEqual(Object.keys(blind.key.cases[caseDef.id].mapping).sort(), ["A", "B"]);
});
