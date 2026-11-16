import { ADVERTORIAL_MANIFEST, buildConfiguredPreview } from "./advertorial.ts";
import type {
  AdvertorialPreviewData,
  ConfiguredPreviewData,
} from "./advertorial.ts";
import { getAsset, openingFocusForFormat } from "./fixtures.ts";
import type {
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
  ValidationIssue,
} from "./types.ts";

/**
 * The editor can open without a renderable preview. Returning the validation
 * issues instead of throwing keeps the form usable on the first load.
 */
export type EditorPreviewState = {
  preview: ConfiguredPreviewData | null;
  issues: ValidationIssue[];
  dirty: boolean;
};

export function createEditorPreviewState(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog?: CampaignCatalog,
): EditorPreviewState {
  const result = buildConfiguredPreview(fixture, values, catalog);
  if (result.ok) {
    return { preview: result.preview, issues: [], dirty: false };
  }
  return { preview: null, issues: result.issues, dirty: true };
}

export function isAdvertorialPreviewData(
  preview: ConfiguredPreviewData | null,
): preview is AdvertorialPreviewData {
  return preview?.draft.templateId === ADVERTORIAL_MANIFEST.id;
}

/** A fact-capacity error means no currently supported layout can hold the group. */
export function isFactCapacityMessage(message: string): boolean {
  return (
    /no supported layout accepts more than\s+\d+/i.test(message) ||
    /product block can present at most\s+\d+/i.test(message) ||
    (/required fact group/i.test(message) &&
      /\b(?:has|needs)\s+\d+\s+facts/i.test(message) &&
      /(?:at most|capacity)/i.test(message))
  );
}

export function splitCapacityIssues(issues: readonly ValidationIssue[]): {
  capacityIssue: ValidationIssue | null;
  otherIssues: ValidationIssue[];
} {
  let capacityIssue: ValidationIssue | null = null;
  const otherIssues: ValidationIssue[] = [];
  for (const issue of issues) {
    if (!capacityIssue && isFactCapacityMessage(issue.message)) {
      capacityIssue = issue;
    } else if (!isFactCapacityMessage(issue.message)) {
      otherIssues.push(issue);
    }
  }
  return { capacityIssue, otherIssues };
}

export type FormatPreviewAlternative = {
  ok: boolean;
  values: CampaignFormValues;
  preview: ConfiguredPreviewData | null;
  issues: ValidationIssue[];
};

/**
 * Builds the offer values from the same approved brief, including the
 * campaign's approved packshot and the remembered offer opening.
 */
export function createOfferAlternativeValues(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog,
  preferredOpeningFocus?: string,
): CampaignFormValues {
  const next: CampaignFormValues = {
    ...values,
    format: "offer",
    advertorialLayout: "auto",
  };
  const heroAsset = getAsset(next.assetId, catalog);
  if (heroAsset?.role !== "product-hero") {
    next.assetId =
      catalog.assets.find(
        (asset) => asset.role === "product-hero" && asset.brandId === next.brandId,
      )?.id ?? next.assetId;
  }
  next.openingFocus = openingFocusForFormat(
    fixture,
    "offer",
    preferredOpeningFocus,
  );
  return next;
}

/**
 * An alternative is only recommended when the full current brief validates in
 * that format. Capacity and field errors are returned for the caller.
 */
export function evaluateOfferAlternative(
  fixture: CampaignFixture,
  values: CampaignFormValues,
  catalog: CampaignCatalog,
  preferredOpeningFocus?: string,
): FormatPreviewAlternative {
  const offerValues = createOfferAlternativeValues(
    fixture,
    values,
    catalog,
    preferredOpeningFocus,
  );
  const result = buildConfiguredPreview(fixture, offerValues, catalog);
  return result.ok
    ? { ok: true, values: offerValues, preview: result.preview, issues: [] }
    : { ok: false, values: offerValues, preview: null, issues: result.issues };
}

/**
 * Required images are the approved assets assigned to this exact revision.
 * The offer template has one hero; the advertorial renders every resolved
 * assignment, including its supporting images.
 */
export function requiredPreviewImageIds(
  preview: ConfiguredPreviewData | null,
): string[] {
  if (!preview) return [];
  if (isAdvertorialPreviewData(preview)) {
    return preview.assets.map((entry) => entry.asset.id);
  }
  return [preview.asset.id];
}

export type PreviewImageStatus = "pending" | "loaded" | "error";

export type PreviewImageGate = {
  revision: string | null;
  statuses: Record<string, PreviewImageStatus>;
  attempts: Record<string, number>;
};

export type PreviewImageEvent = {
  revision: string;
  assetId: string;
  attempt: number;
  status: Exclude<PreviewImageStatus, "pending">;
};

export type PreviewImageSummary = {
  requiredAssetIds: string[];
  statuses: Record<string, PreviewImageStatus>;
  failedAssetIds: string[];
  pendingAssetIds: string[];
  ready: boolean;
};

export function createPreviewImageGate(
  revision: string | null = null,
): PreviewImageGate {
  return { revision, statuses: {}, attempts: {} };
}

function gateForRevision(
  gate: PreviewImageGate,
  revision: string,
): PreviewImageGate {
  return gate.revision === revision
    ? gate
    : { revision, statuses: {}, attempts: {} };
}

export function previewImageStatus(
  gate: PreviewImageGate,
  revision: string | null,
  assetId: string,
): PreviewImageStatus {
  if (!revision || gate.revision !== revision) return "pending";
  return gate.statuses[assetId] ?? "pending";
}

export function previewImageAttempt(
  gate: PreviewImageGate,
  revision: string | null,
  assetId: string,
): number {
  if (!revision || gate.revision !== revision) return 0;
  return gate.attempts[assetId] ?? 0;
}

export function summarizePreviewImages(
  preview: ConfiguredPreviewData | null,
  gate: PreviewImageGate,
): PreviewImageSummary {
  const requiredAssetIds = requiredPreviewImageIds(preview);
  const revision = preview?.revision ?? null;
  const statuses = Object.fromEntries(
    requiredAssetIds.map((assetId) => [
      assetId,
      previewImageStatus(gate, revision, assetId),
    ]),
  ) as Record<string, PreviewImageStatus>;
  const failedAssetIds = requiredAssetIds.filter(
    (assetId) => statuses[assetId] === "error",
  );
  const pendingAssetIds = requiredAssetIds.filter(
    (assetId) => statuses[assetId] !== "loaded",
  );

  return {
    requiredAssetIds,
    statuses,
    failedAssetIds,
    pendingAssetIds,
    ready:
      Boolean(preview) &&
      failedAssetIds.length === 0 &&
      pendingAssetIds.length === 0,
  };
}

export type ImagePanelState = {
  hasPreview: boolean;
  failedCount: number;
  pendingCount: number;
  loadedCount: number;
  totalCount: number;
  generating: boolean;
  dirty: boolean;
  hasIssues: boolean;
  approved: boolean;
  canApprove: boolean;
  editorReady: boolean;
  revisionLabel: string | null;
};

/**
 * Describes the image state and the real next action. Readiness alone is not
 * approval: an edited or failed preview still needs a retry or regeneration.
 */
export function imagePanelStatusText(state: ImagePanelState): string {
  if (state.generating) {
    return "Waiting for the fresh preview. Image status will apply to its new revision.";
  }
  if (state.failedCount > 0) {
    return `${state.failedCount} required ${state.failedCount === 1 ? "image has" : "images have"} failed to load. Retry below before approval.`;
  }
  if (state.pendingCount > 0) {
    return `Loading required images for revision ${state.revisionLabel}… ${state.loadedCount} of ${state.totalCount} loaded.`;
  }
  if (state.dirty || state.hasIssues) {
    return "Required images are loaded. Generate a fresh preview before approving the edit.";
  }
  if (state.approved) {
    return `Required images are loaded. Revision ${state.revisionLabel} is already approved; no further image action is needed.`;
  }
  if (state.canApprove) {
    return `Required images are loaded. Approve revision ${state.revisionLabel} when ready.`;
  }
  if (!state.editorReady) {
    return "Required images are loaded. Preparing the editor controls…";
  }
  if (!state.hasPreview) {
    return "No preview images are available to check.";
  }
  return `Required images are loaded for revision ${state.revisionLabel}. Approval is not available for this revision.`;
}

/**
 * A load event only applies to the revision and retry attempt that produced
 * it. Events from a superseded preview or an earlier retry are ignored.
 */
export function recordPreviewImageEvent(
  gate: PreviewImageGate,
  event: PreviewImageEvent,
): PreviewImageGate {
  const current = gateForRevision(gate, event.revision);
  const attempt = current.attempts[event.assetId] ?? 0;
  if (attempt !== event.attempt) return current;
  if (current.statuses[event.assetId] === event.status) return current;
  return {
    ...current,
    statuses: { ...current.statuses, [event.assetId]: event.status },
  };
}

export function retryPreviewImage(
  gate: PreviewImageGate,
  revision: string,
  assetId: string,
): PreviewImageGate {
  const current = gateForRevision(gate, revision);
  return {
    revision,
    statuses: { ...current.statuses, [assetId]: "pending" },
    attempts: {
      ...current.attempts,
      [assetId]: (current.attempts[assetId] ?? 0) + 1,
    },
  };
}
