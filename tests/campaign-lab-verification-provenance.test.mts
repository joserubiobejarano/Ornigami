import assert from "node:assert/strict";
import test from "node:test";

import { buildPilotVerificationProvenance } from "../src/lib/campaign-lab/verification-provenance.ts";
import type { ApprovedAsset, PilotDescriptor } from "../src/lib/campaign-lab/types.ts";

const pilot: PilotDescriptor = {
  id: "test-pilot",
  label: "Test pilot",
  status: "confirmed",
  note: "Reviewed local inputs.",
};

const asset: ApprovedAsset = {
  id: "packshot",
  brandId: "browser-offer-brand",
  src: "/campaign-lab-pilots/test-pilot/packshot.jpg",
  width: 2500,
  height: 2500,
  alt: "Test packshot",
  role: "product-hero",
  reviewed: true,
  reviewedBy: "Local review",
  reviewedOn: "2026-11-17",
  source: "Approved test asset",
  rights: "Permission recorded for local review.",
  contentHash: "a".repeat(64),
};

test("pilot provenance records the manifest source and reviewed asset evidence", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot,
    offer: "30% off, was $10, now $7.50",
    offerPrice: "$7.50",
    destinationUrl: "https://example.com/offer",
    asset,
  });

  assert.equal(provenance.source, "pilot-manifest");
  assert.equal(provenance.pilotId, "test-pilot");
  assert.equal(provenance.offer.value, "30% off, was $10, now $7.50");
  assert.equal(provenance.offer.status, "confirmed");
  assert.equal(provenance.offer.source, "pilot-manifest:test-pilot#fixture.brief.offer");
  assert.equal(provenance.offerPrice.value, "$7.50");
  assert.equal(provenance.offerPrice.status, "confirmed");
  assert.equal(provenance.destination.value, "https://example.com/offer");
  assert.equal(provenance.rights.value, asset.rights);
  assert.equal(provenance.rights.status, "confirmed");
  assert.equal(provenance.rights.reviewedBy, "Local review");
  assert.equal(provenance.rights.reviewedOn, "2026-11-17");
  assert.equal(provenance.packshot.assetId, "packshot");
  assert.equal(provenance.packshot.contentHash, "a".repeat(64));
  assert.equal(provenance.packshot.source, "Approved test asset");
  assert.deepEqual(provenance.missingEvidence, [
    "offer reviewer identity/date",
    "destination reviewer identity/date",
    "approved price reviewer identity/date",
  ]);
});

test("pilot provenance keeps preview status and missing evidence explicit", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot: { ...pilot, status: "preview" },
    offer: "30% off, was $10, now $7.50",
    destinationUrl: "https://example.com/offer",
    asset: {
      ...asset,
      rights: "",
      reviewed: true,
      reviewedBy: "",
      reviewedOn: "",
      contentHash: "",
    },
  });

  assert.equal(provenance.offer.status, "provisional");
  assert.equal(provenance.destination.status, "provisional");
  assert.equal(provenance.offerPrice.status, "missing");
  assert.equal(provenance.offerPrice.value, null);
  assert.equal(provenance.rights.status, "missing");
  assert.equal(provenance.packshot.status, "missing");
  assert.ok(provenance.missingEvidence.includes("confirmed pilot status"));
  assert.ok(provenance.missingEvidence.includes("approved price emphasis"));
  assert.ok(provenance.missingEvidence.includes("asset rights"));
  assert.ok(provenance.missingEvidence.includes("packshot content hash"));
});

test("pilot provenance rejects an approved price that is not in the rendered offer", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot,
    offer: "30% off, was $10, now $7.50",
    offerPrice: "$5.00",
    destinationUrl: "https://example.com/offer",
    asset,
  });

  assert.equal(provenance.offerPrice.value, "$5.00");
  assert.equal(provenance.offerPrice.status, "missing");
  assert.ok(
    provenance.missingEvidence.includes(
      "approved price is an exact substring of the offer",
    ),
  );
});
