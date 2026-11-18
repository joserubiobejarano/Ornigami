import { parseCampaignContext } from "../campaign-context.ts";
import type {
  AdvertorialBriefData,
  AdvertorialLayoutId,
  AdvertorialOpening,
  AdvertorialNarrator,
  ApprovedAsset,
  ApprovedFactSource,
  ApprovedStoryBeat,
  AssetAssignment,
  BrandDefinition,
  CampaignFixture,
  CampaignOpening,
  CampaignSource,
  Disclosure,
  ProductFact,
} from "../types.ts";

export const PILOT_ASSET_ROLES = [
  "product-hero",
  "story-opening",
  "product-detail",
  "product-in-use",
  "product-evidence",
] as const;

const ADVERTORIAL_LAYOUTS: readonly AdvertorialLayoutId[] = [
  "advertorial-full",
  "advertorial-one-photo",
];

const DISCLOSURE_LABELS: readonly Disclosure["label"][] = [
  "Advertisement",
  "Advertorial",
  "Paid Post",
  "Paid content",
];

const STORY_ROLES: readonly ApprovedStoryBeat["role"][] = [
  "opening",
  "turn",
  "resolution",
];

const PILOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PILOT_ASSET_PATTERN = /^[a-z0-9][a-z0-9-]*\.(?:jpg|png|webp)$/;
const PILOT_ASSET_PREFIX = "/campaign-lab-pilots/";
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export type PilotManifest = {
  schemaVersion: 1;
  pilot: {
    id: string;
    label: string;
    status: "preview" | "confirmed";
    note?: string;
  };
  brand: BrandDefinition;
  /** Private campaign source recorded for editorial review. */
  sourceCampaign?: CampaignSource;
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

type PilotSourceAsset = {
  id: string;
  file: string;
  alt: string;
  role: ApprovedAsset["role"];
  reviewed: true;
  reviewedBy: string;
  reviewedOn: string;
  source: string;
  rights: string;
  crop?: string;
  caption?: string;
};

export type PilotSource = {
  schemaVersion: 1;
  pilot: PilotManifest["pilot"];
  brand: BrandDefinition;
  sourceCampaign?: CampaignSource;
  fixture: PilotManifest["fixture"];
  assets: PilotSourceAsset[];
};

export type PilotValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

export type PilotValidateOptions = {
  /** The directory name the package is loaded from. */
  pilotId?: string;
  /** The manifest has already copied assets and can be checked for paths. */
  requireRuntimeAssets?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isFactSource(value: unknown): value is ApprovedFactSource {
  return (
    isRecord(value) &&
    isString(value.document) &&
    isString(value.quote) &&
    isString(value.reviewedBy) &&
    isString(value.reviewedOn)
  );
}

function isFact(value: unknown): value is ProductFact {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isString(value.value) &&
    isFactSource(value.source)
  );
}

function isCampaignSource(value: unknown): value is CampaignSource {
  return (
    isRecord(value) &&
    isString(value.channel) &&
    isString(value.promise) &&
    isString(value.document) &&
    isString(value.reviewedBy) &&
    isString(value.reviewedOn)
  );
}

function isAdvertorialOpening(value: unknown): value is AdvertorialOpening {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.headline) &&
    isString(value.standfirst)
  );
}

function isStoryBeat(value: unknown): value is ApprovedStoryBeat {
  return (
    isRecord(value) &&
    isString(value.id) &&
    STORY_ROLES.includes(value.role as ApprovedStoryBeat["role"]) &&
    isString(value.text) &&
    isFactSource(value.source)
  );
}

function isDisclosure(value: unknown): value is Disclosure {
  return (
    isRecord(value) &&
    DISCLOSURE_LABELS.includes(value.label as Disclosure["label"]) &&
    isString(value.sponsor) &&
    isString(value.explanation) &&
    typeof value.repeatAtClose === "boolean"
  );
}

function isNarrator(value: unknown): value is AdvertorialNarrator {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.role) &&
    isString(value.source) &&
    typeof value.releaseOnFile === "boolean"
  );
}

function isAssignment(value: unknown): value is AssetAssignment {
  return (
    isRecord(value) &&
    PILOT_ASSET_ROLES.includes(value.role as ApprovedAsset["role"]) &&
    isString(value.assetId)
  );
}

function isCampaignOpening(value: unknown): value is CampaignOpening {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isRecord(value.copy) &&
    isString(value.copy.lede) &&
    (value.copy.headline === undefined || isString(value.copy.headline))
  );
}

function uniqueIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const duplicate = seen.has(value.id);
      seen.add(value.id);
      return duplicate;
    })
    .map((value) => value.id);
}

function firstPersonCopy(data: AdvertorialBriefData): string {
  return [
    ...data.openings.map((opening) => `${opening.headline} ${opening.standfirst}`),
    ...data.storyBeats.map((beat) => beat.text),
    data.productTransition,
  ].join(" ");
}

function validateEditorial(
  editorial: unknown,
  assets: readonly { id: string; role: string }[],
  sourceCampaign: unknown,
  issues: string[],
): AdvertorialBriefData | null {
  if (!isRecord(editorial)) {
    issues.push("fixture.brief.advertorial must be an object");
    return null;
  }

  if (sourceCampaign === undefined) {
    issues.push("sourceCampaign is required when fixture.brief.advertorial is supplied");
  } else if (!isCampaignSource(sourceCampaign)) {
    issues.push(
      "sourceCampaign needs channel, promise, document, reviewedBy and reviewedOn",
    );
  }

  const openings = editorial.openings;
  if (!Array.isArray(openings) || openings.length === 0) {
    issues.push("fixture.brief.advertorial.openings must be a non-empty array");
  } else {
    for (const [index, opening] of openings.entries()) {
      if (!isAdvertorialOpening(opening)) {
        issues.push(
          `fixture.brief.advertorial.openings[${index}] needs id, headline and standfirst`,
        );
      }
    }
    if (openings.every(isAdvertorialOpening)) {
      const duplicates = uniqueIds(openings);
      if (duplicates.length > 0) {
        issues.push(`advertorial opening IDs must be unique: ${duplicates.join(", ")}`);
      }
    }
  }

  const beats = editorial.storyBeats;
  if (!Array.isArray(beats)) {
    issues.push("fixture.brief.advertorial.storyBeats must be an array");
  } else {
    if (beats.length < 2) {
      issues.push("fixture.brief.advertorial.storyBeats needs at least two approved beats");
    }
    if (beats.length > 3) {
      issues.push("fixture.brief.advertorial.storyBeats accepts at most three beats");
    }
    for (const [index, beat] of beats.entries()) {
      if (!isStoryBeat(beat)) {
        issues.push(
          `fixture.brief.advertorial.storyBeats[${index}] needs id, role, text and a complete source`,
        );
      }
    }
    if (beats.every(isStoryBeat)) {
      const duplicates = uniqueIds(beats);
      if (duplicates.length > 0) {
        issues.push(`advertorial story beat IDs must be unique: ${duplicates.join(", ")}`);
      }
      let lastRole = -1;
      for (const beat of beats) {
        const roleIndex = STORY_ROLES.indexOf(beat.role);
        if (roleIndex < lastRole) {
          issues.push(`story beat "${beat.id}" is outside the opening-to-turn arc`);
        }
        lastRole = Math.max(lastRole, roleIndex);
      }
    }
  }

  if (editorial.narrator !== undefined && !isNarrator(editorial.narrator)) {
    issues.push(
      "fixture.brief.advertorial.narrator needs name, role, source and releaseOnFile",
    );
  }

  if (!isDisclosure(editorial.disclosure)) {
    issues.push(
      "fixture.brief.advertorial.disclosure needs an approved label, sponsor, explanation and repeatAtClose",
    );
  }

  if (!isString(editorial.productTransition)) {
    issues.push("fixture.brief.advertorial.productTransition is required");
  }

  const assignments = editorial.assetAssignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    issues.push("fixture.brief.advertorial.assetAssignments must be a non-empty array");
  } else {
    for (const [index, assignment] of assignments.entries()) {
      if (!isAssignment(assignment)) {
        issues.push(
          `fixture.brief.advertorial.assetAssignments[${index}] needs an approved role and assetId`,
        );
        continue;
      }
      const asset = assets.find((candidate) => candidate.id === assignment.assetId);
      if (!asset) {
        issues.push(
          `asset assignment "${assignment.role}" references unknown asset "${assignment.assetId}"`,
        );
      } else if (asset.role !== assignment.role) {
        issues.push(
          `asset "${assignment.assetId}" is approved as ${asset.role}, not ${assignment.role}`,
        );
      }
    }
    if (assignments.every(isAssignment)) {
      const duplicateRoles = uniqueIds(
        assignments.map((assignment) => ({ id: assignment.role })),
      );
      if (duplicateRoles.length > 0) {
        issues.push(`asset roles must be unique: ${duplicateRoles.join(", ")}`);
      }
      const duplicateAssets = uniqueIds(
        assignments.map((assignment) => ({ id: assignment.assetId })),
      );
      if (duplicateAssets.length > 0) {
        issues.push(`assigned asset IDs must be unique: ${duplicateAssets.join(", ")}`);
      }
      if (!assignments.some((assignment) => assignment.role === "product-hero")) {
        issues.push("fixture.brief.advertorial needs one product-hero asset assignment");
      }
    }
  }

  if (
    editorial.preferredLayout !== undefined &&
    !ADVERTORIAL_LAYOUTS.includes(editorial.preferredLayout as AdvertorialLayoutId)
  ) {
    issues.push("fixture.brief.advertorial.preferredLayout is not supported");
  }

  const normalized = {
    openings: Array.isArray(openings) ? openings : [],
    storyBeats: Array.isArray(beats) ? beats : [],
    ...(editorial.narrator !== undefined ? { narrator: editorial.narrator } : {}),
    disclosure: editorial.disclosure,
    productTransition: editorial.productTransition,
    assetAssignments: Array.isArray(assignments) ? assignments : [],
    ...(editorial.preferredLayout !== undefined
      ? { preferredLayout: editorial.preferredLayout }
      : {}),
  } as AdvertorialBriefData;

  if (
    /\b(I|we|my|our)\b/i.test(firstPersonCopy(normalized)) &&
    !normalized.narrator?.releaseOnFile
  ) {
    issues.push(
      "first-person advertorial copy needs a named narrator with releaseOnFile: true",
    );
  }

  return normalized;
}

function validateFixture(
  fixture: unknown,
  assets: readonly { id: string; role: string }[],
  sourceCampaign: unknown,
  issues: string[],
): PilotManifest["fixture"] | null {
  if (!isRecord(fixture) || !isString(fixture.id)) {
    issues.push("fixture.id is required");
    return null;
  }
  if (!isString(fixture.label) || !isString(fixture.description)) {
    issues.push("fixture.label and fixture.description are required");
  }
  if (!isRecord(fixture.brief)) {
    issues.push("fixture.brief is required");
    return null;
  }

  const brief = fixture.brief;
  const requiredFields = [
    "productName",
    "offer",
    "destinationUrl",
    "actionLabel",
    "productNoun",
  ] as const;
  for (const field of requiredFields) {
    if (!isString(brief[field])) {
      issues.push(`fixture.brief.${field} is required`);
    }
  }

  const context = parseCampaignContext({
    audience: brief.audience,
    objective: brief.objective,
  });
  if (!context.ok) {
    for (const issue of context.issues) {
      issues.push(`fixture.brief.${issue.field}: ${issue.message}`);
    }
  }

  if (brief.offerPrice !== undefined) {
    if (!isString(brief.offerPrice)) {
      issues.push("fixture.brief.offerPrice must be text");
    } else if (
      typeof brief.offer !== "string" ||
      !brief.offer.includes(brief.offerPrice)
    ) {
      issues.push(
        "fixture.brief.offerPrice must be an exact substring of fixture.brief.offer",
      );
    }
  }

  if (!Array.isArray(brief.productFacts) || brief.productFacts.length === 0) {
    issues.push("fixture.brief.productFacts must be a non-empty array");
  } else {
    for (const [index, fact] of brief.productFacts.entries()) {
      if (!isFact(fact)) {
        issues.push(
          `fixture.brief.productFacts[${index}] needs id, label, value and an approved source`,
        );
      }
    }
    if (brief.productFacts.every(isFact)) {
      const duplicates = uniqueIds(brief.productFacts);
      if (duplicates.length > 0) {
        issues.push(`approved fact IDs must be unique: ${duplicates.join(", ")}`);
      }
    }
  }

  if (brief.requiredFactGroups !== undefined) {
    if (!Array.isArray(brief.requiredFactGroups)) {
      issues.push("fixture.brief.requiredFactGroups must be an array when supplied");
    } else {
      const factIds = new Set(
        Array.isArray(brief.productFacts)
          ? brief.productFacts.filter(isFact).map((fact) => fact.id)
          : [],
      );
      const groupIds = new Set<string>();
      for (const [index, group] of brief.requiredFactGroups.entries()) {
        if (
          !isRecord(group) ||
          !isString(group.id) ||
          !isString(group.label) ||
          !Array.isArray(group.factIds) ||
          group.factIds.length === 0 ||
          group.factIds.some((id) => !isString(id) || !factIds.has(id))
        ) {
          issues.push(
            `fixture.brief.requiredFactGroups[${index}] needs an id, label and approved fact IDs`,
          );
          continue;
        }
        if (groupIds.has(group.id)) {
          issues.push(`required fact group "${group.id}" is duplicated`);
        }
        if (new Set(group.factIds).size !== group.factIds.length) {
          issues.push(`required fact group "${group.id}" repeats a fact ID`);
        }
        groupIds.add(group.id);
      }
    }
  }

  if (brief.copy !== undefined) {
    if (
      !isRecord(brief.copy) ||
      !isString(brief.copy.lede) ||
      (brief.copy.headline !== undefined && !isString(brief.copy.headline))
    ) {
      issues.push("fixture.brief.copy needs lede and optional headline");
    }
  }

  if (fixture.openings !== undefined) {
    if (!Array.isArray(fixture.openings) || fixture.openings.length === 0) {
      issues.push("fixture.openings must be a non-empty array when supplied");
    } else {
      for (const [index, opening] of fixture.openings.entries()) {
        if (!isCampaignOpening(opening)) {
          issues.push(`fixture.openings[${index}] needs id, label, lede and optional headline`);
        }
      }
      if (fixture.openings.every(isCampaignOpening)) {
        const duplicates = uniqueIds(fixture.openings);
        if (duplicates.length > 0) {
          issues.push(`opening IDs must be unique: ${duplicates.join(", ")}`);
        }
      }
    }
  }

  const advertorial =
    brief.advertorial === undefined
      ? null
      : validateEditorial(brief.advertorial, assets, sourceCampaign, issues);

  if (!brief.copy && !fixture.openings && !advertorial?.openings.length) {
    issues.push("an approved opening or default copy is required");
  }

  return {
    ...(fixture as unknown as PilotManifest["fixture"]),
    brief: {
      ...(brief as unknown as PilotManifest["fixture"]["brief"]),
      ...(context.ok
        ? { audience: context.audience, objective: context.objective }
        : {}),
      ...(advertorial ? { advertorial } : {}),
    },
  };
}

function validateAssets(
  value: unknown,
  pilotId: string,
  runtime: boolean,
  brandId: string,
  issues: string[],
): ApprovedAsset[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push("assets must be a non-empty array");
    return [];
  }

  const assets: ApprovedAsset[] = [];
  const ids = new Set<string>();
  for (const [index, asset] of value.entries()) {
    if (
      !isRecord(asset) ||
      !isString(asset.id) ||
      !isString(asset.alt) ||
      !isString(asset.reviewedBy) ||
      !isString(asset.reviewedOn) ||
      !isString(asset.source) ||
      !isString(asset.rights)
    ) {
      issues.push(
        `assets[${index}] needs id, alt, reviewedBy, reviewedOn, source and rights`,
      );
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(asset.id)) {
      issues.push(`assets[${index}] has an invalid asset ID`);
    }
    if (ids.has(asset.id)) {
      issues.push(`asset ID "${asset.id}" is duplicated`);
    }
    ids.add(asset.id);

    if (asset.reviewed !== true) {
      issues.push(`asset "${asset.id}" must be reviewed`);
    }
    if (!PILOT_ASSET_ROLES.includes(asset.role as ApprovedAsset["role"])) {
      issues.push(
        `asset "${asset.id}" has unsupported role "${String(asset.role)}"; use ${PILOT_ASSET_ROLES.join(", ")}`,
      );
    }
    if (asset.crop !== undefined && !isString(asset.crop)) {
      issues.push(`asset "${asset.id}" crop must be a non-empty string when supplied`);
    }
    if (asset.caption !== undefined && !isString(asset.caption)) {
      issues.push(`asset "${asset.id}" caption must be a non-empty string when supplied`);
    }

    if (runtime) {
      if (!isString(asset.src)) {
        issues.push(`asset "${asset.id}" src is required`);
      } else {
        const prefix = PILOT_ASSET_PREFIX + pilotId + "/";
        const filename = asset.src.startsWith(prefix) ? asset.src.slice(prefix.length) : "";
        if (!filename || !PILOT_ASSET_PATTERN.test(filename)) {
          issues.push(`asset "${asset.id}" has an invalid local asset URL`);
        }
      }
      if (!isString(asset.contentHash) || !SHA256_PATTERN.test(asset.contentHash)) {
        issues.push(`asset "${asset.id}" contentHash must be a SHA-256 digest`);
      }
      if (
        typeof asset.width !== "number" ||
        typeof asset.height !== "number" ||
        asset.width <= 0 ||
        asset.height <= 0
      ) {
        issues.push(`asset "${asset.id}" width and height are required`);
      }
      if (asset.brandId !== undefined && asset.brandId !== brandId) {
        issues.push(`asset "${asset.id}" brandId must match the pilot brand`);
      }
    } else if (!isString(asset.file)) {
      issues.push(`asset "${asset.id}" needs a source file`);
    }

    if (
      !PILOT_ASSET_ROLES.includes(asset.role as ApprovedAsset["role"]) ||
      asset.reviewed !== true
    ) {
      continue;
    }

    assets.push({
      ...(asset as unknown as ApprovedAsset),
      brandId: brandId as ApprovedAsset["brandId"],
      role: asset.role as ApprovedAsset["role"],
    });
  }

  return assets;
}

function validateCommon(
  value: unknown,
  options: PilotValidateOptions,
  runtime: boolean,
): PilotValidationResult<PilotManifest | PilotSource> {
  const issues: string[] = [];
  const pilotId = options.pilotId;

  if (!isRecord(value) || value.schemaVersion !== 1) {
    return { ok: false, issues: ["schemaVersion must be 1"] };
  }
  if (!isRecord(value.pilot) || !isString(value.pilot.id) || !isString(value.pilot.label)) {
    issues.push("pilot id and label are required");
  }
  if (
    isRecord(value.pilot) &&
    isString(value.pilot.id) &&
    !PILOT_ID_PATTERN.test(value.pilot.id)
  ) {
    issues.push("pilot id must use lowercase letters, digits and hyphens");
  }
  if (
    pilotId &&
    isRecord(value.pilot) &&
    isString(value.pilot.id) &&
    value.pilot.id !== pilotId
  ) {
    issues.push("pilot manifest ID must match its directory");
  }
  if (
    !isRecord(value.pilot) ||
    (value.pilot.status !== "preview" && value.pilot.status !== "confirmed")
  ) {
    issues.push('pilot status must be "preview" or "confirmed"');
  }
  if (value.pilot && isRecord(value.pilot) && value.pilot.note !== undefined && !isString(value.pilot.note)) {
    issues.push("pilot note must be a non-empty string when supplied");
  }

  if (!isRecord(value.brand) || !isString(value.brand.id) || !isString(value.brand.name)) {
    issues.push("brand id and name are required");
  }
  if (!isRecord(value.brand) || !isRecord(value.brand.tokens)) {
    issues.push("brand tokens are required");
  } else {
    for (const token of ["page", "surface", "ink", "accent", "accentInk", "line"]) {
      if (!isHexColor(value.brand.tokens[token])) {
        issues.push(`brand.tokens.${token} must be a six-digit hex color`);
      }
    }
  }
  if (
    isRecord(value.brand) &&
    value.brand.headlineMode !== "offer-led" &&
    value.brand.headlineMode !== "product-led" &&
    value.brand.headlineMode !== "angle"
  ) {
    issues.push(
      'brand headlineMode must be "offer-led", "product-led", or "angle"',
    );
  }

  if (value.sourceCampaign !== undefined && !isCampaignSource(value.sourceCampaign)) {
    issues.push(
      "sourceCampaign needs channel, promise, document, reviewedBy and reviewedOn",
    );
  }

  const brandId =
    isRecord(value.brand) && isString(value.brand.id) ? value.brand.id : "pilot";
  const assets = validateAssets(value.assets, pilotId ?? "", runtime, brandId, issues);
  const fixture = validateFixture(value.fixture, assets, value.sourceCampaign, issues);

  if (issues.length > 0) return { ok: false, issues: [...new Set(issues)] };

  const pilot = value.pilot as PilotManifest["pilot"];
  const sourceCampaign = isCampaignSource(value.sourceCampaign)
    ? value.sourceCampaign
    : undefined;
  if (runtime) {
    return {
      ok: true,
      value: {
        schemaVersion: 1,
        pilot: {
          id: pilot.id,
          label: pilot.label,
          status: pilot.status,
          ...(isString(pilot.note) ? { note: pilot.note } : {}),
        },
        brand: value.brand as unknown as BrandDefinition,
        ...(sourceCampaign ? { sourceCampaign } : {}),
        fixture: fixture!,
        assets,
      },
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      pilot: {
        id: pilot.id,
        label: pilot.label,
        status: pilot.status,
        ...(isString(pilot.note) ? { note: pilot.note } : {}),
      },
      brand: value.brand as unknown as BrandDefinition,
      ...(sourceCampaign ? { sourceCampaign } : {}),
      fixture: fixture!,
      assets: (value.assets as unknown[]).map((asset) => {
        const entry = asset as Record<string, unknown>;
        return {
          id: entry.id as string,
          file: entry.file as string,
          alt: entry.alt as string,
          role: entry.role as ApprovedAsset["role"],
          reviewed: true,
          reviewedBy: entry.reviewedBy as string,
          reviewedOn: entry.reviewedOn as string,
          source: entry.source as string,
          rights: entry.rights as string,
          ...(entry.crop !== undefined ? { crop: entry.crop as string } : {}),
          ...(entry.caption !== undefined ? { caption: entry.caption as string } : {}),
        };
      }),
    },
  };
}

/** Validates the operator-authored `pilot.json` before assets are copied. */
export function validatePilotSource(
  value: unknown,
  options: PilotValidateOptions = {},
): PilotValidationResult<PilotSource> {
  return validateCommon(value, options, false) as PilotValidationResult<PilotSource>;
}

/** Validates the generated `manifest.json` read by the server. */
export function validatePilotManifest(
  value: unknown,
  options: PilotValidateOptions = {},
): PilotValidationResult<PilotManifest> {
  return validateCommon(value, options, true) as PilotValidationResult<PilotManifest>;
}

export function pilotValidationMessage(issues: readonly string[]): string {
  return issues.join("; ");
}
