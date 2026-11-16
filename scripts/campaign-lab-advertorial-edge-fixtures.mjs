#!/usr/bin/env node
/**
 * Writes deterministic local pilots for the advertorial review edge cases.
 *
 * Usage:
 *   node --experimental-strip-types scripts/campaign-lab-advertorial-edge-fixtures.mjs
 *   node --experimental-strip-types scripts/campaign-lab-advertorial-edge-fixtures.mjs --out <dir>
 *
 * The generated files are local-only and Git-ignored. They copy the approved
 * Morrow fixture assets from public/campaign-assets so image responses and
 * content hashes stay deterministic.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  APPROVED_ASSETS,
  BRANDS,
  CAMPAIGN_FIXTURES,
} from "../src/lib/campaign-lab/fixtures.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: cli } = parseArgs({
  options: {
    out: { type: "string", default: path.join(root, ".local", "campaign-lab-pilots") },
  },
});
const outRoot = path.resolve(root, cli.out);
const sourceFixture = CAMPAIGN_FIXTURES["morrow-advertorial-full"];
const brand = BRANDS["morrow-ceramic"];
const longLabel = "Morrow Ceramic Holiday Design Campaign and Prototype Review";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const PILOT_FILENAME = /^[a-z0-9][a-z0-9-]*\.(?:jpg|png|webp)$/;
const RASTER_FALLBACK = "morrow-ceramic-dripper.webp";

function publicFileFor(asset) {
  const sourceFilename = asset.src.startsWith("/campaign-assets/")
    ? asset.src.slice("/campaign-assets/".length)
    : path.basename(asset.src);
  const filename = PILOT_FILENAME.test(sourceFilename)
    ? sourceFilename
    : `${asset.id}.webp`;
  const sourceFile = PILOT_FILENAME.test(sourceFilename)
    ? sourceFilename
    : RASTER_FALLBACK;
  return {
    filename,
    file: path.join(root, "public", "campaign-assets", sourceFile),
  };
}

function sourceAssets() {
  const heroId = sourceFixture.brief.advertorial?.assetAssignments.find(
    (assignment) => assignment.role === "product-hero",
  )?.assetId;
  return APPROVED_ASSETS.filter(
    (asset) =>
      asset.id === heroId ||
      sourceFixture.brief.advertorial?.assetAssignments.some(
        (assignment) => assignment.assetId === asset.id,
      ),
  );
}

function buildPilot({ id, label, mutateFixture, mutateAssets }) {
  const sourceAssetList = sourceAssets();
  const assetId = new Map(
    sourceAssetList.map((asset) => [asset.id, `${id}-${asset.id}`]),
  );
  const assets = sourceAssetList.map((asset) => {
    const { filename, file: sourceFile } = publicFileFor(asset);
    return {
      ...asset,
      id: assetId.get(asset.id),
      brandId: brand.id,
      src: `/campaign-lab-pilots/${id}/${filename}`,
      file: path.join(outRoot, id, "assets", filename),
      sourceFile,
    };
  });

  const fixture = clone(sourceFixture);
  fixture.id = id;
  fixture.label = label;
  fixture.assetId = assetId.get(fixture.assetId);
  fixture.brief.fixtureId = id;
  fixture.brief.brandId = brand.id;
  fixture.brief.assetId = assetId.get(fixture.brief.assetId);
  fixture.brief.advertorial.assetAssignments =
    fixture.brief.advertorial.assetAssignments.map((assignment) => ({
      ...assignment,
      assetId: assetId.get(assignment.assetId),
    }));

  mutateFixture?.(fixture);
  mutateAssets?.(assets);

  return {
    id,
    label,
    fixture,
    assets,
  };
}

function manifestFor(pilot) {
  return {
    schemaVersion: 1,
    pilot: {
      id: pilot.id,
      label: pilot.label,
      status: "confirmed",
    },
    brand: clone(brand),
    sourceCampaign: {
      channel: "Local review fixture",
      promise: "Why the filter sits away from the wall",
      document: "Campaign Lab advertorial edge fixture",
      reviewedBy: "Local QA",
      reviewedOn: "2026-11-16",
    },
    fixture: pilot.fixture,
    assets: pilot.assets.map((entry) => {
      const asset = { ...entry };
      delete asset.file;
      delete asset.sourceFile;
      return asset;
    }),
  };
}

function finishFact() {
  return {
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
}

const pilots = [
  buildPilot({
    id: "review-four-facts",
    label: "Four required facts review",
    mutateFixture(fixture) {
      fixture.brief.productFacts.push(finishFact());
      fixture.brief.requiredFactGroups[0].factIds = [
        "interior",
        "outlet",
        "body",
        "finish",
      ];
    },
  }),
  buildPilot({
    id: "review-long-label",
    label: longLabel,
  }),
  buildPilot({
    id: "review-broken-image",
    label: "Broken supporting image review",
    mutateFixture(fixture) {
      fixture.description =
        "A required supporting image returns 404 so approval must stay blocked.";
    },
    mutateAssets(assets) {
      const supporting = assets.find((asset) => asset.role === "product-detail");
      if (!supporting) throw new Error("The Morrow fixture has no product-detail image.");
      supporting.contentHash = "0".repeat(64);
    },
  }),
];

for (const pilot of pilots) {
  const directory = path.join(outRoot, pilot.id);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(path.join(directory, "assets"), { recursive: true });

  for (const asset of pilot.assets) {
    copyFileSync(asset.sourceFile, asset.file);
    const digest = createHash("sha256").update(readFileSync(asset.file)).digest("hex");
    // The local pilot route checks the file hash. Keep the generated record
    // truthful, except for the intentionally broken-image case.
    if (asset.contentHash !== "0".repeat(64)) asset.contentHash = digest;
  }

  writeFileSync(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifestFor(pilot), null, 2)}\n`,
  );
  console.log(`${pilot.id}: ${directory}`);
}
