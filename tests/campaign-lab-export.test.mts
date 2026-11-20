import assert from "node:assert/strict";
import test from "node:test";

import {
  assertHtmlReceiptAgreement,
  auditArchiveReferences,
  buildExportReceipt,
  buildStandaloneDocument,
  buildStandaloneStylesheet,
  CampaignExportReferenceError,
  campaignExportFileName,
  crc32,
  createStoredZip,
  evaluateCampaignExport,
  isLocalPreviewApproved,
  sameExportGuard,
} from "../src/lib/campaign-lab/export.ts";
import { findFontLicense } from "../src/lib/campaign-lab/font-licenses.ts";
import { buildPilotVerificationProvenance } from "../src/lib/campaign-lab/verification-provenance.ts";

const approvedState = {
  revision: "c17b6383cc650d5f",
  approvalRevision: "c17b6383cc650d5f",
  dirty: false,
  generating: false,
  imagesReady: true,
  supportedFormat: true,
};

test("local preview approval requires the rendered revision and a clean image gate", () => {
  assert.equal(isLocalPreviewApproved(approvedState), true);

  for (const change of [
    { revision: null },
    { approvalRevision: "0000000000000000" },
    { dirty: true },
    { generating: true },
    { imagesReady: false },
  ]) {
    assert.equal(
      isLocalPreviewApproved({ ...approvedState, ...change }),
      false,
      JSON.stringify(change),
    );
  }
});

test("export eligibility follows the editor approval rules and direct-offer scope", () => {
  assert.equal(evaluateCampaignExport(approvedState).ok, true);
  assert.match(
    evaluateCampaignExport({ ...approvedState, dirty: true }).reason,
    /edits that are not rendered/i,
  );
  assert.match(
    evaluateCampaignExport({
      ...approvedState,
      approvalRevision: "0000000000000000",
    }).reason,
    /not locally approved/i,
  );
  assert.match(
    evaluateCampaignExport({ ...approvedState, supportedFormat: false }).reason,
    /direct-offer template only/i,
  );
  assert.match(
    evaluateCampaignExport({ ...approvedState, imagesReady: false }).reason,
    /packshot/i,
  );
});

test("export filename is local, bounded and revision-specific", () => {
  assert.equal(
    campaignExportFileName("Harbor Field bottle", "c17b6383cc650d5f"),
    "campaign-lab-harbor-field-bottle-c17b6383cc.zip",
  );
  assert.equal(
    campaignExportFileName("  ", "abc"),
    "campaign-lab-campaign-abc.zip",
  );
});

test("standalone document carries revision, content agreement and provisional notice", () => {
  const html = buildStandaloneDocument({
    title: 'Harbor Field <Bottle>',
    bodyHtml: '<article class="page">Offer</article>',
    revision: "c17b6383cc650d5f",
    previewStatus: "preview",
    previewNotice: "Preview · destination provisional",
    packshotSha256: "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
    offer: "Free shipping through 30 November 2026, on every order",
    destinationUrl: "https://example.com/harbor-field",
    actionLabel: "Shop now",
    packshotFile: "packshot-49b0e48a866a21be.jpg",
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /name="campaign-lab-revision" content="c17b6383cc650d5f"/);
  assert.match(
    html,
    /name="campaign-lab-packshot-sha256" content="49b0e48a/,
  );
  assert.match(html, /name="campaign-lab-offer" content="Free shipping/);
  assert.match(
    html,
    /name="campaign-lab-destination" content="https:\/\/example\.com\/harbor-field/,
  );
  assert.match(html, /name="campaign-lab-packshot-file" content="packshot-/);
  assert.match(html, /Preview · destination provisional/);
  assert.match(html, /Harbor Field &lt;Bottle&gt;/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.doesNotMatch(html, /<script/i);
});

test("export guard only matches the same still-approved revision", () => {
  assert.equal(
    sameExportGuard(
      {
        revision: "c17b6383cc650d5f",
        approvalRevision: "c17b6383cc650d5f",
        dirty: false,
        generating: false,
        imagesReady: true,
      },
      approvedState,
    ),
    true,
  );
  assert.equal(
    sameExportGuard(
      {
        revision: "c17b6383cc650d5f",
        approvalRevision: "c17b6383cc650d5f",
        dirty: false,
        generating: false,
        imagesReady: true,
      },
      { ...approvedState, dirty: true },
    ),
    false,
  );
});

test("archive reference audit accepts local assets and rejects missing or external resources", () => {
  const html =
    '<link rel="stylesheet" href="./styles.css"><img src="./packshot-abc.jpg">';
  const css =
    '@font-face{font-family:Inter;src:url("./fonts/Inter-123.woff2")}';
  const audit = auditArchiveReferences(html, css, [
    "index.html",
    "styles.css",
    "packshot-abc.jpg",
    "fonts/Inter-123.woff2",
  ]);
  assert.equal(audit.stylesheets[0], "styles.css");
  assert.equal(audit.images[0], "packshot-abc.jpg");
  assert.equal(audit.fonts[0], "fonts/Inter-123.woff2");

  assert.throws(
    () =>
      auditArchiveReferences(
        html,
        `${css} .page{background:url("./missing.png")}`,
        [
          "index.html",
          "styles.css",
          "packshot-abc.jpg",
          "fonts/Inter-123.woff2",
        ],
      ),
    (error: unknown) =>
      error instanceof CampaignExportReferenceError &&
      /missing\.png/.test(error.message),
  );

  assert.throws(
    () =>
      auditArchiveReferences(
        '<link rel="stylesheet" href="https://cdn.example.com/app.css">',
        "",
        ["index.html"],
      ),
    (error: unknown) =>
      error instanceof CampaignExportReferenceError &&
      /external resource references/i.test(error.message),
  );
});

test("HTML and receipt agreement checks revision, offer, destination and packshot", async () => {
  const receipt = await buildExportReceipt({
    preview: {
      status: "confirmed",
      revision: "c17b6383cc650d5f",
      productName: "Harbor Field bottle",
      brandName: "Harbor Field",
      offer: "Free shipping through 30 November 2026, on every order",
      destinationUrl: "https://example.com/harbor-field",
      actionLabel: "Shop now",
      template: {
        id: "single-product-offer",
        version: "1.0.0",
        layout: "offer-led-one-photo",
        sections: ["hero", "hero-facts", "close"],
      },
      asset: {
        id: "browser-offer-packshot",
        contentHash:
          "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
        alt: "Packshot",
        width: 2500,
        height: 2500,
        src: "blob:test",
      },
    },
    approval: {
      revision: "c17b6383cc650d5f",
      approvedAt: "2026-11-17T14:00:00.000Z",
    },
    exportedAt: "2026-11-17T14:01:00.000Z",
    packshotFile: "packshot-49b0e48a866a21be.jpg",
    packshotSha256:
      "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
    files: [],
  });
  const html = buildStandaloneDocument({
    title: "Harbor Field",
    bodyHtml: "<article>Offer</article>",
    revision: receipt.approval.revision,
    previewStatus: receipt.preview.status,
    packshotSha256: receipt.asset.exportedSha256,
    offer: receipt.preview.offer,
    destinationUrl: receipt.preview.destinationUrl,
    actionLabel: receipt.preview.actionLabel,
    packshotFile: receipt.asset.file,
  });

  assert.doesNotThrow(() => assertHtmlReceiptAgreement(html, receipt));
  const composition = { id: "product-focus", version: "1.1.0", narrowOrder: "headline-product-offer-action-facts", containedPackshot: true } as const;
  const focusedReceipt = { ...receipt, preview: { ...receipt.preview, composition } };
  assert.throws(() => assertHtmlReceiptAgreement(html, focusedReceipt), /composition/);
  const focusedHtml = html.replace("</head>", `<meta name="campaign-lab-composition" content="${JSON.stringify(composition).replaceAll('"', '&quot;')}"></head>`);
  assert.doesNotThrow(() => assertHtmlReceiptAgreement(focusedHtml, focusedReceipt));
  assert.throws(() => assertHtmlReceiptAgreement(focusedHtml, receipt), /composition/);
  assert.throws(() => assertHtmlReceiptAgreement(focusedHtml, { ...focusedReceipt, preview: { ...focusedReceipt.preview, composition: { ...composition, containedPackshot: false } } }), /composition/);
  const legacyComposition = { ...composition, version: "1.0.0" } as unknown as typeof composition;
  const legacyReceipt = { ...receipt, preview: { ...receipt.preview, composition: legacyComposition } };
  const legacyHtml = html.replace("</head>", `<meta name="campaign-lab-composition" content="${JSON.stringify(legacyComposition).replaceAll('"', '&quot;')}"></head>`);
  assert.doesNotThrow(() => assertHtmlReceiptAgreement(legacyHtml, legacyReceipt));
  assert.throws(() =>
    assertHtmlReceiptAgreement(
      html.replace("Free shipping through 30 November 2026", "A different offer"),
      receipt,
    ),
  );
});

test("HTML agreement enforces preview status, notice, and provenance values", async () => {
  const manifest = {
    offer: "25% off, was $24.00, now $18.00",
    offerPrice: "$18.00",
    destinationUrl: "https://example.com/synthetic-field-lantern",
  };
  const rendered = {
    ...manifest,
    offer: "30% off, was $25.00, now $18.00",
  };
  const provenance = buildPilotVerificationProvenance({
    pilot: {
      id: "review-price-exercise",
      label: "Synthetic price review",
      status: "confirmed",
    },
    manifest,
    rendered,
    asset: {
      id: "review-hero",
      brandId: "browser-offer-brand",
      src: "/campaign-lab-pilots/review-price-exercise/review-hero.webp",
      width: 1200,
      height: 1500,
      alt: "Synthetic packshot",
      role: "product-hero",
      reviewed: true,
      reviewedBy: "Local QA",
      reviewedOn: "2026-11-17",
      source: "Synthetic fixture",
      rights: "Original synthetic fixture for local review.",
      contentHash: "b".repeat(64),
    },
  });
  const preview = {
    status: "preview" as const,
    notice: "Preview · offer provisional",
    revision: "d17b6383cc650d5f",
    productName: "Aster Field field lantern",
    brandName: "Aster Field",
    offer: rendered.offer,
    offerPrice: rendered.offerPrice,
    destinationUrl: rendered.destinationUrl,
    actionLabel: "See the lantern",
    template: {
      id: "single-product-offer",
      version: "1.0.0",
      layout: "offer-led-one-photo",
      sections: ["hero", "hero-facts", "close"],
    },
    asset: {
      id: "review-hero",
      contentHash: "b".repeat(64),
      alt: "Synthetic packshot",
      width: 1200,
      height: 1500,
      src: "/review-hero.webp",
    },
    verification: null,
    provenance,
  };
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-17T14:00:00.000Z",
    },
    exportedAt: "2026-11-17T14:01:00.000Z",
    packshotFile: "packshot-bbbbbbbbbbbbbbbb.webp",
    packshotSha256: "b".repeat(64),
    files: [],
  });
  const html = buildStandaloneDocument({
    title: "Aster Field field lantern — Aster Field",
    bodyHtml: '<article class="page"><p>30% off, was $25.00, now $18.00</p></article>',
    revision: receipt.approval.revision,
    previewStatus: receipt.preview.status,
    previewNotice: receipt.preview.notice ?? undefined,
    packshotSha256: receipt.asset.exportedSha256,
    offer: receipt.preview.offer,
    offerPrice: receipt.preview.offerPrice,
    destinationUrl: receipt.preview.destinationUrl,
    actionLabel: receipt.preview.actionLabel,
    packshotFile: receipt.asset.file,
  });

  assert.doesNotThrow(() => assertHtmlReceiptAgreement(html, receipt));
  assert.throws(
    () =>
      assertHtmlReceiptAgreement(
        html.replace(
          'name="campaign-lab-preview-status" content="preview"',
          'name="campaign-lab-preview-status" content="confirmed"',
        ),
        receipt,
      ),
    /agree on the preview status/i,
  );
  assert.throws(
    () =>
      assertHtmlReceiptAgreement(
        html.replace(
          'content="Preview · offer provisional"',
          'content="Preview · offer, destination provisional"',
        ),
        receipt,
      ),
    /agree on the preview notice/i,
  );
  assert.throws(
    () =>
      assertHtmlReceiptAgreement(
        html.replace(
          'name="campaign-lab-offer" content="30% off, was $25.00, now $18.00"',
          'name="campaign-lab-offer" content="25% off, was $24.00, now $18.00"',
        ),
        receipt,
      ),
    /agree on the offer/i,
  );
});

test("Inter bundles its matching copyright and OFL text", () => {
  const license = findFontLicense("Inter");
  assert.ok(license);
  assert.equal(license.family, "Inter");
  assert.match(license.copyright, /The Inter Project Authors/);
  assert.match(license.licenseText, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal(license.licenseFile, "fonts/LICENSE-Inter-OFL-1.1.txt");
  assert.equal(findFontLicense("Unknown Font"), null);
});

test("EB Garamond and Jost bundle their matching copyright and OFL text", () => {
  const garamond = findFontLicense("EB Garamond");
  const jost = findFontLicense("Jost");

  assert.ok(garamond);
  assert.ok(jost);
  assert.equal(garamond.family, "EB Garamond");
  assert.equal(jost.family, "Jost");
  assert.match(garamond.copyright, /EB Garamond Project Authors/);
  assert.match(jost.copyright, /Jost Project Authors/);
  assert.match(garamond.licenseText, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(jost.licenseText, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal(
    garamond.licenseFile,
    "fonts/LICENSE-EB-Garamond-OFL-1.1.txt",
  );
  assert.equal(jost.licenseFile, "fonts/LICENSE-Jost-OFL-1.1.txt");
});

test("standalone stylesheet mirrors the preview canvas and keeps extracted styles", () => {
  const css = buildStandaloneStylesheet({
    extractedCss: ".page{color:red}",
    primaryFontFamily: '"Inter"',
  });
  assert.match(css, /--font-sans: "Inter"/);
  assert.match(css, /max-width: 992px/);
  assert.match(css, /width: calc\(100vw - 448px\)/);
  assert.match(css, /\.page\{color:red\}/);
});

test("receipt binds the local approval, rendered revision and exported files", async () => {
  const receipt = await buildExportReceipt({
    preview: {
      status: "confirmed",
      revision: "c17b6383cc650d5f",
      productName: "Harbor Field bottle",
      brandName: "Harbor Field",
      offer: "Free shipping through 30 November 2026, on every order",
      destinationUrl: "https://example.com/harbor-field",
      actionLabel: "Shop now",
      template: {
        id: "single-product-offer",
        version: "1.0.0",
        layout: "offer-led-one-photo",
        sections: ["hero", "hero-facts", "close"],
      },
      asset: {
        id: "browser-offer-packshot",
        contentHash:
          "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
        alt: "Packshot",
        width: 2500,
        height: 2500,
        src: "blob:test",
      },
      verification: {
        offer: "confirmed",
        destination: "direct",
        rights: "confirmed",
        provisional: false,
      },
    },
    approval: {
      revision: "c17b6383cc650d5f",
      approvedAt: "2026-11-17T14:00:00.000Z",
    },
    exportedAt: "2026-11-17T14:01:00.000Z",
    packshotFile: "packshot-49b0e48a866a21be.jpg",
    packshotSha256:
      "49b0e48a866a21be4058bdfb166d5523fab4c0b77ff245c6067ee707106c7ff2",
    files: [
      { path: "index.html", bytes: 10, sha256: "a" },
      { path: "styles.css", bytes: 20, sha256: "b" },
    ],
  });

  assert.equal(receipt.approval.scope, "local-preview");
  assert.equal(receipt.approval.revision, receipt.approval.renderedRevision);
  assert.equal(receipt.preview.offer, "Free shipping through 30 November 2026, on every order");
  assert.equal(
    receipt.preview.destinationUrl,
    "https://example.com/harbor-field",
  );
  assert.equal(receipt.asset.exportedSha256, receipt.asset.contentHash);
  assert.equal(receipt.checks.editorControlsExcluded, true);
  assert.equal(receipt.checks.internalNotesExcluded, true);
});

test("stored ZIP writer emits a readable archive", () => {
  const files = [
    { path: "index.html", bytes: new TextEncoder().encode("<html></html>") },
    { path: "styles.css", bytes: new TextEncoder().encode(".page{}") },
  ];
  const zip = createStoredZip(files, new Date("2026-11-17T14:00:00Z"));
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(8, true), 0);
  assert.equal(crc32(files[0].bytes), view.getUint32(14, true));

  const eocdOffset = zip.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 10, true), files.length);

  const firstNameLength = view.getUint16(26, true);
  const firstName = new TextDecoder().decode(zip.slice(30, 30 + firstNameLength));
  assert.equal(firstName, "index.html");
});

test("optional approved price keeps existing receipt compatibility and agrees with the HTML", async () => {
  const preview = {
    status: "confirmed" as const,
    revision: "c17b6383cc650d5f",
    productName: "Example product",
    brandName: "Example brand",
    offer: "30% off, was $10, now $7.50",
    offerPrice: "$7.50",
    destinationUrl: "https://example.com/offer",
    actionLabel: "Shop now",
    template: {
      id: "single-product-offer",
      version: "1.0.0",
      layout: "offer-led-one-photo",
      sections: ["hero", "hero-facts", "close"],
    },
    asset: {
      id: "packshot",
      contentHash: "a".repeat(64),
      alt: "Example packshot",
      width: 2500,
      height: 2500,
      src: "/packshot.jpg",
    },
    verification: null,
  };
  const receipt = await buildExportReceipt({
    preview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-17T00:00:00.000Z",
    },
    exportedAt: "2026-11-17T00:00:01.000Z",
    packshotFile: "packshot-aaaaaaaaaaaaaaaa.jpg",
    packshotSha256: "a".repeat(64),
    files: [],
  });
  assert.equal(receipt.preview.offerPrice, "$7.50");
  assert.equal("provenance" in receipt, false);

  const html = buildStandaloneDocument({
    title: "Example product — Example brand",
    bodyHtml: '<article class="page"><p>30% off, was $10, now $7.50</p></article>',
    revision: preview.revision,
    previewStatus: "confirmed",
    packshotSha256: "a".repeat(64),
    offer: preview.offer,
    offerPrice: preview.offerPrice,
    destinationUrl: preview.destinationUrl,
    actionLabel: preview.actionLabel,
    packshotFile: "packshot-aaaaaaaaaaaaaaaa.jpg",
  });
  assert.doesNotThrow(() => assertHtmlReceiptAgreement(html, receipt));

  const legacyPreview = { ...preview, offerPrice: undefined };
  const legacyReceipt = await buildExportReceipt({
    preview: legacyPreview,
    approval: {
      revision: preview.revision,
      approvedAt: "2026-11-17T00:00:00.000Z",
    },
    exportedAt: "2026-11-17T00:00:01.000Z",
    packshotFile: "packshot-aaaaaaaaaaaaaaaa.jpg",
    packshotSha256: "a".repeat(64),
    files: [],
  });
  assert.equal("offerPrice" in legacyReceipt.preview, false);
  const legacyHtml = buildStandaloneDocument({
    title: "Example product — Example brand",
    bodyHtml: '<article class="page"><p>30% off, was $10, now $7.50</p></article>',
    revision: preview.revision,
    previewStatus: "confirmed",
    packshotSha256: "a".repeat(64),
    offer: preview.offer,
    destinationUrl: preview.destinationUrl,
    actionLabel: preview.actionLabel,
    packshotFile: "packshot-aaaaaaaaaaaaaaaa.jpg",
  });
  assert.doesNotThrow(() => assertHtmlReceiptAgreement(legacyHtml, legacyReceipt));
});
