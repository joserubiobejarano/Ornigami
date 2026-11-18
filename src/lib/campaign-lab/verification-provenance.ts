import type { BrowserOfferVerification } from "./browser-offer.ts";
import type { ApprovedAsset, PilotDescriptor } from "./types.ts";

export type VerificationFieldStatus = "confirmed" | "provisional" | "missing";

export type VerificationCommercialField =
  | "offer"
  | "offerPrice"
  | "destination";

export type VerificationField = {
  /** The exact value rendered in the approved preview. */
  value: string | null;
  /** The original manifest value this rendered value was compared with. */
  sourceValue: string | null;
  status: VerificationFieldStatus;
  /** True only when the rendered value differs from the manifest value. */
  changedByEditor: boolean;
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

export type VerificationEditorChange = {
  field: VerificationCommercialField;
  sourceValue: string | null;
  renderedValue: string | null;
};

export type PilotVerificationValues = {
  offer: string;
  offerPrice?: string;
  destinationUrl: string;
};

/**
 * Provenance for a local pilot export. It records both the original manifest
 * values and the exact rendered values, where each value came from, and which
 * review evidence the manifest does not contain. Confirmation is inherited only
 * when the rendered value still matches its approved manifest source.
 */
export type BrowserIntakeAssetIdentity = {
  source: "browser-computed";
  /** SHA-256 declared by the browser packshot reader. */
  declaredSha256: string | null;
  /** SHA-256 recalculated from the exported packshot bytes. */
  exportedSha256?: string | null;
  /** The local export copy matched the declared asset identity. */
  localExportHashMatches?: boolean;
  /** The server received metadata, not the image bytes. */
  serverBytesVerified: false;
};

export type CampaignVerificationProvenance = {
  source: "pilot-manifest" | "browser-intake";
  pilotId: string;
  /** The status recorded by the manifest itself. */
  pilotStatus: "preview" | "confirmed";
  /** The effective status after comparing every rendered commercial input. */
  status: "confirmed" | "provisional";
  note: string | null;
  /** Explicit list of commercial inputs changed in the local editor. */
  editorChanges: VerificationEditorChange[];
  offer: VerificationField;
  destination: VerificationField;
  offerPrice: VerificationField;
  rights: VerificationField;
  packshot: VerificationPackshotField;
  missingEvidence: string[];
  /** Browser intake is never an owner confirmation. */
  ownerConfirmed?: false;
  /** The server did not receive or verify the packshot bytes. */
  assetBytesVerified?: false;
  /** Operator checkbox state carried into the local export receipt. */
  operatorAttestation?: BrowserOfferVerification;
  /** Declared and locally checked packshot identity, distinct from server verification. */
  assetIdentity?: BrowserIntakeAssetIdentity;
};

export type PilotVerificationInput = {
  pilot: PilotDescriptor;
  asset: ApprovedAsset;
  /** Original values from the pilot manifest. */
  manifest?: PilotVerificationValues;
  /** Exact values rendered by the local editor. */
  rendered?: PilotVerificationValues;
  /** Backward-compatible aliases for an input where source and rendered agree. */
  offer?: string;
  offerPrice?: string;
  destinationUrl?: string;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function fieldStatus(
  pilotStatus: PilotDescriptor["status"],
): VerificationFieldStatus {
  return pilotStatus === "confirmed" ? "confirmed" : "provisional";
}

function comparedStatus(input: {
  pilotStatus: PilotDescriptor["status"];
  rendered: string | null;
  matchesSource: boolean;
}): VerificationFieldStatus {
  if (!input.rendered) return "missing";
  if (!input.matchesSource) return "provisional";
  return fieldStatus(input.pilotStatus);
}

function rightsStatus(asset: ApprovedAsset): VerificationFieldStatus {
  if (!asset.rights?.trim()) return "missing";
  return asset.reviewed ? "confirmed" : "provisional";
}

function packshotStatus(asset: ApprovedAsset): VerificationFieldStatus {
  return asset.reviewed && Boolean(asset.contentHash) ? "confirmed" : "missing";
}

function fieldNote(pilot: PilotDescriptor, changed: boolean): string | null {
  const notes = [pilot.note?.trim()].filter(
    (note): note is string => Boolean(note),
  );
  if (changed) {
    notes.push(
      "Rendered value differs from the approved manifest. The local editor change is provisional; confirmation does not carry to the rendered value.",
    );
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

function changeLabel(field: VerificationCommercialField): string {
  return field === "offerPrice" ? "approved price" : field;
}

function noticeLabel(field: VerificationCommercialField): string {
  return field === "offerPrice" ? "price" : field;
}

/**
 * Resolves the same effective preview status used by the export receipt.
 * A changed commercial input can never inherit the manifest's confirmation.
 */
export function pilotPreviewStatus(
  provenance: CampaignVerificationProvenance,
): "preview" | "confirmed" {
  return provenance.status === "confirmed" ? "confirmed" : "preview";
}

/**
 * Builds the visible provisional footer from the same editor-change evidence
 * that is written into the receipt.
 */
export function pilotPreviewNotice(
  provenance: CampaignVerificationProvenance,
): string | undefined {
  if (provenance.status === "confirmed") return undefined;
  const changed = provenance.editorChanges
    .map((change) => noticeLabel(change.field))
    .filter((label, index, labels) => labels.indexOf(label) === index);
  if (changed.length > 0) {
    return `Preview · ${changed.join(", ")} provisional`;
  }
  return "Preview · offer and destination unconfirmed";
}

function buildVerificationProvenance(
  input: PilotVerificationInput,
  sourceKind: CampaignVerificationProvenance["source"],
): CampaignVerificationProvenance {
  const { pilot, asset } = input;
  const fallback: PilotVerificationValues = {
    offer: input.offer ?? "",
    offerPrice: input.offerPrice,
    destinationUrl: input.destinationUrl ?? "",
  };
  const manifest = input.manifest ?? fallback;
  const rendered = input.rendered ?? fallback;

  const source = `${sourceKind}:${pilot.id}`;
  const manifestOffer = manifest.offer ?? "";
  const renderedOffer = rendered.offer ?? "";
  const manifestDestination = manifest.destinationUrl ?? "";
  const renderedDestination = rendered.destinationUrl ?? "";
  const manifestPrice = trimmedOrNull(manifest.offerPrice);
  const renderedPrice = trimmedOrNull(rendered.offerPrice);

  const offerChanged = renderedOffer !== manifestOffer;
  const destinationChanged = renderedDestination !== manifestDestination;
  const priceChanged = renderedPrice !== manifestPrice;
  const priceIsSubstring = Boolean(
    renderedPrice && renderedOffer.includes(renderedPrice),
  );
  const priceMatchesSource =
    Boolean(renderedPrice) &&
    Boolean(manifestPrice) &&
    renderedPrice === manifestPrice;

  const editorChanges: VerificationEditorChange[] = [];
  if (offerChanged) {
    editorChanges.push({
      field: "offer",
      sourceValue: manifestOffer || null,
      renderedValue: renderedOffer || null,
    });
  }
  if (destinationChanged) {
    editorChanges.push({
      field: "destination",
      sourceValue: manifestDestination || null,
      renderedValue: renderedDestination || null,
    });
  }
  if (priceChanged) {
    editorChanges.push({
      field: "offerPrice",
      sourceValue: manifestPrice,
      renderedValue: renderedPrice,
    });
  }

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

  if (renderedPrice) {
    missing.push("approved price reviewer identity/date");
  } else {
    missing.push("approved price emphasis");
  }
  if (renderedPrice && !priceIsSubstring) {
    missing.push("approved price is an exact substring of the offer");
  }
  for (const change of editorChanges) {
    missing.push(`${changeLabel(change.field)} confirmation for the edited value`);
  }

  return {
    source: sourceKind,
    pilotId: pilot.id,
    pilotStatus: pilot.status,
    status:
      pilot.status === "confirmed" && editorChanges.length === 0
        ? "confirmed"
        : "provisional",
    note: pilot.note ?? null,
    editorChanges,
    offer: {
      value: renderedOffer,
      sourceValue: manifestOffer,
      status: comparedStatus({
        pilotStatus: pilot.status,
        rendered: renderedOffer,
        matchesSource: !offerChanged,
      }),
      changedByEditor: offerChanged,
      source: `${source}#fixture.brief.offer`,
      note: fieldNote(pilot, offerChanged),
      reviewedBy: null,
      reviewedOn: null,
    },
    destination: {
      value: renderedDestination,
      sourceValue: manifestDestination,
      status: comparedStatus({
        pilotStatus: pilot.status,
        rendered: renderedDestination,
        matchesSource: !destinationChanged,
      }),
      changedByEditor: destinationChanged,
      source: `${source}#fixture.brief.destinationUrl`,
      note: fieldNote(pilot, destinationChanged),
      reviewedBy: null,
      reviewedOn: null,
    },
    offerPrice: {
      value: renderedPrice,
      sourceValue: manifestPrice,
      status: priceIsSubstring
        ? comparedStatus({
            pilotStatus: pilot.status,
            rendered: renderedPrice,
            matchesSource: priceMatchesSource,
          })
        : "missing",
      changedByEditor: priceChanged,
      source: `${source}#fixture.brief.offerPrice`,
      note: fieldNote(pilot, priceChanged),
      reviewedBy: null,
      reviewedOn: null,
    },
    rights: {
      value: asset.rights?.trim() || null,
      sourceValue: asset.rights?.trim() || null,
      status: rightsStatus(asset),
      changedByEditor: false,
      source: `${source}#assets.${asset.id}.rights`,
      reviewedBy: asset.reviewedBy ?? null,
      reviewedOn: asset.reviewedOn ?? null,
    },
    packshot: {
      value: asset.contentHash || null,
      sourceValue: asset.contentHash || null,
      status: packshotStatus(asset),
      changedByEditor: false,
      source: asset.source,
      reviewedBy: asset.reviewedBy ?? null,
      reviewedOn: asset.reviewedOn ?? null,
      assetId: asset.id,
      contentHash: asset.contentHash || null,
    },
    missingEvidence: unique(missing),
  };
}

export function buildPilotVerificationProvenance(
  input: PilotVerificationInput,
): CampaignVerificationProvenance {
  return buildVerificationProvenance(input, "pilot-manifest");
}

export function buildBrowserIntakeVerificationProvenance(
  input: PilotVerificationInput & {
    operatorVerification: BrowserOfferVerification;
  },
): CampaignVerificationProvenance {
  return {
    ...buildVerificationProvenance(input, "browser-intake"),
    ownerConfirmed: false,
    assetBytesVerified: false,
    operatorAttestation: { ...input.operatorVerification },
    assetIdentity: {
      source: "browser-computed",
      declaredSha256: input.asset.contentHash?.trim().toLowerCase() || null,
      serverBytesVerified: false,
    },
  };
}
