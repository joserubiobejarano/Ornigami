import type { ApprovedAsset, PilotDescriptor } from "./types.ts";

export type VerificationFieldStatus = "confirmed" | "provisional" | "missing";

export type VerificationField = {
  value: string | null;
  status: VerificationFieldStatus;
  source: string;
  note?: string | null;
  reviewedBy?: string | null;
  reviewedOn?: string | null;
  missingEvidence?: string[];
};

export type VerificationPackshotField = VerificationField & {
  assetId: string;
  contentHash: string | null;
};

/**
 * Provenance for a local pilot export. It records what the existing pilot
 * manifest actually reviewed, where each value came from, and which review
 * evidence the manifest does not contain. It never upgrades missing reviewer
 * identity or date into evidence.
 */
export type CampaignVerificationProvenance = {
  source: "pilot-manifest";
  pilotId: string;
  pilotStatus: "preview" | "confirmed";
  note: string | null;
  offer: VerificationField;
  destination: VerificationField;
  offerPrice: VerificationField;
  rights: VerificationField;
  packshot: VerificationPackshotField;
  missingEvidence: string[];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function fieldStatus(
  pilotStatus: PilotDescriptor["status"],
): VerificationFieldStatus {
  return pilotStatus === "confirmed" ? "confirmed" : "provisional";
}

function rightsStatus(asset: ApprovedAsset): VerificationFieldStatus {
  if (!asset.rights?.trim()) return "missing";
  return asset.reviewed ? "confirmed" : "provisional";
}

function packshotStatus(asset: ApprovedAsset): VerificationFieldStatus {
  return asset.reviewed && Boolean(asset.contentHash) ? "confirmed" : "missing";
}

export function buildPilotVerificationProvenance(input: {
  pilot: PilotDescriptor;
  offer: string;
  offerPrice?: string;
  destinationUrl: string;
  asset: ApprovedAsset;
}): CampaignVerificationProvenance {
  const { pilot, offer, offerPrice, destinationUrl, asset } = input;
  const source = `pilot-manifest:${pilot.id}`;
  const missing: string[] = [
    "offer reviewer identity/date",
    "destination reviewer identity/date",
  ];
  if (pilot.status !== "confirmed") {
    missing.push("confirmed pilot status");
  }
  if (!asset.rights?.trim()) missing.push("asset rights");
  if (!asset.reviewedBy) missing.push("asset reviewer identity");
  if (!asset.reviewedOn) missing.push("asset review date");
  if (!asset.contentHash) missing.push("packshot content hash");

  const priceIsPresent = Boolean(offerPrice?.trim());
  if (priceIsPresent) {
    missing.push("approved price reviewer identity/date");
  } else {
    missing.push("approved price emphasis");
  }
  if (priceIsPresent && !offer.includes(offerPrice!.trim())) {
    missing.push("approved price is an exact substring of the offer");
  }

  return {
    source: "pilot-manifest",
    pilotId: pilot.id,
    pilotStatus: pilot.status,
    note: pilot.note ?? null,
    offer: {
      value: offer,
      status: fieldStatus(pilot.status),
      source: `${source}#fixture.brief.offer`,
      note: pilot.note ?? null,
      reviewedBy: null,
      reviewedOn: null,
    },
    destination: {
      value: destinationUrl,
      status: fieldStatus(pilot.status),
      source: `${source}#fixture.brief.destinationUrl`,
      note: pilot.note ?? null,
      reviewedBy: null,
      reviewedOn: null,
    },
    offerPrice: {
      value: priceIsPresent ? offerPrice!.trim() : null,
      status: priceIsPresent
        ? offer.includes(offerPrice!.trim())
          ? fieldStatus(pilot.status)
          : "missing"
        : "missing",
      source: `${source}#fixture.brief.offerPrice`,
      note: pilot.note ?? null,
      reviewedBy: null,
      reviewedOn: null,
    },
    rights: {
      value: asset.rights?.trim() || null,
      status: rightsStatus(asset),
      source: `${source}#assets.${asset.id}.rights`,
      reviewedBy: asset.reviewedBy ?? null,
      reviewedOn: asset.reviewedOn ?? null,
    },
    packshot: {
      value: asset.contentHash || null,
      status: packshotStatus(asset),
      source: asset.source,
      reviewedBy: asset.reviewedBy ?? null,
      reviewedOn: asset.reviewedOn ?? null,
      assetId: asset.id,
      contentHash: asset.contentHash || null,
    },
    missingEvidence: unique(missing),
  };
}
