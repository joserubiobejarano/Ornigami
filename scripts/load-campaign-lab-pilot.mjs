#!/usr/bin/env node
/**
 * Loads a local Campaign Lab pilot package into the editor and renderer.
 *
 * The source brief and rights notes stay under `.local/campaign-lab-pilots/`
 * and the copied assets stay under the Git-ignored
 * `public/campaign-lab-pilots/` path. The app reads the generated manifest
 * server-side and merges it into the reviewed base catalog.
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
    "public-dir": { type: "string", default: "public/campaign-lab-pilots" },
  },
});

const root = process.cwd();
const pilotDir = path.resolve(root, cli["pilot-dir"], cli.pilot);
const publicRoot = path.resolve(root, cli["public-dir"], cli.pilot);
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

  mkdirSync(publicRoot, { recursive: true });
  const assets = [];

  for (const asset of source.assets) {
    const file = path.resolve(root, asset.file);
    if (!existsSync(file)) throw new Error(`Asset not found: ${file}`);
    const bytes = readFileSync(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read dimensions for ${file}`);
    }
    const extension = path.extname(file).toLowerCase() || ".jpg";
    const filename = `${asset.id}${extension}`;
    const destination = path.join(publicRoot, filename);
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
      sourceFile: file,
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
        publicDirectory: publicRoot,
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
