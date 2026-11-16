#!/usr/bin/env node
/**
 * Stages the committed synthetic review pilots into the Git-ignored local
 * pilot directory the editor reads.
 *
 * The manifests under `tests/fixtures/campaign-lab/pilots/` are the exact
 * runtime inputs for the review cases. The shared image bytes are copied beside
 * each manifest and checked against the manifest SHA-256 before the app sees
 * them. Nothing private is written to the repository.
 *
 * Usage:
 *   node scripts/prepare-campaign-lab-review-pilots.mjs
 *   node scripts/prepare-campaign-lab-review-pilots.mjs --only review-four-facts
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { validatePilotManifest } from "../src/lib/campaign-lab/pilots/pilot-manifest.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesRoot = path.join(root, "tests", "fixtures", "campaign-lab", "pilots");
const localRoot = path.join(root, ".local", "campaign-lab-pilots");

const { values: cli } = parseArgs({
  options: {
    only: { type: "string", multiple: true, default: [] },
  },
});

const requested = cli.only.flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean);
const pilotDirectories = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "shared")
  .map((entry) => entry.name)
  .filter((name) => requested.length === 0 || requested.includes(name))
  .sort();

if (pilotDirectories.length === 0) {
  console.error("No matching synthetic pilots. Available: " +
    readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "shared")
      .map((entry) => entry.name)
      .join(", "));
  process.exitCode = 2;
} else {
  const staged = [];
  for (const id of pilotDirectories) {
    const sourceDir = path.join(fixturesRoot, id);
    const manifestPath = path.join(sourceDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`Missing manifest for pilot "${id}"`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const validation = validatePilotManifest(manifest, { pilotId: id });
    if (!validation.ok) {
      throw new Error(`Pilot "${id}" is not schema-valid: ${validation.issues.join("; ")}`);
    }

    const localDir = path.join(localRoot, id);
    const assetDir = path.join(localDir, "assets");
    mkdirSync(assetDir, { recursive: true });

    const assets = [];
    for (const asset of validation.value.assets) {
      const filename = asset.src.slice(`/campaign-lab-pilots/${id}/`.length);
      const shared = path.join(fixturesRoot, "shared", filename);
      if (!existsSync(shared)) {
        throw new Error(`Pilot "${id}" needs shared asset "${filename}"`);
      }
      const bytes = readFileSync(shared);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (digest !== asset.contentHash.toLowerCase()) {
        throw new Error(
          `Pilot "${id}" asset "${asset.id}" hash mismatch: expected ${asset.contentHash}, got ${digest}`,
        );
      }
      const destination = path.join(assetDir, filename);
      copyFileSync(shared, destination);
      assets.push({ id: asset.id, filename, contentHash: digest });
    }

    writeFileSync(path.join(localDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    staged.push({ pilot: id, manifest: path.relative(root, path.join(localDir, "manifest.json")), assets });
  }

  console.log(
    JSON.stringify(
      {
        status: "staged",
        root: path.relative(root, localRoot) || ".",
        pilots: staged,
      },
      null,
      2,
    ),
  );
}
