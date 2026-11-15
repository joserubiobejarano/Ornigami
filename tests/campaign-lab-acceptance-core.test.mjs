import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyApproval,
  comparableText,
  contrastRatio,
  evaluateDestination,
  hasApprovedMetadata,
  requiredContrast,
  safeSegment,
  unrelatedCopyDiff,
  validateManifest,
} from "../scripts/campaign-lab-acceptance-core.mjs";

test("destination accepts absolute http(s) URLs without credentials", () => {
  assert.equal(evaluateDestination("https://example.com/harbor-field").valid, true);
  assert.equal(evaluateDestination("http://example.com/morrow").valid, true);
  assert.equal(evaluateDestination("https://example.com/harbor-field?x=1").valid, true);
});

test("destination rejects missing schemes, non-http schemes and credentials", () => {
  assert.deepEqual(evaluateDestination("example.com/harbor-field"), {
    valid: false,
    reason: "not-a-url",
    message: "Enter a complete URL, including https://.",
  });
  assert.equal(evaluateDestination("javascript:alert(1)").valid, false);
  assert.equal(evaluateDestination("javascript:alert(1)").reason, "scheme");
  assert.equal(evaluateDestination("https://user:pass@example.com/").valid, false);
  assert.equal(evaluateDestination("   ").valid, false);
});

test("approval classification prefers explicit state over prose", () => {
  assert.deepEqual(classifyApproval({ dataApproved: "true", statusText: "Changes not approved" }), {
    state: "approved",
    evidence: "data-approved=true",
  });
  assert.deepEqual(classifyApproval({ ariaPressed: "false", statusText: "Approved preview" }), {
    state: "not-approved",
    evidence: "approve-control aria-pressed=false",
  });
});

test("approval classification recognizes invalidation prose and unknown state", () => {
  assert.equal(classifyApproval({ statusText: "Changes not approved since the last preview" }).state, "not-approved");
  assert.equal(classifyApproval({ statusText: "Approval invalidated" }).state, "not-approved");
  assert.equal(classifyApproval({ statusText: "Approved preview" }).state, "approved");
  assert.equal(classifyApproval({ statusText: "Draft ready" }).state, "unknown");
  assert.equal(classifyApproval({}).state, "unknown");
});

test("unrelatedCopyDiff normalizes only the expected offer and destination changes", () => {
  const before = "Harbor Field\n20% off through 30 November\nShop on Amazon\n500 ml insulated";
  const after = "Harbor Field\n25% off through 31 December\nShop on Amazon\n500 ml insulated";
  assert.equal(
    unrelatedCopyDiff(before, after, [["20% off through 30 November", "25% off through 31 December"]]),
    null,
  );
  const changed = unrelatedCopyDiff(before, "Harbor Field\n25% off through 31 December\nBuy now\n500 ml insulated", [
    ["20% off through 30 November", "25% off through 31 December"],
  ]);
  assert.equal(changed.observed, "Buy now");
  assert.equal(
    unrelatedCopyDiff("Offer\nGenerated 15:01", "Offer\nGenerated 15:02", []),
    null,
  );
});

test("contrast thresholds follow WCAG large-text allowance", () => {
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  assert.equal(requiredContrast(16, "400"), 4.5);
  assert.equal(requiredContrast(24, "400"), 3);
  assert.equal(requiredContrast(18.66, "700"), 3);
});

test("manifest validation requires fixture identity and asset metadata shape", () => {
  const valid = {
    schemaVersion: 1,
    status: "approved",
    fixtures: [
      {
        name: "sparse",
        url: "/campaign-lab?fixture=sparse",
        product: { name: "Harbor Field bottle", label: "Harbor Field" },
        offer: "20% off",
        destination: "https://example.com/harbor-field",
        image: { path: "/asset.svg", alt: "Bottle", sha256: "a".repeat(64) },
      },
    ],
  };
  assert.deepEqual(validateManifest(valid), { ok: true, errors: [] });
  assert.equal(hasApprovedMetadata(valid.fixtures[0]), true);
  assert.equal(hasApprovedMetadata({ ...valid.fixtures[0], image: { path: null } }), false);
  const invalid = { schemaVersion: 1, status: "ready", fixtures: [] };
  const result = validateManifest(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("status")));
  assert.ok(result.errors.some((error) => error.includes("fixtures")));
});

test("comparable text and safe segments are stable", () => {
  assert.equal(comparableText("  a\n\t b  "), "a b");
  assert.equal(safeSegment("sparse / 375 px"), "sparse-375-px");
});
