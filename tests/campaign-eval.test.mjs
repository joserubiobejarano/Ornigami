import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildBlindSheet,
  compareArtifacts,
  evaluateDraft,
  evaluateRevision,
  loadArtifacts,
  loadPack,
  scanClaims,
  validatePack,
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

function failures() {
  return loadArtifacts(path.join(fixtures, "samples", "failures"));
}

function failedIds(checks) {
  return checks.filter((item) => item.state === "failed").map((item) => item.id);
}

test("the evaluation pack is internally usable", () => {
  const loaded = loadedPack();
  const validation = validatePack(loaded);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
});

test("the pack rejects an intent-change that changes the approved offer", () => {
  const loaded = loadedPack();
  const intent = loaded.casesById.get("intent-change");
  intent.campaign.offer = "25% off";
  const validation = validatePack(loaded);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => /intent-change must keep the same offer/.test(error)));
});

test("every generated sample passes its own gates and expected checks", () => {
  const loaded = loadedPack();
  const samples = generated();
  for (const caseDef of loaded.pack.cases) {
    if (caseDef.role === "failure-revision") continue;
    const artifact = samples.drafts.get(caseDef.id);
    assert.ok(artifact, `missing generated sample for ${caseDef.id}`);
    const reference = caseDef.expected.differentFrom?.caseId
      ? samples.drafts.get(caseDef.expected.differentFrom.caseId)
      : caseDef.expected.openingShift ? samples.drafts.get("rich-angle") : undefined;
    const checks = [
      ...evaluateDraft(artifact, caseDef, loaded.pack),
      ...compareArtifacts(artifact, baseline().drafts.get(caseDef.id), reference, caseDef),
    ];
    assert.deepEqual(failedIds(checks), [], `${caseDef.id} failed: ${failedIds(checks).join(", ")}`);
    if (caseDef.role === "trap") {
      const packaging = checks.find((item) => item.id === "packaging-truth");
      assert.equal(packaging.state, "unassessed");
    }
  }
});

test("unsupported generated content fails claim traceability", () => {
  const loaded = loadedPack();
  const artifact = failures().drafts.get("sparse-offer");
  const checks = evaluateDraft(artifact, loaded.casesById.get("sparse-offer"), loaded.pack);
  const claim = checks.find((item) => item.id === "claim-traceability");
  assert.equal(claim.state, "failed");
  assert.ok(claim.evidence.unsupportedNumbers.includes("24"));
  assert.ok(claim.evidence.forbiddenFound.includes("reviews"));
  assert.ok(claim.evidence.absoluteFound.length > 0);
});

test("a missing required input is reported by field", () => {
  const loaded = loadedPack();
  const artifact = failures().drafts.get("failure-revision");
  const checks = evaluateDraft(artifact, loaded.casesById.get("failure-revision"), loaded.pack);
  const input = checks.find((item) => item.id === "input-required");
  assert.equal(input.state, "failed");
  assert.deepEqual(input.evidence.missing, ["destination URL"]);
});

test("the good revision applies exactly, removes old values, and invalidates approval", () => {
  const loaded = loadedPack();
  const bundle = generated().revisions.get("failure-revision");
  const checks = evaluateRevision(bundle, loaded.casesById.get("failure-revision"), loaded.pack);
  assert.deepEqual(failedIds(checks), []);
  assert.equal(checks.find((item) => item.id === "revision-old-values-absent").state, "passed");
  assert.equal(checks.find((item) => item.id === "revision-invalidates-approval").state, "passed");
});

test("a stale revision fails even when the new URL starts with the old URL", () => {
  const loaded = loadedPack();
  const bundle = failures().revisions.get("failure-revision");
  const checks = evaluateRevision(bundle, loaded.casesById.get("failure-revision"), loaded.pack);
  const ids = failedIds(checks);
  assert.ok(ids.includes("revision-applied"));
  assert.ok(ids.includes("revision-old-values-absent"));
  assert.ok(ids.includes("revision-invalidates-approval"));
});

test("an unchanged opening fails the intent-change comparison", () => {
  const loaded = loadedPack();
  const unchanged = failures().drafts.get("intent-change");
  const reference = generated().drafts.get("rich-angle");
  const checks = compareArtifacts(
    unchanged,
    baseline().drafts.get("intent-change"),
    reference,
    loaded.casesById.get("intent-change"),
  );
  const shift = checks.find((item) => item.id === "opening-shift");
  assert.equal(shift.state, "failed");
  assert.equal(shift.evidence.headlineChanged, false);
});

test("the trap never reports packaging truth as passed", () => {
  const loaded = loadedPack();
  const artifact = generated().drafts.get("trap-asset-label");
  const checks = evaluateDraft(artifact, loaded.casesById.get("trap-asset-label"), loaded.pack);
  const packaging = checks.find((item) => item.id === "packaging-truth");
  assert.equal(packaging.state, "unassessed");
  assert.match(packaging.evidence.trap.visiblePackagingLabel, /0\.8 L/);
});

test("claim scanning ignores approved numbers and flags new ones", () => {
  const loaded = loadedPack();
  const caseDef = loaded.casesById.get("sparse-offer");
  const approved = scanClaims("A 500 ml bottle with a screw cap and 20% off.", caseDef, loaded.pack);
  assert.equal(approved.ok, true);
  const invented = scanClaims("Keeps drinks cold for 24 hours and 2,400 reviews agree.", caseDef, loaded.pack);
  assert.equal(invented.ok, false);
  assert.ok(invented.unsupportedNumbers.includes("24"));
  assert.ok(invented.unsupportedNumbers.includes("2400"));
});

test("the blind sheet hides which draft is generated", () => {
  const loaded = loadedPack();
  const samples = generated();
  const bases = baseline();
  const pairs = loaded.pack.cases
    .filter((caseDef) => caseDef.role !== "failure-revision")
    .map((caseDef) => ({
      caseId: caseDef.id,
      options: [
        { source: "generated", file: samples.drafts.get(caseDef.id)?.file, artifactCaseId: caseDef.id },
        { source: "baseline", file: bases.drafts.get(caseDef.id)?.file, artifactCaseId: caseDef.id },
      ],
    }));
  const blind = buildBlindSheet({ loaded, runId: "test-run", seed: "test-seed", pairs });
  assert.match(blind.markdown, /\| A \|/);
  assert.doesNotMatch(blind.markdown, /\| generated \|/i);
  assert.doesNotMatch(blind.markdown, /\| baseline \|/i);
  const sparse = blind.key.cases["sparse-offer"];
  assert.deepEqual(Object.keys(sparse.mapping).sort(), ["A", "B"]);
  assert.deepEqual(
    sparse.order.map((label) => sparse.mapping[label].source).sort(),
    ["baseline", "generated"],
  );
});
