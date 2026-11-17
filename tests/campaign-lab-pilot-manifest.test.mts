import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePilotManifest,
  validatePilotSource,
} from "../src/lib/campaign-lab/pilots/pilot-manifest.ts";

function sourcePilot() {
  return {
    schemaVersion: 1,
    pilot: {
      id: "morrow-pilot",
      label: "Morrow local pilot",
      status: "preview",
      note: "Local review inputs.",
    },
    brand: {
      id: "morrow-pilot",
      name: "Morrow Ceramic",
      wordmark: "Morrow",
      descriptor: "Editorial craft",
      headlineMode: "angle",
      detailTitle: "The ribs are the design.",
      tokens: {
        page: "#f2ebde",
        surface: "#e6dbc8",
        ink: "#1d2a3c",
        muted: "#5c6066",
        accent: "#234a6b",
        accentInk: "#f9f3e8",
        line: "#cbbda8",
        displayFont: "Georgia, serif",
        bodyFont: "Arial, sans-serif",
        displayWeight: 400,
        displayTracking: "-0.03em",
        labelCase: "uppercase",
        labelTracking: "0.2em",
        imageRadius: "12px",
        buttonRadius: "999px",
        heroImage: "arch",
        heroOrder: "headline-first",
        prefersEditorial: true,
        detailBackground: "#1d2a3c",
        detailInk: "#f2ebde",
        imageBlend: "normal",
        showWordmarkMark: true,
      },
    },
    sourceCampaign: {
      channel: "Email",
      promise: "What changes when your first pour is slower?",
      document: "Approved campaign email",
      reviewedBy: "Ornigami content review",
      reviewedOn: "2026-11-15",
    },
    fixture: {
      id: "morrow-pilot",
      label: "Morrow local pilot",
      description: "A local pilot with one hero and one detail image.",
      brief: {
        productName: "Morrow ceramic pour-over dripper",
        offer: "Free shipping through 30 November 2026",
        destinationUrl: "https://example.com/morrow",
        actionLabel: "See the dripper",
        productNoun: "pour-over dripper",
        productFacts: [
          {
            id: "interior",
            label: "Interior",
            value: "Three ribs",
            source: {
              document: "Approved product sheet",
              quote: "Interior: three raised ribs.",
              reviewedBy: "Ornigami content review",
              reviewedOn: "2026-11-12",
            },
          },
          {
            id: "outlet",
            label: "Outlet",
            value: "Single outlet",
            source: {
              document: "Approved product sheet",
              quote: "Outlet: one centred outlet.",
              reviewedBy: "Ornigami content review",
              reviewedOn: "2026-11-12",
            },
          },
        ],
        requiredFactGroups: [
          { id: "rib-design", label: "the rib design", factIds: ["interior", "outlet"] },
        ],
        copy: {
          headline: "Why Morrow revised the rib spacing",
          lede: "In the first prototype, the filter sat against the wall.",
        },
        advertorial: {
          openings: [
            {
              id: "flow-control",
              headline: "Why Morrow revised the rib spacing inside its ceramic pour-over dripper",
              standfirst: "What changes when your first pour is slower?",
            },
          ],
          storyBeats: [
            {
              id: "prototype-wall",
              role: "opening",
              text: "In the first prototype, the filter sat against the wall.",
              source: {
                document: "Approved story",
                quote: "In the first prototype, the filter sat against the wall.",
                reviewedBy: "Ornigami content review",
                reviewedOn: "2026-11-15",
              },
            },
            {
              id: "rib-revision",
              role: "turn",
              text: "Morrow revised the spacing between the three interior ribs.",
              source: {
                document: "Approved story",
                quote: "Morrow revised the spacing between the three interior ribs.",
                reviewedBy: "Ornigami content review",
                reviewedOn: "2026-11-15",
              },
            },
          ],
          disclosure: {
            label: "Advertisement",
            sponsor: "Morrow Ceramic",
            explanation: "Created by Ornigami for Morrow Ceramic. This is a paid advertisement.",
            repeatAtClose: false,
          },
          productTransition: "A ceramic dripper with three interior ribs and a single outlet.",
          assetAssignments: [
            { role: "product-hero", assetId: "morrow-hero" },
            { role: "product-detail", assetId: "morrow-detail" },
          ],
          preferredLayout: "advertorial-full",
        },
      },
      openings: [
        {
          id: "flow-control",
          label: "Rib design",
          copy: {
            headline: "Why Morrow revised the rib spacing",
            lede: "In the first prototype, the filter sat against the wall.",
          },
        },
      ],
    },
    assets: [
      {
        id: "morrow-hero",
        file: "C:/private/morrow-hero.webp",
        alt: "Morrow cream ceramic dripper.",
        role: "product-hero",
        reviewed: true,
        reviewedBy: "Ornigami design review",
        reviewedOn: "2026-11-15",
        source: "Operator source file",
        rights: "Local pilot use only.",
        crop: "4:5 portrait, full pack visible.",
      },
      {
        id: "morrow-detail",
        file: "C:/private/morrow-detail.webp",
        alt: "Three raised interior ribs.",
        role: "product-detail",
        reviewed: true,
        reviewedBy: "Ornigami design review",
        reviewedOn: "2026-11-15",
        source: "Operator source file",
        rights: "Local pilot use only.",
        caption: "Three raised interior ribs.",
      },
    ],
  };
}

function manifestFrom(source: ReturnType<typeof sourcePilot>) {
  return {
    ...source,
    assets: source.assets.map((asset, index) => ({
      ...asset,
      brandId: source.brand.id,
      src: `/campaign-lab-pilots/${source.pilot.id}/${asset.id}.webp`,
      width: 1200,
      height: 1500,
      contentHash: String(index + 1).repeat(64),
    })),
  };
}

test("a local pilot source accepts advertorial supporting roles and records the source promise", () => {
  const result = validatePilotSource(sourcePilot(), { pilotId: "morrow-pilot" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.assets.map((asset) => asset.role),
    ["product-hero", "product-detail"],
  );
  assert.equal(result.value.sourceCampaign?.promise, "What changes when your first pour is slower?");
  assert.equal(
    result.value.fixture.brief.advertorial?.assetAssignments.length,
    2,
  );
});

test("the runtime manifest accepts the same editorial package and fills the missing brand ID", () => {
  const manifest = manifestFrom(sourcePilot());
  const assetsWithoutBrandId = manifest.assets.map((asset) => {
    const copy = { ...asset } as Record<string, unknown>;
    delete copy.brandId;
    return copy;
  }) as typeof manifest.assets;
  const result = validatePilotManifest(
    { ...manifest, assets: assetsWithoutBrandId },
    { pilotId: "morrow-pilot" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.assets[0].brandId, "morrow-pilot");
  assert.equal(result.value.assets[1].caption, "Three raised interior ribs.");
  assert.equal(result.value.sourceCampaign?.channel, "Email");
});

test("a missing source campaign promise is named specifically", () => {
  const source = sourcePilot();
  delete (source as Record<string, unknown>).sourceCampaign;
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => /sourceCampaign is required/i.test(issue)));
});

test("story beats require an approved source quote, reviewer and date", () => {
  const source = sourcePilot();
  source.fixture.brief.advertorial.storyBeats[0].source = {
    document: "Approved story",
    quote: "",
    reviewedBy: "",
    reviewedOn: "",
  } as typeof source.fixture.brief.advertorial.storyBeats[0]["source"];
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(
    result.issues.some((issue) => /storyBeats\[0\].*complete source/i.test(issue)),
  );
});

test("disclosure and product transition are required editorial inputs", () => {
  const source = sourcePilot();
  source.fixture.brief.advertorial.disclosure.explanation = "";
  delete (source.fixture.brief.advertorial as Record<string, unknown>).productTransition;
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => /disclosure needs an approved label/i.test(issue)));
  assert.ok(result.issues.some((issue) => /productTransition is required/i.test(issue)));
});

test("unsupported asset roles and unknown assignments are rejected by name", () => {
  const source = sourcePilot();
  source.assets[1].role = "lifestyle";
  source.fixture.brief.advertorial.assetAssignments[1].assetId = "missing-detail";
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(
    result.issues.some((issue) => /asset "morrow-detail" has unsupported role "lifestyle"/i.test(issue)),
  );
  assert.ok(
    result.issues.some((issue) => /references unknown asset "missing-detail"/i.test(issue)),
  );
});

test("first-person copy needs a narrator release", () => {
  const source = sourcePilot();
  source.fixture.brief.advertorial.storyBeats[0].text = "I revised the first prototype.";
  source.fixture.brief.advertorial.storyBeats[0].source.quote = "I revised the first prototype.";
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => /first-person.*releaseOnFile/i.test(issue)));
});

test("a legacy offer-only pilot still loads without advertorial editorial", () => {
  const source = sourcePilot();
  delete (source as Record<string, unknown>).sourceCampaign;
  delete (source.fixture.brief as Record<string, unknown>).advertorial;
  source.assets = [source.assets[0]];
  const result = validatePilotSource(source, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.fixture.brief.advertorial, undefined);
});

test("a malformed runtime manifest reports hash, dimensions and local URL errors", () => {
  const manifest = manifestFrom(sourcePilot());
  manifest.assets[0].src = "https://example.com/hero.webp";
  manifest.assets[0].contentHash = "not-a-hash";
  manifest.assets[0].width = 0;
  const result = validatePilotManifest(manifest, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.issues.some((issue) => /invalid local asset URL/i.test(issue)));
  assert.ok(result.issues.some((issue) => /contentHash must be a SHA-256 digest/i.test(issue)));
  assert.ok(result.issues.some((issue) => /width and height are required/i.test(issue)));
});

test("a pilot offer price must be an exact reviewed substring of the complete offer", () => {
  const valid = sourcePilot();
  (valid.fixture.brief as Record<string, unknown>).offerPrice = "30 November";
  assert.equal(
    validatePilotSource(valid, { pilotId: "morrow-pilot" }).ok,
    true,
  );

  const invalid = sourcePilot();
  (invalid.fixture.brief as Record<string, unknown>).offerPrice = "$4.94";
  const result = validatePilotSource(invalid, { pilotId: "morrow-pilot" });
  assert.equal(result.ok, false);
  assert.match(
    result.ok ? "" : result.issues.join(" "),
    /exact substring/,
  );
});
