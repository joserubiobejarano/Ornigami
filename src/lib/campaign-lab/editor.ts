import { ADVERTORIAL_MANIFEST, buildConfiguredPreview } from "./advertorial.ts";
import type {
  AdvertorialPreviewData,
  ConfiguredPreviewData,
} from "./advertorial.ts";
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
