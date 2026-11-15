#!/usr/bin/env node
/**
 * Loads a local Campaign Lab pilot package into the editor and renderer.
 *
 * The source brief, rights notes, campaign promise, and copies of the images
 * stay under the Git-ignored pilot directory. The app reads the generated
 * manifest on the server. Source file paths and raw source material are never
 * copied into the manifest or printed in the command output.
 *
 * Usage:
 *   node --experimental-strip-types scripts/load-campaign-lab-pilot.mjs --pilot momisa
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import sharp from "sharp";

import {
  pilotValidationMessage,
  validatePilotManifest,
  validatePilotSource,
} from "../src/lib/campaign-lab/pilots/pilot-manifest.ts";

const { values: cli } = parseArgs({
  options: {
    pilot: { type: "string", short: "p", default: "momisa" },
    "pilot-dir": { type: "string", default: ".local/campaign-lab-pilots" },
  },
});

if (!/^[a-z0-9][a-z0-9-]*$/.test(cli.pilot)) throw new Error("Invalid pilot ID");

const root = process.cwd();
const pilotDir = path.resolve(root, cli["pilot-dir"], cli.pilot);
const assetRoot = path.join(pilotDir, "assets");
const sourcePath = path.join(pilotDir, "pilot.json");

if (!existsSync(sourcePath)) {
  console.error(`Pilot source not found: ${sourcePath}`);
  process.exitCode = 2;
} else {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const validation = validatePilotSource(source, { pilotId: cli.pilot });
  if (!validation.ok) {
    console.error("Pilot source is invalid:");
    for (const issue of validation.issues) console.error(`- ${issue}`);
    process.exitCode = 2;
  } else {
    const normalized = validation.value;
    mkdirSync(assetRoot, { recursive: true });
    const assets = [];

    for (const asset of normalized.assets) {
      const file = path.resolve(root, asset.file);
      if (!existsSync(file)) throw new Error(`Asset not found: ${asset.file}`);
      const bytes = readFileSync(file);
      const digest = createHash("sha256").update(bytes).digest("hex");
      const metadata = await sharp(bytes).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error(`Could not read dimensions for asset "${asset.id}"`);
      }
      const extension = { jpeg: ".jpg", png: ".png", webp: ".webp" }[metadata.format];
      if (!extension) throw new Error("Use a JPEG, PNG, or WebP pilot image");
      const filename = `${asset.id}${extension}`;
      const destination = path.join(assetRoot, filename);
      writeFileSync(destination, bytes);

      assets.push({
        id: asset.id,
        brandId: normalized.brand.id,
        src: `/campaign-lab-pilots/${cli.pilot}/${filename}`,
        width: metadata.width,
        height: metadata.height,
        alt: asset.alt,
        role: asset.role,
        reviewed: true,
        reviewedBy: asset.reviewedBy,
        reviewedOn: asset.reviewedOn,
        source: asset.source,
        rights: asset.rights,
        ...(asset.crop ? { crop: asset.crop } : {}),
        ...(asset.caption ? { caption: asset.caption } : {}),
        contentHash: digest,
      });
    }

    const manifest = {
      schemaVersion: 1,
      pilot: normalized.pilot,
      brand: normalized.brand,
      ...(normalized.sourceCampaign
        ? { sourceCampaign: normalized.sourceCampaign }
        : {}),
      fixture: normalized.fixture,
      assets,
    };

    const manifestCheck = validatePilotManifest(manifest, { pilotId: cli.pilot });
    if (!manifestCheck.ok) {
      throw new Error(`Generated manifest is invalid: ${pilotValidationMessage(manifestCheck.issues)}`);
    }

    const manifestPath = path.join(pilotDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    console.log(
      JSON.stringify(
        {
          status: "loaded",
          pilot: normalized.pilot.id,
          manifest: manifestPath,
          assetDirectory: assetRoot,
          sourceCampaign: normalized.sourceCampaign
            ? {
                channel: normalized.sourceCampaign.channel,
                reviewedBy: normalized.sourceCampaign.reviewedBy,
                reviewedOn: normalized.sourceCampaign.reviewedOn,
              }
            : null,
          assets: assets.map((asset) => ({
            id: asset.id,
            role: asset.role,
            src: asset.src,
            width: asset.width,
            height: asset.height,
            contentHash: asset.contentHash,
            alt: asset.alt,
            crop: asset.crop,
            caption: asset.caption,
          })),
        },
        null,
        2,
      ),
    );
  }
}
