import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createCatalog } from "../fixtures.ts";
import type {
  ApprovedAsset,
  BrandDefinition,
  CampaignCatalog,
  CampaignFixture,
  CampaignOpening,
  PilotBundle,
  ProductFact,
} from "../types.ts";

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

type PilotManifest = {
  schemaVersion: 1;
  pilot: {
    id: string;
    label: string;
    status: "preview" | "confirmed";
    note?: string;
  };
  brand: BrandDefinition;
  fixture: {
    id: string;
    label: string;
    description: string;
    brief: Omit<CampaignFixture["brief"], "fixtureId" | "brandId" | "assetId" | "copy"> & {
      copy?: CampaignFixture["brief"]["copy"];
    };
    openings?: CampaignOpening[];
  };
  assets: ApprovedAsset[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFact(value: unknown): value is ProductFact {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  return (
    isString(value.id) &&
    isString(value.label) &&
    isString(value.value) &&
    isString(value.source.document) &&
    isString(value.source.quote) &&
    isString(value.source.reviewedBy) &&
    isString(value.source.reviewedOn)
  );
}

function validateManifest(value: unknown): PilotManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("manifest schemaVersion must be 1");
  }
  if (!isRecord(value.pilot) || !isString(value.pilot.id) || !isString(value.pilot.label)) {
    throw new Error("pilot id and label are required");
  }
  if (value.pilot.status !== "preview" && value.pilot.status !== "confirmed") {
    throw new Error('pilot status must be "preview" or "confirmed"');
  }
  if (!isRecord(value.brand) || !isString(value.brand.id) || !isString(value.brand.name)) {
    throw new Error("brand identity is required");
  }
  if (!isRecord(value.brand.tokens)) throw new Error("brand tokens are required");
  if (!isRecord(value.fixture) || !isString(value.fixture.id)) {
    throw new Error("fixture identity is required");
  }
  if (!isString(value.fixture.label) || !isString(value.fixture.description)) {
    throw new Error("fixture label and description are required");
  }
  if (!isRecord(value.fixture.brief)) throw new Error("fixture brief is required");
  if (!isString(value.fixture.brief.productName) ||
      !isString(value.fixture.brief.offer) ||
      !isString(value.fixture.brief.destinationUrl) ||
      !isString(value.fixture.brief.actionLabel) ||
      !isString(value.fixture.brief.productNoun)) {
    throw new Error("fixture brief requires productName, offer, destinationUrl, actionLabel and productNoun");
  }
  if (!Array.isArray(value.fixture.brief.productFacts) ||
      value.fixture.brief.productFacts.length === 0 ||
      !value.fixture.brief.productFacts.every(isFact)) {
    throw new Error("fixture brief requires approved product facts with source text");
  }
  if (value.fixture.openings !== undefined) {
    if (!Array.isArray(value.fixture.openings) || value.fixture.openings.length === 0) {
      throw new Error("openings must be a non-empty array when supplied");
    }
    for (const opening of value.fixture.openings) {
      if (!isRecord(opening) ||
          !isString(opening.id) ||
          !isString(opening.label) ||
          !isRecord(opening.copy) ||
          !isString(opening.copy.lede) ||
          (opening.copy.headline !== undefined && !isString(opening.copy.headline))) {
        throw new Error("each opening needs id, label, lede and optional headline");
      }
    }
  }
  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    throw new Error("at least one approved asset is required");
  }

  const id = value.pilot.id;
  const assets: ApprovedAsset[] = value.assets.map((asset, index) => {
    if (!isRecord(asset) ||
        !isString(asset.id) ||
        !isString(asset.src) ||
        !isString(asset.alt) ||
        !isString(asset.reviewedBy) ||
        !isString(asset.reviewedOn) ||
        !isString(asset.source) ||
        !isString(asset.rights) ||
        !isString(asset.contentHash)) {
      throw new Error(`asset[${index}] is incomplete`);
    }
    if (asset.reviewed !== true) throw new Error(`asset[${index}] must be reviewed`);
    if (asset.role !== "product-hero") throw new Error(`asset[${index}] must use the product-hero role`);
    const filename = pilotAssetFile(id, asset.src);
    if (!filename) throw new Error(`asset[${index}] has an invalid local asset URL`);
    if (!/^[a-f0-9]{64}$/i.test(asset.contentHash)) {
      throw new Error(`asset[${index}] contentHash must be a SHA-256 digest`);
    }
    if (typeof asset.width !== "number" || typeof asset.height !== "number" || asset.width <= 0 || asset.height <= 0) {
      throw new Error(`asset[${index}] width and height are required`);
    }
    if (!existsSync(filename)) throw new Error(`asset[${index}] file is missing from the local pilot`);
    return asset as ApprovedAsset;
  });

  const status = value.pilot.status;
  return {
    schemaVersion: 1,
    pilot: {
      id: value.pilot.id,
      label: value.pilot.label,
      status,
      ...(isString(value.pilot.note) ? { note: value.pilot.note } : {}),
    },
    brand: value.brand as unknown as BrandDefinition,
    fixture: value.fixture as unknown as PilotManifest["fixture"],
    assets,
  };
}

function pilotRoot(): string {
  return process.env.CAMPAIGN_LAB_PILOT_DIR?.trim() ||
    join(process.cwd(), ".local", "campaign-lab-pilots");
}

function pilotId(): string {
  return process.env.CAMPAIGN_LAB_PILOT_ID?.trim() || DEFAULT_PILOT_ID;
}

/** Loads the optional local pilot package. Missing/invalid data leaves the base lab intact. */
export function loadLocalPilot(): PilotBundle | null {
  if (process.env.CAMPAIGN_LAB_PILOT_DISABLED === "true") return null;
  const id = pilotId();
  if (!PILOT_ID_PATTERN.test(id)) return null;
  const manifestPath = join(pilotRoot(), id, "manifest.json");
  if (!existsSync(manifestPath)) return null;

  try {
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
    if (manifest.pilot.id !== id) throw new Error("pilot manifest ID must match its directory");
    const assetIds = new Set(manifest.assets.map((asset) => asset.id));
    const fixtureId = manifest.fixture.id;
    if (manifest.fixture.brief.productFacts.some((fact, index) =>
      manifest.fixture.brief.productFacts.findIndex((candidate) => candidate.id === fact.id) !== index)) {
      throw new Error("approved fact IDs must be unique");
    }
    const openings = manifest.fixture.openings;
    const defaultCopy = manifest.fixture.brief.copy ?? openings?.[0]?.copy;
    if (!defaultCopy) throw new Error("an approved opening or default copy is required");
    if (openings && new Set(openings.map((opening) => opening.id)).size !== openings.length) {
      throw new Error("opening IDs must be unique");
    }

    const fixture: CampaignFixture = {
      id: fixtureId as CampaignFixture["id"],
      label: manifest.fixture.label,
      description: manifest.fixture.description,
      assetId: manifest.assets[0].id,
      openings,
      brief: {
        ...manifest.fixture.brief,
        fixtureId: fixtureId as CampaignFixture["id"],
        brandId: manifest.brand.id,
        assetId: manifest.assets[0].id,
        copy: defaultCopy,
      },
    };

    if (!assetIds.has(fixture.brief.assetId)) {
      throw new Error("the fixture brief must reference one of the approved assets");
    }

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
