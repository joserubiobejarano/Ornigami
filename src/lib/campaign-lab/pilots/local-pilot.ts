import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createCatalog } from "../fixtures.ts";
import type {
  ApprovedAsset,
  CampaignCatalog,
  CampaignFixture,
  PilotBundle,
} from "../types.ts";
import { pilotValidationMessage, validatePilotManifest } from "./pilot-manifest.ts";

const DEFAULT_PILOT_ID = "momisa";
const PILOT_ASSET_PREFIX = "/campaign-lab-pilots/";
const PILOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PILOT_ASSET_PATTERN = /^[a-z0-9][a-z0-9-]*\.(?:jpg|png|webp)$/;

function pilotAssetFile(id: string, src: string): string | null {
  if (!PILOT_ID_PATTERN.test(id)) return null;
  const prefix = PILOT_ASSET_PREFIX + id + "/";
  if (!src.startsWith(prefix)) return null;
  const filename = src.slice(prefix.length);
  return PILOT_ASSET_PATTERN.test(filename) ? join(pilotRoot(), id, "assets", filename) : null;
}

function pilotRoot(): string {
  return process.env.CAMPAIGN_LAB_PILOT_DIR?.trim() ||
    join(process.cwd(), ".local", "campaign-lab-pilots");
}

function pilotId(): string {
  return process.env.CAMPAIGN_LAB_PILOT_ID?.trim() || DEFAULT_PILOT_ID;
}

function approvedHeroId(manifest: {
  fixture: { brief: { advertorial?: { assetAssignments: readonly { role: string; assetId: string }[] } } };
  assets: readonly ApprovedAsset[];
}): string | null {
  const assigned = manifest.fixture.brief.advertorial?.assetAssignments.find(
    (assignment) => assignment.role === "product-hero",
  )?.assetId;
  if (assigned) return assigned;
  return manifest.assets.find((asset) => asset.role === "product-hero")?.id ?? null;
}

/**
 * Loads the optional local pilot package. Missing or malformed data leaves the
 * base lab intact and logs the exact manifest problem.
 */
export function loadLocalPilot(): PilotBundle | null {
  if (process.env.CAMPAIGN_LAB_PILOT_DISABLED === "true") return null;
  const id = pilotId();
  if (!PILOT_ID_PATTERN.test(id)) return null;
  const manifestPath = join(pilotRoot(), id, "manifest.json");
  if (!existsSync(manifestPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    const validation = validatePilotManifest(parsed, { pilotId: id });
    if (!validation.ok) {
      throw new Error(pilotValidationMessage(validation.issues));
    }
    const manifest = validation.value;

    for (const asset of manifest.assets) {
      const file = pilotAssetFile(id, asset.src);
      if (!file || !existsSync(file)) {
        throw new Error(`asset "${asset.id}" file is missing from the local pilot`);
      }
    }

    const heroId = approvedHeroId(manifest);
    if (!heroId || !manifest.assets.some((asset) => asset.id === heroId)) {
      throw new Error("the fixture brief must reference one of the approved assets");
    }

    const advertorialOpening = manifest.fixture.brief.advertorial?.openings[0];
    const defaultCopy =
      manifest.fixture.brief.copy ??
      manifest.fixture.openings?.[0]?.copy ??
      (advertorialOpening
        ? {
            headline: advertorialOpening.headline,
            lede: advertorialOpening.standfirst,
          }
        : undefined);
    if (!defaultCopy) throw new Error("an approved opening or default copy is required");

    const fixture: CampaignFixture = {
      id: manifest.fixture.id as CampaignFixture["id"],
      label: manifest.fixture.label,
      description: manifest.fixture.description,
      assetId: heroId,
      openings: manifest.fixture.openings,
      brief: {
        ...manifest.fixture.brief,
        fixtureId: manifest.fixture.id as CampaignFixture["id"],
        brandId: manifest.brand.id,
        assetId: heroId,
        copy: defaultCopy,
        ...(manifest.sourceCampaign
          ? { sourceCampaign: manifest.sourceCampaign }
          : {}),
      },
    };

    return {
      brand: manifest.brand,
      fixture,
      assets: manifest.assets,
      pilot: manifest.pilot,
    };
  } catch (error) {
    console.warn(
      `[campaign-lab] Ignoring local pilot "${pilotId()}": ${
        error instanceof Error ? error.message : "unknown load error"
      }`,
    );
    return null;
  }
}

export function readLocalPilotAsset(id: string, filename: string): Uint8Array<ArrayBuffer> | null {
  const pilot = loadLocalPilot();
  if (!pilot || pilot.pilot.id !== id) return null;
  const src = PILOT_ASSET_PREFIX + id + "/" + filename;
  const asset = pilot.assets.find((entry) => entry.src === src);
  const file = asset && pilotAssetFile(id, asset.src);
  if (!asset || !file) return null;

  try {
    const bytes = readFileSync(file);
    const digest = createHash("sha256").update(bytes).digest("hex");
    return digest === asset.contentHash.toLowerCase() ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

export function loadCampaignCatalog(): CampaignCatalog {
  return createCatalog(loadLocalPilot());
}
