import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportReceipt,
  type CampaignExportPreview,
} from "../src/lib/campaign-lab/export.ts";
import { buildBrowserIntakeVerificationProvenance } from "../src/lib/campaign-lab/verification-provenance.ts";
import type { ApprovedAsset, PilotDescriptor } from "../src/lib/campaign-lab/types.ts";

const pilot: PilotDescriptor = {
  id: "browser-offer",
  label: "Browser offer intake",
  status: "preview",
  note: "Local browser brief · not publication approval.",
};

const asset: ApprovedAsset = {
  id: "browser-offer-packshot",
  brandId: "browser-offer-brand",
  src: "blob:local",
  width: 1200,
  height: 1500,
  alt: "Synthetic packshot.",
  role: "product-hero",
  reviewed: true,
  reviewedBy: "Local browser operator",
  reviewedOn: "2026-11-18",
  source: "Browser intake upload",
  rights: "Synthetic local fixture.",
  contentHash: "c".repeat(64),
};

function receiptPreview(): CampaignExportPreview {
  const provenance = buildBrowserIntakeVerificationProvenance({
    pilot,
    manifest: {
      offer: "20% off",
      destinationUrl: "https://example.com/offer",
    },
    rendered: {
      offer: "20% off",
      destinationUrl: "https://example.com/offer",
    },
    asset,
    operatorVerification: {
      offer: "confirmed",
      destination: "direct",
      rights: "confirmed",
      provisional: false,
    },
  });
  return {
    status: "preview" as const,
    revision: "0123456789abcdef",
    revisionIdentityVersion: 4,
    productName: "Synthetic bottle",
    brandName: "Browser brand",
    offer: "20% off",
    destinationUrl: "https://example.com/offer",
    actionLabel: "Shop now",
    template: {
      id: "single-product-offer",
      version: "1.0.0",
      layout: "offer-led-one-photo",
      sections: ["hero", "hero-facts", "close"],
    },
    appearance: {
      accent: "#244fae",
      accentInk: "#fffaf1",
    },
    asset: {
      id: asset.id,
      contentHash: asset.contentHash,
      alt: asset.alt,
      width: asset.width,
      height: asset.height,
      src: asset.src,
    },
    verification: {
      offer: "confirmed" as const,
      destination: "direct" as const,
      rights: "confirmed" as const,
      provisional: false,
    },
    provenance,
  };
}

test("browser export receipt identifies browser intake and separates identity checks", async () => {
  const preview = receiptPreview();
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-18T12:00:00.000Z",
    },
    exportedAt: "2026-11-18T12:01:00.000Z",
    packshotFile: "packshot-cccccccccccccccc.webp",
    packshotSha256: asset.contentHash,
    files: [],
  });

  assert.deepEqual(receipt.preview.appearance, {
    accent: "#244fae",
    accentInk: "#fffaf1",
  });
  assert.equal(receipt.provenance?.source, "browser-intake");
  assert.equal(receipt.provenance?.ownerConfirmed, false);
  assert.equal(receipt.provenance?.assetBytesVerified, false);
  assert.equal(receipt.provenance?.operatorAttestation?.offer, "confirmed");
  assert.deepEqual(receipt.provenance?.assetIdentity, {
    source: "browser-computed",
    declaredSha256: asset.contentHash,
    exportedSha256: asset.contentHash,
    localExportHashMatches: true,
    serverBytesVerified: false,
  });
});

test("an effective emphasis foreground is carried additively in receipt appearance", async () => {
  const preview = receiptPreview();
  preview.appearance = {
    accent: "#244fae",
    accentInk: "#fffaf1",
    offerEmphasisInk: "#1f2a24",
  };
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-18T12:00:00.000Z",
    },
    exportedAt: "2026-11-18T12:01:00.000Z",
    packshotFile: "packshot-cccccccccccccccc.webp",
    packshotSha256: asset.contentHash,
    files: [],
  });
  assert.deepEqual(receipt.preview.appearance, {
    accent: "#244fae",
    accentInk: "#fffaf1",
    offerEmphasisInk: "#1f2a24",
  });
});

test("a mismatched local export hash is recorded as false, not server verification", async () => {
  const preview = receiptPreview();
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-18T12:00:00.000Z",
    },
    exportedAt: "2026-11-18T12:01:00.000Z",
    packshotFile: "packshot-dddddddddddddddd.webp",
    packshotSha256: "d".repeat(64),
    files: [],
  });

  assert.equal(receipt.provenance?.assetIdentity?.localExportHashMatches, false);
  assert.equal(receipt.provenance?.assetIdentity?.serverBytesVerified, false);
  assert.equal(receipt.provenance?.ownerConfirmed, false);
});
