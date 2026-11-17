import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPilotVerificationProvenance,
  pilotPreviewNotice,
  pilotPreviewStatus,
} from "../src/lib/campaign-lab/verification-provenance.ts";
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

const manifest = {
  offer: "30% off, was $10, now $7.50",
  offerPrice: "$7.50",
  destinationUrl: "https://example.com/offer",
};

test("unchanged rendered values inherit the manifest confirmation and keep their source values", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: { ...manifest },
    asset,
  });

  assert.equal(provenance.source, "pilot-manifest");
  assert.equal(provenance.pilotId, "test-pilot");
  assert.equal(provenance.pilotStatus, "confirmed");
  assert.equal(provenance.status, "confirmed");
  assert.deepEqual(provenance.editorChanges, []);
  assert.equal(provenance.offer.value, manifest.offer);
  assert.equal(provenance.offer.sourceValue, manifest.offer);
  assert.equal(provenance.offer.status, "confirmed");
  assert.equal(provenance.offer.changedByEditor, false);
  assert.equal(provenance.offer.source, "pilot-manifest:test-pilot#fixture.brief.offer");
  assert.equal(provenance.offerPrice.value, "$7.50");
  assert.equal(provenance.offerPrice.sourceValue, "$7.50");
  assert.equal(provenance.offerPrice.status, "confirmed");
  assert.equal(provenance.destination.value, manifest.destinationUrl);
  assert.equal(provenance.destination.sourceValue, manifest.destinationUrl);
  assert.equal(provenance.destination.status, "confirmed");
  assert.equal(provenance.rights.value, asset.rights);
  assert.equal(provenance.rights.sourceValue, asset.rights);
  assert.equal(provenance.rights.status, "confirmed");
  assert.equal(provenance.rights.reviewedBy, "Local review");
  assert.equal(provenance.rights.reviewedOn, "2026-11-17");
  assert.equal(provenance.rights.changedByEditor, false);
  assert.equal(provenance.packshot.assetId, "packshot");
  assert.equal(provenance.packshot.contentHash, "a".repeat(64));
  assert.equal(provenance.packshot.sourceValue, "a".repeat(64));
  assert.equal(provenance.packshot.source, "Approved test asset");
  assert.equal(provenance.packshot.changedByEditor, false);
  assert.deepEqual(provenance.missingEvidence, [
    "offer reviewer identity/date",
    "destination reviewer identity/date",
    "approved price reviewer identity/date",
  ]);
  assert.equal(pilotPreviewStatus(provenance), "confirmed");
  assert.equal(pilotPreviewNotice(provenance), undefined);
});

test("an edited offer is explicit, provisional, and retains its original source value", () => {
  const editedOffer = "30% off, was $12, now $7.50";
  const provenance = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: { ...manifest, offer: editedOffer },
    asset,
  });

  assert.equal(provenance.status, "provisional");
  assert.deepEqual(provenance.editorChanges, [
    {
      field: "offer",
      sourceValue: manifest.offer,
      renderedValue: editedOffer,
    },
  ]);
  assert.equal(provenance.offer.value, editedOffer);
  assert.equal(provenance.offer.sourceValue, manifest.offer);
  assert.equal(provenance.offer.status, "provisional");
  assert.equal(provenance.offer.changedByEditor, true);
  assert.match(provenance.offer.note ?? "", /differs from the approved manifest/i);
  assert.equal(provenance.destination.value, manifest.destinationUrl);
  assert.equal(provenance.destination.sourceValue, manifest.destinationUrl);
  assert.equal(provenance.destination.status, "confirmed");
  assert.equal(provenance.destination.changedByEditor, false);
  assert.equal(provenance.offerPrice.value, manifest.offerPrice);
  assert.equal(provenance.offerPrice.sourceValue, manifest.offerPrice);
  assert.equal(provenance.offerPrice.status, "confirmed");
  assert.equal(provenance.offerPrice.changedByEditor, false);
  assert.equal(provenance.rights.status, "confirmed");
  assert.equal(provenance.packshot.status, "confirmed");
  assert.ok(
    provenance.missingEvidence.includes(
      "offer confirmation for the edited value",
    ),
  );
  assert.equal(pilotPreviewStatus(provenance), "preview");
  assert.equal(pilotPreviewNotice(provenance), "Preview · offer provisional");
});

test("an edited destination is explicit and does not disturb unchanged rights or packshot evidence", () => {
  const editedDestination = "https://example.com/offer/updated";
  const provenance = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: { ...manifest, destinationUrl: editedDestination },
    asset,
  });

  assert.equal(provenance.status, "provisional");
  assert.deepEqual(provenance.editorChanges, [
    {
      field: "destination",
      sourceValue: manifest.destinationUrl,
      renderedValue: editedDestination,
    },
  ]);
  assert.equal(provenance.offer.status, "confirmed");
  assert.equal(provenance.destination.value, editedDestination);
  assert.equal(provenance.destination.sourceValue, manifest.destinationUrl);
  assert.equal(provenance.destination.status, "provisional");
  assert.equal(provenance.destination.changedByEditor, true);
  assert.equal(provenance.rights.value, asset.rights);
  assert.equal(provenance.rights.status, "confirmed");
  assert.equal(provenance.rights.reviewedBy, "Local review");
  assert.equal(provenance.packshot.contentHash, "a".repeat(64));
  assert.equal(provenance.packshot.status, "confirmed");
  assert.equal(provenance.packshot.reviewedOn, "2026-11-17");
  assert.ok(
    provenance.missingEvidence.includes(
      "destination confirmation for the edited value",
    ),
  );
  assert.equal(
    pilotPreviewNotice(provenance),
    "Preview · destination provisional",
  );
});

test("restoring every rendered value also restores inherited confirmation", () => {
  const edited = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: {
      offer: "30% off, was $12, now $7.50",
      offerPrice: "$7.50",
      destinationUrl: "https://example.com/offer/updated",
    },
    asset,
  });
  assert.equal(edited.status, "provisional");
  assert.deepEqual(
    edited.editorChanges.map((change) => change.field),
    ["offer", "destination"],
  );

  const restored = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: { ...manifest },
    asset,
  });
  assert.equal(restored.status, "confirmed");
  assert.deepEqual(restored.editorChanges, []);
  assert.equal(restored.offer.value, manifest.offer);
  assert.equal(restored.offer.sourceValue, manifest.offer);
  assert.equal(restored.offer.status, "confirmed");
  assert.equal(restored.destination.value, manifest.destinationUrl);
  assert.equal(restored.destination.sourceValue, manifest.destinationUrl);
  assert.equal(restored.destination.status, "confirmed");
  assert.equal(pilotPreviewStatus(restored), "confirmed");
  assert.equal(pilotPreviewNotice(restored), undefined);
});

test("preview pilots stay provisional even when their rendered values match the manifest", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot: { ...pilot, status: "preview" },
    manifest,
    rendered: { ...manifest },
    asset,
  });

  assert.equal(provenance.pilotStatus, "preview");
  assert.equal(provenance.status, "provisional");
  assert.equal(provenance.offer.status, "provisional");
  assert.equal(provenance.destination.status, "provisional");
  assert.equal(provenance.offerPrice.status, "provisional");
  assert.ok(provenance.missingEvidence.includes("confirmed pilot status"));
  assert.equal(
    pilotPreviewNotice(provenance),
    "Preview · offer and destination unconfirmed",
  );
});

test("missing asset evidence and a non-matching approved price stay explicit", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot,
    manifest,
    rendered: { ...manifest, offerPrice: "$5.00" },
    asset: {
      ...asset,
      rights: "",
      reviewed: true,
      reviewedBy: "",
      reviewedOn: "",
      contentHash: "",
    },
  });

  assert.equal(provenance.offerPrice.value, "$5.00");
  assert.equal(provenance.offerPrice.sourceValue, manifest.offerPrice);
  assert.equal(provenance.offerPrice.status, "missing");
  assert.equal(provenance.offerPrice.changedByEditor, true);
  assert.deepEqual(provenance.editorChanges, [
    {
      field: "offerPrice",
      sourceValue: manifest.offerPrice,
      renderedValue: "$5.00",
    },
  ]);
  assert.equal(provenance.rights.status, "missing");
  assert.equal(provenance.packshot.status, "missing");
  assert.ok(
    provenance.missingEvidence.includes(
      "approved price is an exact substring of the offer",
    ),
  );
  assert.ok(provenance.missingEvidence.includes("asset rights"));
  assert.ok(provenance.missingEvidence.includes("packshot content hash"));
});

test("the builder still accepts the legacy single-value input shape", () => {
  const provenance = buildPilotVerificationProvenance({
    pilot,
    offer: manifest.offer,
    offerPrice: manifest.offerPrice,
    destinationUrl: manifest.destinationUrl,
    asset,
  });

  assert.equal(provenance.status, "confirmed");
  assert.equal(provenance.offer.value, manifest.offer);
  assert.equal(provenance.offer.sourceValue, manifest.offer);
  assert.equal(provenance.offer.status, "confirmed");
  assert.deepEqual(provenance.editorChanges, []);
});
