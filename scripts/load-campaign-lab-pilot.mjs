#!/usr/bin/env node
/**
 * Loads a local Campaign Lab pilot package into the editor and renderer.
 *
 * The source brief, rights notes, and copies of the images stay under the
 * Git-ignored pilot directory. The app reads the generated manifest on the server.
 *
 * Usage:
 *   node scripts/load-campaign-lab-pilot.mjs --pilot momisa
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import sharp from "sharp";

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
  if (source.schemaVersion !== 1) throw new Error("pilot source schemaVersion must be 1");
  if (!Array.isArray(source.assets) || source.assets.length === 0) {
    throw new Error("pilot source needs at least one asset");
  }

  if (source.pilot?.id !== cli.pilot) throw new Error("Pilot source ID must match its directory");

  mkdirSync(assetRoot, { recursive: true });
  const assets = [];

  for (const asset of source.assets) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(asset.id)) throw new Error("Invalid pilot asset ID");
    const file = path.resolve(root, asset.file);
    if (!existsSync(file)) throw new Error(`Asset not found: ${file}`);
    const bytes = readFileSync(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read dimensions for ${file}`);
    }
    const extension = { jpeg: ".jpg", png: ".png", webp: ".webp" }[metadata.format];
    if (!extension) throw new Error("Use a JPEG, PNG, or WebP pilot image");
    const filename = `${asset.id}${extension}`;
    const destination = path.join(assetRoot, filename);
    writeFileSync(destination, bytes);

    assets.push({
      id: asset.id,
      src: `/campaign-lab-pilots/${cli.pilot}/${filename}`,
      width: metadata.width,
      height: metadata.height,
      alt: asset.alt,
      role: asset.role,
      reviewed: asset.reviewed,
      reviewedBy: asset.reviewedBy,
      reviewedOn: asset.reviewedOn,
      source: asset.source,
      rights: asset.rights,
      crop: asset.crop,
      contentHash: digest,
    });
  }

  const manifest = {
    schemaVersion: 1,
    pilot: source.pilot,
    brand: source.brand,
    fixture: source.fixture,
    assets,
  };
  const manifestPath = path.join(pilotDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        status: "loaded",
        pilot: source.pilot.id,
        manifest: manifestPath,
        assetDirectory: assetRoot,
        assets: assets.map((asset) => ({
          id: asset.id,
          src: asset.src,
          width: asset.width,
          height: asset.height,
          contentHash: asset.contentHash,
          alt: asset.alt,
          crop: asset.crop,
        })),
      },
      null,
      2,
    ),
  );
}
