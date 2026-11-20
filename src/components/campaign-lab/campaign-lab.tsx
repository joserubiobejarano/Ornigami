"use client";

import { parseOfferComposition, resolveCampaignComposition } from "@/lib/campaign-lab/composition";

import Link from "next/link";
import { BrandEvidenceReview } from "./brand-evidence-review";
import { VISUAL_DIRECTIONS, resolveVisualDirection, browserDirectionCatalog } from "@/lib/campaign-lab/visual-directions";
import { usePreviewReview } from "./use-preview-review";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADVERTORIAL_MANIFEST,
  assessAdvertorialFit,
  buildConfiguredPreview,
} from "@/lib/campaign-lab/advertorial";
import type { ConfiguredPreviewData } from "@/lib/campaign-lab/advertorial";
import {
  createEditorPreviewState,
  evaluateOfferAlternative,
  imagePanelStatusText,
  isAdvertorialPreviewData,
  isFactCapacityMessage,
  previewImageAttempt,
  previewImageStatus,
  recordPreviewImageEvent,
  retryPreviewImage,
  splitCapacityIssues,
  summarizePreviewImages,
} from "@/lib/campaign-lab/editor";
import {
  captureCampaignExportSnapshot,
  downloadCampaignExport,
  evaluateCampaignExport,
  isLocalPreviewApproved,
} from "@/lib/campaign-lab/export";
import type { BrowserOfferVerification } from "@/lib/campaign-lab/browser-offer";
import type { BrowserOfferBriefRequest } from "@/lib/campaign-lab/browser-offer-brief";
import type {
  PreviewImageEvent,
} from "@/lib/campaign-lab/editor";
import {
  createFormValues,
  defaultAccent,
  defaultFormat,
  assetLookupIssue,
  getAsset,
  getBrand,
  isBrandId,
  openingFocusForFormat,
  openingOptionsForFormat,
} from "@/lib/campaign-lab/fixtures";
import { GenerationRequestGate } from "@/lib/campaign-lab/generation/client-gate";
import {
  DESIGN_GUIDANCE_PACK_VERSION,
  DESIGN_HARNESS_VERSION,
} from "@/lib/campaign-lab/generation/harness";
import type { GenerationMetadata } from "@/lib/campaign-lab/generation/types";
import {
  CAMPAIGN_REVISION_IDENTITY_VERSION,
  SINGLE_PRODUCT_OFFER_TEMPLATE,
  calculateDraftRevision,
  shortRevision,
} from "@/lib/campaign-lab/template";
import type { CampaignPreviewData } from "@/lib/campaign-lab/template";
import type {
  AdvertorialLayoutId,
  ApprovedAsset,
  CampaignCatalog,
  CampaignFormat,
  CampaignFormValues,
  FixtureId,
  ValidationField,
  ValidationIssue,
} from "@/lib/campaign-lab/types";
import { nativeSelectClassName } from "@/lib/form-controls";
import { cn } from "@/lib/utils";
import {
  buildBrowserIntakeVerificationProvenance,
  buildPilotVerificationProvenance,
  pilotPreviewNotice,
  pilotPreviewStatus,
} from "@/lib/campaign-lab/verification-provenance";

import { AdvertorialPage } from "./advertorial-page";
import { CampaignPage } from "./campaign-page";
import { MOTION_RECIPES, isMotionRecipeId, motionPresentation } from "@/lib/campaign-lab/motion";
import type { MotionRecipeId } from "@/lib/campaign-lab/motion";
import { resolveCampaignImage } from "@/lib/campaign-lab/presentation";

type CampaignLabProps = {
  initialFixtureId: FixtureId;
  catalog: CampaignCatalog;
  showFixtureNav?: boolean;
  /** Separate server boundary for the production builder. */
  generationEndpoint?: string;
  /** Restrict the surface to the qualified single-product offer format. */
  offerOnly?: boolean;
  /** The production first beta is static; hide experimental presentations. */
  allowMotion?: boolean;
  /** Runtime session subject; sent so a stale tab cannot act under a new session. */
  builderSubject?: string;
  /** Browser-created briefs send this bounded contract instead of a fixture ID. */
  browserBrief?: (values: CampaignFormValues) => BrowserOfferBriefRequest;
  /** Keeps the uploaded packshot object URL local to this browser. */
  browserAssetSrc?: string;
  previewNotice?: string;
  previewStatus?: "preview" | "confirmed";
  previewNote?: string;
  exportVerification?: BrowserOfferVerification | null;
  exportPackshotBlob?: Blob | null;
  onEditorStateChange?: (snapshot: {
    values: CampaignFormValues;
    revision: string | null;
    dirty: boolean;
    rendered: {
      offer: string;
      destination: string;
      rights: string;
    } | null;
  }) => void;
};

type GenerationState = { status: "idle" } | GenerationMetadata;

const ROLE_LABELS: Record<string, string> = {
  "story-opening": "opening image",
  "product-detail": "detail image",
  "product-in-use": "in-use image",
  "product-evidence": "evidence image",
  "product-hero": "product image",
};

const ASSET_LABELS: Record<string, string> = {
  "harbor-field-bottle-front": "Harbor Field bottle",
  "morrow-ceramic-dripper-front": "Morrow Ceramic dripper",
  "momisa-glow-box-front": "Momisa Glow Box packshot",
};

function assetLabel(asset: ApprovedAsset, catalog: CampaignCatalog): string {
  return ASSET_LABELS[asset.id] ??
    `${catalog.brands[asset.brandId]?.name ?? asset.brandId} product image`;
}

function withLocalBrowserAsset(
  preview: ConfiguredPreviewData,
  assetSrc?: string,
): ConfiguredPreviewData {
  if (!assetSrc || isAdvertorialPreviewData(preview)) return preview;
  return {
    ...preview,
    asset: {
      ...preview.asset,
      src: assetSrc,
    },
  };
}

export function CampaignLab({
  initialFixtureId,
  catalog,
  showFixtureNav = true,
  generationEndpoint = "/api/campaign-lab/generate",
  offerOnly = false,
  allowMotion = true,
  builderSubject,
  browserBrief,
  browserAssetSrc,
  previewNotice,
  previewStatus,
  previewNote,
  exportVerification = null,
  exportPackshotBlob = null,
  onEditorStateChange,
}: CampaignLabProps) {
  const fixture = catalog.fixtures[initialFixtureId];
  const editorReady = useSyncExternalStore(() => () => {}, () => true, () => false);
  const baseId = useId().replace(/:/g, "");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const capacityAlertRef = useRef<HTMLDivElement>(null);
  const previousIssueCount = useRef(0);
  const requestGate = useRef(new GenerationRequestGate());
  const inFlight = useRef<AbortController | null>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const openingByFormat = useRef<Record<CampaignFormat, string | undefined>>({
    offer: openingFocusForFormat(fixture, "offer"),
    advertorial: openingFocusForFormat(fixture, "advertorial"),
  });

  const [values, setValues] = useState<CampaignFormValues>(() => createFormValues(fixture, catalog));
  const [initialPreviewState] = useState(() =>
    createEditorPreviewState(fixture, values, catalog),
  );
  const [acceptedPresentation, setAcceptedPresentation] = useState<{
    preview: ConfiguredPreviewData | null;
    recipe: MotionRecipeId;
  }>({ preview: initialPreviewState.preview, recipe: "none" });
  const { preview: previewState, recipe: renderedMotion } = acceptedPresentation;
  const [issues, setIssues] = useState<ValidationIssue[]>(initialPreviewState.issues);
  const [dirty, setDirty] = useState(initialPreviewState.dirty);
  const { approval, setApproval, approve, imageGate, setImageGate, exporting, approvalGuardRef, prepareExport } = usePreviewReview(initialPreviewState.preview?.revision ?? null);
  const [pendingMotion, setPendingMotion] = useState<MotionRecipeId>("none");
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const [generating, setGenerating] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const effectivePilotStatus = previewStatus ?? catalog.pilot?.status;
  const effectivePilotNote = previewNote ?? catalog.pilot?.note;
  const pilotProvenance =
    catalog.pilot && previewState && !isAdvertorialPreviewData(previewState)
      ? (() => {
          const input = {
            pilot: catalog.pilot,
            manifest: {
              offer: fixture.brief.offer,
              offerPrice: fixture.brief.offerPrice,
              destinationUrl: fixture.brief.destinationUrl,
            },
            rendered: {
              offer: previewState.brief.offer,
              offerPrice: previewState.brief.offerPrice,
              destinationUrl: previewState.brief.destinationUrl,
            },
            asset: previewState.asset,
          };
          return browserBrief
            ? buildBrowserIntakeVerificationProvenance({
                ...input,
                operatorVerification: exportVerification ?? {
                  offer: "provisional",
                  destination: "unconfirmed",
                  rights: "provisional",
                  provisional: true,
                },
              })
            : buildPilotVerificationProvenance(input);
        })()
      : undefined;
  const renderedPilotStatus =
    catalog.pilot && pilotProvenance
      ? pilotPreviewStatus(pilotProvenance)
      : effectivePilotStatus;
  const renderedPilotNotice =
    catalog.pilot && pilotProvenance
      ? pilotPreviewNotice(pilotProvenance) ?? previewNotice
      : previewNotice ??
        (effectivePilotStatus === "preview"
          ? "Preview · offer and destination unconfirmed"
          : undefined);
  const preview = useMemo(
    () =>
      previewState && !isAdvertorialPreviewData(previewState)
        ? {
            ...previewState,
            motion: motionPresentation(renderedMotion),
            revision: calculateDraftRevision(
              previewState.brief,
              previewState.draft,
              previewState.asset,
              previewState.theme,
              renderedPilotNotice ?? null,
              motionPresentation(renderedMotion),
            ),
            revisionIdentityVersion: CAMPAIGN_REVISION_IDENTITY_VERSION,
          }
        : previewState,
    [previewState, renderedPilotNotice, renderedMotion],
  );
  const sourceBrand = getBrand(values.brandId, catalog);
  const brand = browserBrief ? { ...sourceBrand, tokens: { ...resolveVisualDirection(values.directionId).tokens, ...Object.fromEntries(values.brandKitSnapshot?.selections.map(v => [v.role, v.value]) ?? []), accent: values.accent } } : sourceBrand;
  const selectedAsset = assetLookupIssue(values.assetId, catalog) ? undefined : getAsset(values.assetId, catalog);
  const advertorialPreview = isAdvertorialPreviewData(preview) ? preview : null;
  const advertorialFit = assessAdvertorialFit(fixture, values, catalog);
  const offerAlternative = evaluateOfferAlternative(fixture, values, catalog);
  const format: CampaignFormat = offerOnly
    ? "offer"
    : values.format ?? defaultFormat(fixture);
  const openingOptions = openingOptionsForFormat(fixture, format);
  const approvedHeroAssignment = fixture.brief.advertorial?.assetAssignments.find(
    (assignment) => assignment.role === "product-hero",
  );
  const heroAssetOptions = catalog.assets.filter((asset) =>
    format === "advertorial"
      ? asset.id === approvedHeroAssignment?.assetId
      : asset.role === "product-hero",
  );
  const template = advertorialPreview
    ? ADVERTORIAL_MANIFEST
    : preview
      ? SINGLE_PRODUCT_OFFER_TEMPLATE
      : null;
  const layout = advertorialPreview
    ? ADVERTORIAL_MANIFEST.layouts[advertorialPreview.draft.layout]
    : preview
      ? SINGLE_PRODUCT_OFFER_TEMPLATE.layouts[(preview as CampaignPreviewData).draft.layout]
      : null;
  const { capacityIssue, otherIssues } = splitCapacityIssues(issues);
  const capacityMessage =
    capacityIssue?.message ??
    [advertorialFit.layoutReason, ...advertorialFit.missingInputs]
      .concat(offerAlternative.issues.map((issue) => issue.message))
      .find((message): message is string =>
        Boolean(message && isFactCapacityMessage(message)),
      ) ??
    null;
  const issueByField = new Map(
    otherIssues.map((issue) => [issue.field, issue.message]),
  );
  const issueCount = otherIssues.length + (capacityMessage ? 1 : 0);
  const imageSummary = summarizePreviewImages(preview, imageGate);
  const revision = preview?.revision ?? null;
  const imageRows = advertorialPreview
    ? advertorialPreview.assets.map(({ asset, assignment }) => ({
        assetId: asset.id,
        roleLabel: ROLE_LABELS[assignment.role] ?? assignment.role,
        label: assetLabel(asset, catalog),
      }))
    : preview
      ? [
          {
            assetId: preview.asset.id,
            roleLabel: ROLE_LABELS[preview.asset.role] ?? preview.asset.role,
            label: assetLabel(preview.asset, catalog),
          },
        ]
      : [];
  const failedImageRows = imageRows.filter((row) =>
    imageSummary.failedAssetIds.includes(row.assetId),
  );
  const pendingImageRows = imageRows.filter((row) =>
    imageSummary.pendingAssetIds.includes(row.assetId),
  );
  const approved = isLocalPreviewApproved({
    revision,
    approvalRevision: approval?.revision,
    dirty,
    generating,
    imagesReady: imageSummary.ready,
  });
  const canApprove =
    editorReady &&
    Boolean(preview) &&
    !dirty &&
    !generating &&
    issues.length === 0 &&
    imageSummary.ready &&
    !approved;
  const exportCapability = evaluateCampaignExport({
    revision,
    approvalRevision: approval?.revision,
    dirty,
    generating,
    imagesReady: imageSummary.ready,
    supportedFormat: Boolean(preview) && !advertorialPreview,
  });
  const canExport = exportCapability.ok && !exporting;
  approvalGuardRef.current = {
    revision,
    approvalRevision: approval?.revision,
    dirty,
    generating,
    imagesReady: imageSummary.ready,
  };
  const approvalBlockedByImages = Boolean(preview) && !imageSummary.ready;
  const revisionLabel = revision ? shortRevision(revision) : null;
  const imagePanelText = preview
    ? imagePanelStatusText({
        hasPreview: true,
        failedCount: failedImageRows.length,
        pendingCount: pendingImageRows.length,
        loadedCount: imageRows.length - pendingImageRows.length,
        totalCount: imageRows.length,
        generating,
        dirty,
        hasIssues: otherIssues.length > 0 || Boolean(capacityMessage),
        approved,
        canApprove,
        editorReady,
        revisionLabel,
      })
    : null;

  const fieldIds: Record<ValidationField, string> = {
    directionId: "browser-visual-direction",
    composition: "browser-composition",
    brandId: `${baseId}-brand-style`,
    accent: `${baseId}-accent`,
    productName: `${baseId}-product-name`,
    audience: `${baseId}-audience`,
    objective: `${baseId}-objective`,
    offer: `${baseId}-offer`,
    offerPrice: `${baseId}-offer-price`,
    destinationUrl: `${baseId}-destination-url`,
    assetId: `${baseId}-product-image`,
    openingFocus: `${baseId}-opening-focus`,
    format: `${baseId}-format`,
    advertorialLayout: `${baseId}-advertorial-layout`,
  };

  const previewHeadingId = `${baseId}-campaign-preview-heading`;
  const previewStatusId = `${baseId}-campaign-preview-status`;
  const pageHeadingId = `${baseId}-campaign-page-heading`;
  const reviewStatusId = `${baseId}-review-status`;
  const formStatusId = `${baseId}-form-status`;
  const generationEditorStatusId = `${baseId}-generation-editor-status`;
  const generationPreviewStatusId = `${baseId}-generation-preview-status`;
  const errorSummaryHeadingId = `${baseId}-error-summary-heading`;
  const capacityIssueId = `${baseId}-capacity-issue`;
  const assetMetaId = `${baseId}-asset-meta`;
  const accentHintId = `${baseId}-accent-hint`;
  const audienceId = fieldIds.audience;
  const objectiveId = fieldIds.objective;

  useEffect(() => {
    if (issueCount > previousIssueCount.current) {
      (capacityMessage ? capacityAlertRef.current : errorSummaryRef.current)?.focus();
    }
    previousIssueCount.current = issueCount;
  }, [capacityMessage, issueCount]);

  useEffect(() => {
    const gate = requestGate.current;
    return () => {
      gate.invalidate();
      inFlight.current?.abort();
      exportAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isLocalPreviewApproved(approvalGuardRef.current)) {
      exportAbortRef.current?.abort();
    }
  }, [approval?.revision, approvalGuardRef, dirty, generating, imageSummary.ready, revision]);

  useEffect(() => {
    onEditorStateChange?.({
      values,
      revision: preview?.revision ?? null,
      dirty,
      rendered: preview
        ? {
            offer: preview.brief.offer,
            destination: preview.brief.destinationUrl,
            rights: isAdvertorialPreviewData(preview)
              ? (preview.assets[0]?.asset.rights ?? "")
              : preview.asset.rights,
          }
        : null,
    });
  }, [dirty, onEditorStateChange, preview, values]);

  function invalidateGenerationRequest() {
    requestGate.current.invalidate();
    inFlight.current?.abort();
    inFlight.current = null;
    setGenerating(false);
  }

  function handleImageStateChange(event: PreviewImageEvent) {
    if (!preview || event.revision !== preview.revision) return;
    if (event.status === "error") setApproval(null);
    setImageGate((current) => recordPreviewImageEvent(current, event));
  }

  function handleRetryImage(assetId: string) {
    if (!preview) return;
    setApproval(null);
    const revision = preview.revision;
    setImageGate((current) => retryPreviewImage(current, revision, assetId));
  }

  function clearChangedState(field?: ValidationField) {
    invalidateGenerationRequest();
    setIssues((current) =>
      field ? current.filter((issue) => issue.field !== field) : current,
    );
    setDirty(true);
    setApproval(null);
  }

  function handleValueChange<K extends keyof CampaignFormValues>(
    field: K,
    value: CampaignFormValues[K],
  ) {
    if (field === "openingFocus" && typeof value === "string") {
      openingByFormat.current[format] = value;
    }
    setValues((current) => ({ ...current, [field]: value, ...(browserBrief && field === "accent" ? { accentOverride: value as string } : {}) }));
    clearChangedState(field as ValidationField);
    if (field === "offer") {
      setIssues((current) => current.filter((issue) => issue.field !== "offerPrice"));
    }
  }

  function handleDirectionChange(value: string) {
    const direction = resolveVisualDirection(value);
    setValues(current => ({ ...current, directionId: direction.id, accent: current.accentOverride || current.brandKitSnapshot?.selections.find(v => v.role === "accent")?.value || direction.tokens.accent }));
    clearChangedState("directionId");
  }

  function handleBrandChange(value: string) {
    if (!isBrandId(value, catalog)) return;
    setValues((current) => ({
      ...current,
      brandId: value,
      accent: defaultAccent(value, catalog),
    }));
    clearChangedState("brandId");
    setIssues((current) => current.filter((issue) => issue.field !== "accent"));
  }

  function handleFormatChange(nextFormat: CampaignFormat) {
    invalidateGenerationRequest();
    setValues((current) => {
      const currentFormat = current.format ?? defaultFormat(fixture);
      const currentOptions = openingOptionsForFormat(fixture, currentFormat);
      if (
        current.openingFocus &&
        currentOptions.some((option) => option.id === current.openingFocus)
      ) {
        openingByFormat.current[currentFormat] = current.openingFocus;
      }

      const next = { ...current, format: nextFormat };
      if (nextFormat === "advertorial") {
        const approvedHero = fixture.brief.advertorial?.assetAssignments.find(
          (assignment) => assignment.role === "product-hero",
        )?.assetId;
        if (approvedHero) next.assetId = approvedHero;
      }
      next.openingFocus = openingFocusForFormat(
        fixture,
        nextFormat,
        openingByFormat.current[nextFormat],
      );
      return next;
    });
    setIssues([]);
    setDirty(true);
    setApproval(null);
  }

  function handleUseCompatibleLayout(layout: AdvertorialLayoutId) {
    handleValueChange("advertorialLayout", layout);
  }

  function handleUseOfferTemplate() {
    const alternative = evaluateOfferAlternative(
      fixture,
      values,
      catalog,
      openingByFormat.current.offer,
    );
    if (!alternative.ok || !alternative.preview) return;
    invalidateGenerationRequest();
    openingByFormat.current.offer = alternative.values.openingFocus;
    setValues(alternative.values);
    setIssues([]);
    setApproval(null);
    setAcceptedPresentation({ preview: alternative.preview, recipe: pendingMotion });
    setDirty(false);
    setGeneration(
      deterministicFallback(
        "The single-product offer template is selected because it validates the current approved brief.",
      ),
    );
  }

  function deterministicFallback(
    message: string,
    code: GenerationMetadata["code"] = "unavailable",
  ): GenerationMetadata {
    return {
      status: "fallback",
      provider: "deterministic",
      providerLabel: "Deterministic builder",
      providerMode: "none",
      harnessVersion: DESIGN_HARNESS_VERSION,
      guidancePackVersion: DESIGN_GUIDANCE_PACK_VERSION,
      code,
      message,
    };
  }

  async function handleGenerate() {
    const snapshot = { ...values };
    if (offerOnly) {
      snapshot.format = "offer";
      delete snapshot.advertorialLayout;
    }
    const recipeSnapshot = offerOnly ? "none" : pendingMotion;
    let candidateCatalog = catalog;
    try { if (browserBrief) candidateCatalog = browserDirectionCatalog(catalog, snapshot.directionId, snapshot.brandKitSnapshot, snapshot.accentOverride); }
    catch (error) { invalidateGenerationRequest(); setIssues([{field:"accent",message:(error as Error).message}]); setDirty(true); setApproval(null); return; }
    const local = buildConfiguredPreview(fixture, snapshot, candidateCatalog);
    if (!local.ok) {
      invalidateGenerationRequest();
      setIssues(local.issues);
      setDirty(true);
      setApproval(null);
      return;
    }

    const browserRequest = browserBrief?.(snapshot) ?? null;
    const requestId = requestGate.current.begin();
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setGenerating(true);
    setApproval(null);
    setIssues([]);

    try {
      const response = await fetch(generationEndpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(builderSubject ? { "x-builder-subject": builderSubject } : {}),
        },
        body: JSON.stringify(
          browserRequest
            ? {
                browserBrief: browserRequest,
                requestId: String(requestId),
              }
            : {
                fixtureId: fixture.id,
                values: snapshot,
                requestId: String(requestId),
              },
        ),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!requestGate.current.isCurrent(requestId)) return;

      if (!response.ok || !payload || payload.ok !== true) {
        if (payload?.issues?.length) {
          setIssues(payload.issues as ValidationIssue[]);
          setDirty(true);
          setApproval(null);
          return;
        }

        // A builder limit or accounting denial happens before dispatch. Keep
        // the last accepted preview visible instead of replacing it with a
        // fresh local draft, and surface the actionable server message.
        if (
          payload?.error === "generation_limit" ||
          payload?.error === "accounting_unavailable" ||
          payload?.error === "request_already_submitted" ||
          payload?.error === "generation_cancelled"
        ) {
          setGeneration(
            deterministicFallback(
              payload.message ?? "This generation request could not be started.",
            ),
          );
          setIssues([]);
          return;
        }

        setAcceptedPresentation({ preview: local.preview, recipe: recipeSnapshot });
        setGeneration(
          deterministicFallback(
            payload?.message ?? "The generation endpoint did not return a preview.",
          ),
        );
        setIssues([]);
        setDirty(false);
        return;
      }

      if (!payload.preview?.revision) {
        setAcceptedPresentation({ preview: local.preview, recipe: recipeSnapshot });
        setGeneration(
          deterministicFallback("The generation endpoint returned an unreadable preview."),
        );
        setIssues([]);
        setDirty(false);
        return;
      }

      setAcceptedPresentation({
        preview: withLocalBrowserAsset(
          payload.preview as ConfiguredPreviewData,
          browserAssetSrc,
        ),
        recipe: recipeSnapshot,
      });
      setGeneration(
        (payload.generation as GenerationMetadata | undefined) ??
          deterministicFallback("The preview was generated without provenance metadata."),
      );
      setIssues([]);
      setDirty(false);
    } catch {
      if (!requestGate.current.isCurrent(requestId)) return;
      setAcceptedPresentation({ preview: local.preview, recipe: recipeSnapshot });
      setGeneration(
        deterministicFallback(
          "Generation was unavailable, so this preview uses the deterministic builder.",
        ),
      );
      setIssues([]);
      setDirty(false);
    } finally {
      if (requestGate.current.isCurrent(requestId)) {
        setGenerating(false);
        inFlight.current = null;
      }
    }
  }

  function handleApprove() {
    if (!canApprove || !preview) return;
    approve();
    setExportError(null);
    setExportStatus(null);
  }

  async function handleExport() {
    if (
      !exportCapability.ok ||
      !approval ||
      !preview ||
      isAdvertorialPreviewData(preview)
    ) {
      return;
    }

    const article = previewCanvasRef.current?.querySelector<HTMLElement>("article");
    if (!article) {
      setExportError(
        "The rendered direct-offer page is not available. Generate it again before exporting.",
      );
      return;
    }

    const expectedGuard = { ...approvalGuardRef.current };
    const notice = renderedPilotNotice;
    const provenance = pilotProvenance;

    // Capture the article HTML, packshot handle, styles and approval in one
    // synchronous step. Everything after this point reads only the snapshot.
    const snapshot = captureCampaignExportSnapshot({
      article,
      approval: {
        revision: approval.revision,
        approvedAt: approval.approvedAt,
      },
      preview: {
        status: renderedPilotStatus ?? "confirmed",
        notice,
        revision: preview.revision,
        revisionIdentityVersion: preview.revisionIdentityVersion,
        motion: (preview as CampaignPreviewData).motion,
        ...(resolveCampaignComposition(preview.brief, preview.asset) ? { composition: resolveCampaignComposition(preview.brief, preview.asset) } : {}),
        imagePresentation: resolveCampaignImage(preview.asset, preview.theme.tokens),
        productName: preview.brief.productName,
        brandName: preview.theme.brand.name,
        offer: preview.brief.offer,
        offerPrice: preview.brief.offerPrice,
        destinationUrl: preview.brief.destinationUrl,
        actionLabel: preview.brief.actionLabel,
        template: {
          id: preview.draft.templateId,
          version: preview.draft.templateVersion,
          layout: preview.draft.layout,
          sections: preview.draft.sections,
        },
        ...(preview.theme.brand.visualDirection ? { visualDirection: { ...preview.theme.brand.visualDirection, tokens: { ...preview.theme.tokens } } } : {}),
        appearance: {
          accent: preview.theme.tokens.accent,
          accentInk: preview.theme.tokens.accentInk,
          ...(preview.brief.offerPrice?.trim()
            ? {
                offerEmphasisInk:
                  preview.theme.tokens.offerEmphasisInk ??
                  preview.theme.tokens.accent,
              }
            : {}),
        },
        asset: {
          id: preview.asset.id,
          contentHash: preview.asset.contentHash,
          alt: preview.asset.alt,
          width: preview.asset.width,
          height: preview.asset.height,
          src: preview.asset.src,
        },
        verification: exportVerification,
        provenance,
      },
      guard: expectedGuard,
      packshotBlob: exportPackshotBlob,
    });

    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportError(null);
    setExportStatus(null);

    try {
      const bundle = await prepareExport(snapshot, controller.signal);
      downloadCampaignExport(bundle);
      setExportStatus(
        `Exported ${bundle.fileName} · revision ${shortRevision(preview.revision)}.`,
      );
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "The standalone export could not be prepared.",
      );
    } finally {
      if (exportAbortRef.current === controller) {
        exportAbortRef.current = null;
      }
    }
  }

  function describedBy(field: ValidationField, extraId?: string): string | undefined {
    const ids = [
      issueByField.has(field) ? `${fieldIds[field]}-error` : null,
      extraId,
    ].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  }

  const previewStatusText = !preview
    ? "No valid preview yet. Fix the validation issue shown in the brief, then generate preview."
    : generating
      ? `Generating a fresh preview. Revision ${revisionLabel} stays available until a valid response arrives.`
      : approved
        ? `Local preview approval recorded. Revision ${revisionLabel} matches the preview; this is not publication approval.`
        : dirty
          ? otherIssues.length > 0
            ? `Preview not updated. Fix ${otherIssues.length} ${otherIssues.length === 1 ? "field" : "fields"} and generate again. The last valid preview, revision ${revisionLabel}, is still shown.`
            : `Preview out of date. Approval is cleared. Showing the last valid preview, revision ${revisionLabel}. Generate a fresh preview to review your edits.`
          : failedImageRows.length > 0 || pendingImageRows.length > 0
            ? `Preview revision ${revisionLabel} is shown; image status is below.`
            : `Preview ready for local review. Revision ${revisionLabel}.`;

  const reviewStatusText = !preview
    ? "Not approved. No valid preview is available yet."
    : generating
      ? "Not approved. Generating a fresh preview."
      : approved
        ? `Local preview approval recorded — revision ${revisionLabel}. Not publication approval.`
        : dirty
          ? "Not approved. Changes need a fresh preview."
          : failedImageRows.length > 0
            ? "Not approved. Image attention required."
            : pendingImageRows.length > 0
              ? "Not approved. Waiting for required images."
              : "Not approved.";

  const reviewTone = approved
    ? "border-[#3f7a5a] bg-[#eef5ee]"
    : dirty || generating || failedImageRows.length > 0 || pendingImageRows.length > 0
      ? "border-[#b98237] bg-[#fbf3e4]"
      : "border-[#d8cebd] bg-[#f8f3ea]";

  const generationStatusText = (() => {
    if (!preview && generation.status === "idle") {
      return "No valid preview has been generated yet.";
    }
    if (generation.status === "idle") {
      return "Deterministic draft. Generation has not run in this session.";
    }
    const harness = generation.harnessVersion ?? DESIGN_HARNESS_VERSION;
    const guidance =
      generation.guidancePackVersion ?? DESIGN_GUIDANCE_PACK_VERSION;
    if (generation.status === "generated") {
      const angle = generation.angle ?? "selected angle";
      const sections = generation.sections?.join(" → ") ?? "selected sections";
      const facts = generation.factIds?.length
        ? generation.factIds.join(", ")
        : "no approved facts";
      const mode =
        generation.providerMode === "local-test"
          ? "Local test output"
          : "Model generation";
      return `${mode} · ${generation.providerLabel}${generation.model ? ` (${generation.model})` : ""}. Opening ${angle}; sections ${sections}; facts ${facts}. Harness ${harness}; guidance pack ${guidance}.`;
    }
    const detail = generation.issues?.length
      ? ` ${generation.issues.length} proposal ${generation.issues.length === 1 ? "issue was" : "issues were"} rejected.`
      : "";
    const attempted =
      generation.providerMode === "local-test"
        ? "local-test attempt"
        : generation.providerMode === "model"
          ? "model attempt"
          : "deterministic path";
    return `Deterministic fallback · ${generation.message ?? "generation was unavailable."}${detail} · ${attempted}. Harness ${harness}; guidance pack ${guidance}.`;
  })();

  const generationTone = generation.status === "generated"
    ? "border-[#bcd7c2] bg-[#eef5ee] text-[#285a3d]"
    : generation.status === "fallback"
      ? "border-[#e2c99d] bg-[#fbf3e4] text-[#7a541d]"
      : "border-[#ddd3c2] bg-[#f8f3ea] text-[#5b5346]";

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
      <header className="border-b border-[#ddd3c2] bg-[#fbf8f1]/90 backdrop-blur">
        <div className="mx-auto flex min-w-0 max-w-[1600px] flex-wrap items-end justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0 space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#6d6a5f]">
              Ornigami · campaign workflow
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Campaign Lab
              </h1>
              <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[#c9bda8] bg-[#efe7d8] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#5b5346]">
                <span className="size-1.5 shrink-0 rounded-full bg-[#9a3f25]" aria-hidden="true" />
                <span className="min-w-0 break-words text-left">Local only · not published</span>
              </span>
              {catalog.pilot ? (
                <span
                  className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[#b98237] bg-[#fbf3e4] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a541d]"
                  data-pilot-badge={renderedPilotStatus}
                >
                  <span className="min-w-0 break-words text-left">
                    {catalog.pilot.label} ·{" "}
                    {renderedPilotStatus === "preview" ? "preview inputs" : "confirmed inputs"}
                  </span>
                </span>
              ) : null}
              {showFixtureNav ? (
                <Link
                  href="/campaign-lab/offer"
                  className="inline-flex min-h-9 min-w-0 max-w-full items-center rounded-full border border-[#b8aa93] bg-[#fffdf8] px-3 py-1.5 text-xs font-semibold text-[#3f3b33] transition-colors hover:border-[#9c8c73] hover:bg-[#f3ece0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d2a22] focus-visible:ring-offset-2"
                >
                  Offer intake
                </Link>
              ) : null}
            </div>
          </div>

          {showFixtureNav ? (
            <nav aria-label="Campaign fixtures" className="flex min-w-0 flex-wrap items-center gap-2">
              {Object.values(catalog.fixtures).map((item) => {
                const active = item.id === initialFixtureId;
                return (
                  <Link
                    key={item.id}
                    href={`/campaign-lab?fixture=${item.id}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 min-w-0 max-w-full items-center rounded-full border px-4 py-2 text-left text-xs font-semibold transition-colors break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d2a22] focus-visible:ring-offset-2",
                      active
                        ? "border-[#1d2a22] bg-[#1d2a22] text-[#fffdf8]"
                        : "border-[#d4c8b5] bg-[#fffdf8] text-[#4f4a3f] hover:border-[#b8aa93] hover:bg-[#f3ece0]",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:px-8 lg:py-6">
        <aside
          className="min-w-0 rounded-[1.25rem] border border-[#ddd3c2] bg-[#fffdf8] p-4 shadow-[0_20px_60px_-50px_rgba(35,36,32,.55)] lg:sticky lg:top-4"
          aria-labelledby={`${baseId}-campaign-brief-heading`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ebe3d6] pb-3">
            <div className="min-w-0 flex-1">
              <h2
                id={`${baseId}-campaign-brief-heading`}
                className="text-sm font-semibold tracking-tight"
              >
                Campaign brief
              </h2>
              <p className="mt-1 text-xs text-[#6d6a5f]">{fixture.description}</p>
              {catalog.pilot && effectivePilotNote ? (
                <p className="mt-1 text-xs font-medium text-[#7a541d]">{effectivePilotNote}</p>
              ) : null}
            </div>
            <span className="min-w-0 max-w-full rounded-full bg-[#efe7d8] px-2.5 py-1 text-left text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#5b5346] break-words">
              {fixture.label}
            </span>
          </div>

          <form
            className="mt-4 space-y-5"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleGenerate();
            }}
          >
            <fieldset className="m-0 space-y-4 border-0 p-0">
              <legend className="mb-1 text-sm font-semibold">Campaign facts</legend>
              {format === "offer" && allowMotion ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`${baseId}-motion`}>Experimental presentation</Label>
                  <select id={`${baseId}-motion`} value={pendingMotion}
                    className="w-full rounded-md border p-2"
                    onChange={(event) => {
                      if (!isMotionRecipeId(event.target.value)) return;
                      setPendingMotion(event.target.value);
                      clearChangedState();
                    }}>
                    {MOTION_RECIPES.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.label}</option>)}
                  </select>
                </div>
              ) : null}

              {offerOnly ? null : (
              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.format}>Format</Label>
                <select
                  id={fieldIds.format}
                  name="format"
                  className={nativeSelectClassName}
                  value={format}
                  onChange={(event) => handleFormatChange(event.target.value as CampaignFormat)}
                  aria-invalid={issueByField.has("format") || Boolean(capacityMessage)}
                  aria-describedby={describedBy(
                    "format",
                    capacityMessage ? capacityIssueId : undefined,
                  )}
                >
                  <option value="offer">
                    Single-product offer · v{SINGLE_PRODUCT_OFFER_TEMPLATE.version}
                  </option>
                  <option value="advertorial">
                    Single-product advertorial · v{ADVERTORIAL_MANIFEST.version}
                    {advertorialFit.fit ? "" : " · inputs missing"}
                  </option>
                </select>
                <p className="text-xs text-[#6d6a5f]">
                  {format === "advertorial"
                    ? "Approved story, evidence, disclosure and image roles are assembled deterministically."
                    : "The existing direct-offer workflow. Use it when the brief has no approved story."}
                </p>
                {issueByField.has("format") ? (
                  <p id={`${fieldIds.format}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("format")}
                  </p>
                ) : null}
              </div>
              )}

              {format === "advertorial" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldIds.advertorialLayout}>Advertorial layout</Label>
                  <select
                    id={fieldIds.advertorialLayout}
                    name="advertorialLayout"
                    className={nativeSelectClassName}
                    value={values.advertorialLayout ?? "auto"}
                    onChange={(event) =>
                      handleValueChange(
                        "advertorialLayout",
                        event.target.value as AdvertorialLayoutId | "auto",
                      )
                    }
                    aria-invalid={
                      issueByField.has("advertorialLayout") || Boolean(capacityMessage)
                    }
                    aria-describedby={describedBy(
                      "advertorialLayout",
                      capacityMessage ? capacityIssueId : undefined,
                    )}
                  >
                    <option value="auto">Auto from the approved image set</option>
                    <option value="advertorial-full">Full advertorial · story, evidence, product</option>
                    <option value="advertorial-one-photo">One photo · type-led opening</option>
                  </select>
                  {issueByField.has("advertorialLayout") ? (
                    <p
                      id={`${fieldIds.advertorialLayout}-error`}
                      className="text-xs font-medium text-[#a2382a]"
                    >
                      {issueByField.get("advertorialLayout")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {capacityMessage ? (
                <div
                  ref={capacityAlertRef}
                  id={capacityIssueId}
                  tabIndex={-1}
                  role="alert"
                  data-capacity-issue
                  className="rounded-xl border border-[#b98237] bg-[#fbf3e4] p-3 text-[#6b4918] outline-none focus-visible:ring-2 focus-visible:ring-[#7a541d] focus-visible:ring-offset-2"
                >
                  <p className="text-sm font-semibold">Required fact group does not fit</p>
                  <p className="mt-1 text-xs">{capacityMessage}</p>
                  <p className="mt-1 text-xs">
                    The editor will not shorten or split the approved group. Revise the approved
                    brief outside the editor so the complete group fits, then reload this page.
                  </p>
                </div>
              ) : null}

              {fixture.brief.sourceCampaign ? (
                <details className="rounded-lg border border-[#e4dccd] bg-[#f8f3ea] px-3 py-2 text-xs text-[#5f5a4f]">
                  <summary className="cursor-pointer font-semibold text-[#3f3b33]">
                    Source campaign promise
                  </summary>
                  <dl className="mt-2 grid gap-1.5">
                    <div>
                      <dt className="font-semibold">Promise</dt>
                      <dd>{fixture.brief.sourceCampaign.promise}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Source</dt>
                      <dd>
                        {fixture.brief.sourceCampaign.channel} ·{" "}
                        {fixture.brief.sourceCampaign.document}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold">Reviewed</dt>
                      <dd>
                        {fixture.brief.sourceCampaign.reviewedOn} by{" "}
                        {fixture.brief.sourceCampaign.reviewedBy}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[0.68rem] text-[#6d6a5f]">
                    Recorded for editorial review. The operator&apos;s source material stays
                    private.
                  </p>
                </details>
              ) : null}

              {!capacityMessage && !advertorialFit.fit && format === "advertorial" ? (
                <div className="rounded-xl border border-[#b98237] bg-[#fbf3e4] p-3 text-[#6b4918]">
                  <p className="text-sm font-semibold">Advertorial not ready for this brief</p>
                  {advertorialFit.layoutReason ? (
                    <p className="mt-1 text-xs">{advertorialFit.layoutReason}</p>
                  ) : null}
                  {advertorialFit.compatibleLayout ? (
                    <p className="mt-1 text-xs">
                      This brief fits the{" "}
                      {ADVERTORIAL_MANIFEST.layouts[advertorialFit.compatibleLayout].label}{" "}
                      layout instead.
                    </p>
                  ) : offerAlternative.ok ? (
                    <p className="mt-1 text-xs">
                      The current brief validates as a single-product offer. The advertorial still
                      needs:
                    </p>
                  ) : (
                    <p className="mt-1 text-xs">
                      No alternate format validates the current brief yet. Fix these inputs or
                      revise the approved brief:
                    </p>
                  )}
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {advertorialFit.missingInputs
                      .filter((input) => !isFactCapacityMessage(input))
                      .slice(0, 6)
                      .map((input) => (
                        <li key={input}>{input}</li>
                      ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {advertorialFit.compatibleLayout ? (
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        onClick={() =>
                          handleUseCompatibleLayout(advertorialFit.compatibleLayout!)
                        }
                      >
                        Use{" "}
                        {ADVERTORIAL_MANIFEST.layouts[advertorialFit.compatibleLayout].label}
                      </Button>
                    ) : null}
                    {offerAlternative.ok ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={handleUseOfferTemplate}
                      >
                        Use single-product offer
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {format === "advertorial" && advertorialFit.unusedImages.length > 0 ? (
                <div
                  className="rounded-xl border border-[#c9bda8] bg-[#f8f3ea] p-3 text-[#5b5346]"
                  data-unused-images
                >
                  <p className="text-sm font-semibold">Approved image not used</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                    {advertorialFit.unusedImages.map((image) => (
                      <li key={`${image.role}:${image.assetId}`}>{image.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.productName}>Product name</Label>
                <Input
                  id={fieldIds.productName}
                  name="productName"
                  value={values.productName}
                  onChange={(event) => handleValueChange("productName", event.target.value)}
                  autoComplete="off"
                  required
                  aria-invalid={issueByField.has("productName")}
                  aria-describedby={describedBy("productName")}
                />
                {issueByField.has("productName") ? (
                  <p id={`${fieldIds.productName}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("productName")}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={audienceId}>Audience</Label>
                  <Input
                    id={audienceId}
                    name="audience"
                    value={values.audience ?? ""}
                    onChange={(event) => handleValueChange("audience", event.target.value)}
                    autoComplete="off"
                    placeholder="Who is this campaign for?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={objectiveId}>Campaign objective</Label>
                  <Input
                    id={objectiveId}
                    name="objective"
                    value={values.objective ?? ""}
                    onChange={(event) => handleValueChange("objective", event.target.value)}
                    autoComplete="off"
                    placeholder="What should the page achieve?"
                  />
                </div>
              </div>
              <p className="text-xs text-[#6d6a5f]">
                Audience and objective guide generation and are not rendered as page copy.
              </p>

              {openingOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldIds.openingFocus}>
                    {format === "advertorial" ? "Advertorial opening" : "Opening focus"}
                  </Label>
                  <select
                    id={fieldIds.openingFocus}
                    name="openingFocus"
                    className={nativeSelectClassName}
                    value={values.openingFocus ?? ""}
                    onChange={(event) => handleValueChange("openingFocus", event.target.value)}
                    aria-invalid={issueByField.has("openingFocus")}
                    aria-describedby={describedBy("openingFocus")}
                  >
                    {openingOptions.map((opening) => (
                      <option key={opening.id} value={opening.id}>
                        {opening.label}
                      </option>
                    ))}
                  </select>
                  {issueByField.has("openingFocus") ? (
                    <p id={fieldIds.openingFocus + "-error"} className="text-xs font-medium text-[#a2382a]">
                      {issueByField.get("openingFocus")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.offer}>Offer</Label>
                <Input
                  id={fieldIds.offer}
                  name="offer"
                  value={values.offer}
                  onChange={(event) => handleValueChange("offer", event.target.value)}
                  autoComplete="off"
                  required
                  aria-invalid={issueByField.has("offer")}
                  aria-describedby={describedBy("offer")}
                />
                {issueByField.has("offer") ? (
                  <p id={`${fieldIds.offer}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("offer")}
                  </p>
                ) : null}
              </div>

              {format === "offer" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldIds.offerPrice}>
                    Reviewed offer emphasis (optional)
                  </Label>
                  <Input
                    id={fieldIds.offerPrice}
                    name="offerPrice"
                    value={values.offerPrice ?? ""}
                    onChange={(event) => handleValueChange("offerPrice", event.target.value)}
                    autoComplete="off"
                    aria-invalid={issueByField.has("offerPrice")}
                    aria-describedby={describedBy("offerPrice")}
                  />
                  <p className="text-xs text-[#6d6a5f]">
                    Exact text from the offer to emphasise. The renderer never infers a
                    price, currency, reference price, or discount.
                  </p>
                  {issueByField.has("offerPrice") ? (
                    <p id={`${fieldIds.offerPrice}-error`} className="text-xs font-medium text-[#a2382a]">
                      {issueByField.get("offerPrice")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.destinationUrl}>Destination URL</Label>
                <Input
                  id={fieldIds.destinationUrl}
                  name="destinationUrl"
                  type="url"
                  inputMode="url"
                  value={values.destinationUrl}
                  onChange={(event) => handleValueChange("destinationUrl", event.target.value)}
                  autoComplete="url"
                  spellCheck={false}
                  required
                  aria-invalid={issueByField.has("destinationUrl")}
                  aria-describedby={describedBy("destinationUrl")}
                />
                {issueByField.has("destinationUrl") ? (
                  <p
                    id={`${fieldIds.destinationUrl}-error`}
                    className="text-xs font-medium text-[#a2382a]"
                  >
                    {issueByField.get("destinationUrl")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.assetId}>Product image</Label>
                <select
                  id={fieldIds.assetId}
                  name="assetId"
                  className={nativeSelectClassName}
                  value={values.assetId}
                  onChange={(event) => handleValueChange("assetId", event.target.value)}
                  required
                  aria-invalid={issueByField.has("assetId")}
                  aria-describedby={describedBy("assetId", assetMetaId)}
                >
                  <option value="">Select an approved image</option>
                  {heroAssetOptions.map((asset, index) => (
                    <option key={`${asset.id}-${index}`} value={asset.id}>
                      {assetLabel(asset, catalog)} — approved
                    </option>
                  ))}
                </select>
                <p id={assetMetaId} className="text-xs text-[#6d6a5f]">
                  {selectedAsset
                    ? `${selectedAsset.id} · reviewed ${selectedAsset.reviewedOn}`
                    : "No approved image selected."}
                </p>
                {issueByField.has("assetId") ? (
                  <p id={`${fieldIds.assetId}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("assetId")}
                  </p>
                ) : null}

                <details className="rounded-lg border border-[#e4dccd] bg-[#f8f3ea] px-3 py-2 text-xs text-[#5f5a4f]">
                  <summary className="cursor-pointer font-semibold text-[#3f3b33]">
                    Approved asset record
                  </summary>
                  {selectedAsset ? (
                    <dl className="mt-2 grid gap-1.5">
                      <div>
                        <dt className="font-semibold">Asset ID</dt>
                        <dd>{selectedAsset.id}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Alt text</dt>
                        <dd>{selectedAsset.alt}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Reviewed</dt>
                        <dd>
                          {selectedAsset.reviewedOn} by {selectedAsset.reviewedBy}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Source</dt>
                        <dd>{selectedAsset.source}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold">Rights</dt>
                        <dd>{selectedAsset.rights}</dd>
                      </div>
                      {selectedAsset.crop ? (
                        <div>
                          <dt className="font-semibold">Crop</dt>
                          <dd>{selectedAsset.crop}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="mt-2">No approved image selected.</p>
                  )}
                </details>
              </div>
            </fieldset>

            <fieldset className="m-0 space-y-4 border-0 p-0">
              <legend className="mb-1 text-sm font-semibold">Brand styling</legend>
              {browserBrief ? <BrandEvidenceReview snapshot={values.brandKitSnapshot} directionId={values.directionId} accentOverride={values.accentOverride} onApply={snapshot => { setValues(current => ({ ...current, brandKitSnapshot: snapshot, accent: current.accentOverride || snapshot?.selections.find(v => v.role === "accent")?.value || resolveVisualDirection(current.directionId).tokens.accent })); clearChangedState("accent"); }} /> : null}
              {browserBrief ? <div className="space-y-1"><Label htmlFor="browser-composition">Composition</Label><select id="browser-composition" className={nativeSelectClassName} value={values.composition ?? "direction-default"} onChange={event => { setValues(current => ({ ...current, composition: parseOfferComposition(event.target.value) })); clearChangedState("composition"); }}><option value="direction-default">Direction default</option><option value="product-focus">Product focus</option></select></div> : null}
              {browserBrief ? <div className="space-y-2"><Label htmlFor="browser-visual-direction">Visual direction</Label>
                <select id="browser-visual-direction" className={nativeSelectClassName} value={values.directionId ?? "clear"} onChange={event => handleDirectionChange(event.target.value)}>
                  {VISUAL_DIRECTIONS.map(direction => <option key={direction.id} value={direction.id}>{direction.name}</option>)}
                </select>
                <button type="button" className="min-h-11 text-sm underline" onClick={() => { setValues(current => ({ ...current, accentOverride: undefined, accent: current.brandKitSnapshot?.selections.find(v => v.role === "accent")?.value || resolveVisualDirection(current.directionId).tokens.accent })); clearChangedState("accent"); }}>Use reviewed / direction accent</button>
              </div> : null}

              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[brand.tokens.page, brand.tokens.surface, brand.tokens.ink, brand.tokens.accent].map(
                  (color) => (
                    <span
                      key={color}
                      className="size-5 rounded-full border border-[#cbbda8]"
                      style={{ backgroundColor: color }}
                    />
                  ),
                )}
              </div>

              {!browserBrief ? <div className="space-y-1.5">
                <Label htmlFor={fieldIds.brandId}>Brand style</Label>
                <select
                  id={fieldIds.brandId}
                  name="brandId"
                  className={nativeSelectClassName}
                  value={values.brandId}
                  onChange={(event) => handleBrandChange(event.target.value)}
                  required
                  aria-invalid={issueByField.has("brandId")}
                  aria-describedby={describedBy("brandId")}
                >
                  {Object.values(catalog.brands).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.descriptor}
                    </option>
                  ))}
                </select>
                {issueByField.has("brandId") ? (
                  <p id={`${fieldIds.brandId}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("brandId")}
                  </p>
                ) : null}
              </div> : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={fieldIds.accent}>Accent color</Label>
                  <code className="text-xs text-[#6d6a5f]">{values.accent}</code>
                </div>
                {browserBrief ? <div className="space-y-1"><Label htmlFor="browser-accent-override">Accent override (hex)</Label><Input className="min-h-11" id="browser-accent-override" value={values.accentOverride ?? ""} placeholder={resolveVisualDirection(values.directionId).tokens.accent} onChange={event => {
                  if (event.target.value === "") { setValues(current => ({ ...current, accentOverride: undefined, accent: current.brandKitSnapshot?.selections.find(v => v.role === "accent")?.value || resolveVisualDirection(current.directionId).tokens.accent })); clearChangedState("accent"); }
                  else handleValueChange("accent", event.target.value);
                }} /></div> : null}
                <input
                  id={fieldIds.accent}
                  name="accent"
                  type="color"
                  value={values.accent}
                  onChange={(event) => handleValueChange("accent", event.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-[#d8cebd] bg-[#fffdf8] p-1"
                  aria-invalid={issueByField.has("accent")}
                  aria-describedby={describedBy("accent", accentHintId)}
                />
                <p id={accentHintId} className="text-xs text-[#6d6a5f]">
                  Used for the offer rule and primary action. Action text contrast adjusts automatically.
                </p>
                {issueByField.has("accent") ? (
                  <p id={`${fieldIds.accent}-error`} className="text-xs font-medium text-[#a2382a]">
                    {issueByField.get("accent")}
                  </p>
                ) : null}
              </div>
            </fieldset>

            {otherIssues.length > 0 ? (
              <div
                ref={errorSummaryRef}
                tabIndex={-1}
                role="group"
                aria-labelledby={errorSummaryHeadingId}
                className="rounded-xl border border-[#c65c45] bg-[#fff1ec] p-3 text-[#6d2b20] outline-none focus-visible:ring-2 focus-visible:ring-[#a2382a] focus-visible:ring-offset-2"
              >
                <p id={errorSummaryHeadingId} className="text-sm font-semibold">
                  {preview ? "Preview not updated" : "No valid preview"}
                </p>
                <p className="mt-1 text-xs">
                  {preview
                    ? "The last valid preview is still shown."
                    : "The editor is still usable. Fix the validation issue before generating."}{" "}
                  Fix {otherIssues.length === 1 ? "this field" : "these fields"}:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {otherIssues.map((issue) => (
                    <li key={issue.field}>
                      <a
                        href={`#${fieldIds[issue.field]}`}
                        className="underline decoration-[#a2382a]/50 underline-offset-2 hover:decoration-[#a2382a]"
                      >
                        {issue.message}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={!editorReady || generating}
                aria-busy={generating}
                aria-describedby={formStatusId}
              >
                {generating ? "Generating preview…" : "Generate preview"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={handleApprove}
                disabled={!canApprove}
                aria-describedby={previewStatusId}
              >
                Approve preview locally
              </Button>
            </div>

            <p
              id={formStatusId}
              role="status"
              aria-live="polite"
              className={cn(
                "text-xs font-medium",
                issueCount > 0
                  ? "text-[#a2382a]"
                  : dirty
                    ? "text-[#7a541d]"
                    : "text-[#4f6b55]",
              )}
            >
              {generating
                ? "Generating preview. The last valid preview remains available."
                : issueCount > 0
                  ? `${issueCount} ${issueCount === 1 ? "issue needs" : "issues need"} attention.`
                  : dirty
                    ? "Changes not yet validated. Generate preview to validate."
                    : "No validation errors."}
            </p>

            <div
              className={cn("rounded-xl border p-3", reviewTone)}
              data-local-preview-approval={approved ? "true" : "false"}
              data-approval-revision={approval?.revision}
              data-approval-scope="local-preview"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#5f5a4f]">
                  Local review status
                </p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]",
                    approved
                      ? "bg-[#dcecdf] text-[#285a3d]"
                      : dirty
                        ? "bg-[#f2e2c4] text-[#7a541d]"
                        : "bg-[#e9e0d1] text-[#5b5346]",
                  )}
                >
                  {approved
                    ? "Local preview approval"
                    : failedImageRows.length > 0
                      ? "Image failed"
                      : pendingImageRows.length > 0
                        ? "Loading images"
                        : dirty
                          ? "Needs fresh preview"
                          : "Not approved"}
                </span>
              </div>
              <p id={reviewStatusId} className="mt-2 text-sm font-medium">
                {reviewStatusText}
              </p>
              {preview ? (
                <div
                  className="mt-3 rounded-lg border border-[#d8cebd] bg-white/60 p-2.5"
                  data-image-gate
                  data-images-ready={imageSummary.ready ? "true" : "false"}
                >
                  <p className="text-xs font-medium" role="status" aria-live="polite">
                    {imagePanelText}
                  </p>
                  {failedImageRows.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-xs">
                      {failedImageRows.map((row) => (
                        <li
                          key={row.assetId}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span className="min-w-0 break-words">
                            {row.roleLabel} · {row.label} ({row.assetId}) did not load. Check the
                            approved asset file, then retry.
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="min-h-9 w-full px-3 py-1.5 text-xs sm:w-auto"
                            onClick={() => handleRetryImage(row.assetId)}
                          >
                            Retry {row.roleLabel}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-1 text-xs text-[#6d6a5f]">
                Local preview approval applies only to revision {revisionLabel ?? "none"} in
                this browser session; it is not publication approval. Editing any field or
                generating a new revision clears it.
                {approval ? " Recorded locally in this browser session." : ""}
              </p>
            </div>

            <div
              className={cn(
                "rounded-xl border p-3",
                exportCapability.ok
                  ? "border-[#bcd7c2] bg-[#eef5ee]"
                  : "border-[#ddd3c2] bg-[#f8f3ea]",
              )}
              data-export-panel
              data-export-ready={canExport ? "true" : "false"}
              data-exporting={exporting ? "true" : "false"}
              data-export-revision={exportCapability.ok ? revision : undefined}
              data-export-reason={exportCapability.ok ? undefined : exportCapability.reason}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#5f5a4f]">
                  Standalone export
                </p>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]",
                    exportCapability.ok
                      ? "bg-[#dcecdf] text-[#285a3d]"
                      : "bg-[#e9e0d1] text-[#5b5346]",
                  )}
                >
                  {exportCapability.ok ? "Ready" : "Locked"}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium">
                {exportCapability.reason}
              </p>
              <p className="mt-1 text-xs text-[#6d6a5f]">
                The local ZIP contains index.html, styles.css, the approved packshot and a
                revision receipt. Only the rendered direct-offer page is included; editor
                controls and internal notes are excluded.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full sm:w-auto"
                onClick={() => void handleExport()}
                disabled={!canExport}
                aria-describedby={reviewStatusId}
                data-export-button
              >
                {exporting ? "Preparing export…" : "Export approved page"}
              </Button>
              {exportError ? (
                <p
                  className="mt-2 text-xs font-medium text-[#a2382a]"
                  role="alert"
                  data-export-error
                >
                  {exportError}
                </p>
              ) : exportStatus ? (
                <p
                  className="mt-2 text-xs font-medium text-[#285a3d]"
                  role="status"
                  aria-live="polite"
                  data-export-status
                >
                  {exportStatus}
                </p>
              ) : null}
            </div>

            <div
              className={cn("rounded-xl border p-3", generationTone)}
              data-generation-status={generation.status}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] opacity-80">
                  Draft source
                </p>
                <span className="rounded-full bg-white/55 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.1em]">
                  {generation.status === "generated"
                    ? generation.providerMode === "local-test"
                      ? "Local test output"
                      : "Model generation"
                    : generation.status === "fallback"
                      ? "Fallback"
                      : "Not generated"}
                </span>
              </div>
              <p id={generationEditorStatusId} className="mt-2 text-sm font-medium">
                {generationStatusText}
              </p>
              {generation.status === "fallback" && generation.issues?.length ? (
                <ul
                  className="mt-2 list-disc space-y-1 pl-5 text-xs"
                  aria-label="Rejected proposal reasons"
                >
                  {generation.issues.slice(0, 4).map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </form>
        </aside>

        <section
          className="min-w-0 rounded-[1.25rem] border border-[#d8cebd] bg-[#fffdf8] p-3 shadow-[0_20px_60px_-55px_rgba(35,36,32,.55)] sm:p-4"
          aria-labelledby={previewHeadingId}
          aria-describedby={previewStatusId}
          data-fixture={initialFixtureId}
          data-format={format}
          data-template={preview?.draft.templateId}
          data-template-version={preview?.draft.templateVersion}
          data-layout={preview?.draft.layout}
          data-revision={revision ?? undefined}
          data-asset-id={preview?.asset.id}
          data-asset-content-hash={preview?.asset.contentHash}
          data-asset-source={preview?.asset.source}
          data-pilot={catalog.pilot?.id}
          data-preview-status={renderedPilotStatus}
          data-preview-verification={
            renderedPilotStatus === "preview"
              ? "provisional"
              : renderedPilotStatus === "confirmed"
                ? "confirmed"
                : undefined
          }
          data-preview-dirty={dirty ? "true" : "false"}
          data-generation-status={generation.status}
          data-generation-provider={generation.status === "idle" ? "deterministic" : generation.provider}
          data-generation-mode={generation.status === "idle" ? "none" : generation.providerMode}
          data-generation-harness-version={generation.status === "idle" ? DESIGN_HARNESS_VERSION : generation.harnessVersion}
          data-generation-guidance-version={generation.status === "idle" ? DESIGN_GUIDANCE_PACK_VERSION : generation.guidancePackVersion}
          data-generation-code={generation.status === "fallback" ? generation.code : undefined}
          data-generation-angle={generation.status === "generated" ? generation.angle : undefined}
          data-images-ready={preview ? (imageSummary.ready ? "true" : "false") : undefined}
          data-image-statuses={
            preview
              ? imageRows
                  .map(
                    (row) =>
                      `${row.assetId}:${imageSummary.statuses[row.assetId] ?? "pending"}`,
                  )
                  .join(",")
              : undefined
          }
          data-image-failures={imageSummary.failedAssetIds.join(",") || undefined}
          data-approval-blocked-by={approvalBlockedByImages ? "images" : undefined}
          data-section-order={preview?.draft.sections.join(",")}
          data-fact-ids={preview?.draft.facts.map((fact) => fact.id).join(",")}
          data-story-beat-ids={advertorialPreview?.draft.story.map((beat) => beat.id).join(",")}
          data-disclosure-label={advertorialPreview?.draft.disclosure.label}
          data-advertorial-fit={advertorialFit.fit ? "true" : "false"}
          data-advertorial-compatible-layout={advertorialFit.compatibleLayout}
          data-asset-ids={advertorialPreview?.assets.map((entry) => entry.asset.id).join(",")}
          data-unused-asset-ids={advertorialFit.unusedImages.map((image) => image.assetId).join(",")}
          data-generation-issues={
            generation.status === "fallback" ? generation.issues?.join(" | ") : undefined
          }
        >
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-1 pb-3">
            <div className="min-w-0">
              <h2 id={previewHeadingId} className="text-sm font-semibold tracking-tight">
                Campaign preview
              </h2>
              <p className="mt-1 text-xs text-[#6d6a5f]">
                {template && layout
                  ? `${template.name} · v${template.version} · ${layout.label}`
                  : "No valid template preview yet"}
              </p>
            </div>
            <span
              className="max-w-full rounded-full border border-[#d4c8b5] bg-[#f8f3ea] px-3 py-1 font-mono text-[0.68rem] text-[#5b5346] break-words"
              title={revision ?? undefined}
              data-approved={approved ? "true" : "false"}
              data-approved-revision={approval?.revision}
            >
              {revisionLabel ? `Revision ${revisionLabel}` : "No revision"}
            </span>
          </div>

          <p
            id={generationPreviewStatusId}
            role="status"
            aria-live="polite"
            className={cn(
              "mb-2 rounded-lg border px-3 py-2 text-xs font-medium",
              generationTone,
            )}
          >
            {generationStatusText}
          </p>

          <p
            id={previewStatusId}
            role="status"
            aria-live="polite"
            className={cn(
              "mb-3 rounded-lg border px-3 py-2 text-xs font-medium",
              approved
                ? "border-[#bcd7c2] bg-[#eef5ee] text-[#285a3d]"
                : dirty
                  ? "border-[#e2c99d] bg-[#fbf3e4] text-[#7a541d]"
                  : "border-[#ddd3c2] bg-[#f8f3ea] text-[#5b5346]",
            )}
          >
            {previewStatusText}
          </p>

          {preview ? (
            <div
              ref={previewCanvasRef}
              className={cn(
                "overflow-hidden rounded-xl border bg-white",
                dirty ? "border-[#c08a3f]" : "border-[#cec3b1]",
              )}
              data-preview-canvas
            >
              {advertorialPreview ? (
                <AdvertorialPage
                  brief={advertorialPreview.brief}
                  draft={advertorialPreview.draft}
                  assets={advertorialPreview.assets}
                  theme={advertorialPreview.theme}
                  headingId={pageHeadingId}
                  imageRevision={advertorialPreview.revision}
                  imageStatuses={imageSummary.statuses}
                  imageAttempts={Object.fromEntries(
                    imageRows.map((row) => [
                      row.assetId,
                      previewImageAttempt(imageGate, revision, row.assetId),
                    ]),
                  )}
                  onImageStateChange={handleImageStateChange}
                />
              ) : (
                <CampaignPage
                  motion={(preview as CampaignPreviewData).motion}
                  brief={(preview as CampaignPreviewData).brief}
                  draft={(preview as CampaignPreviewData).draft}
                  asset={preview.asset}
                  theme={preview.theme}
                  headingId={pageHeadingId}
                  imageRevision={preview.revision}
                  imageStatus={previewImageStatus(
                    imageGate,
                    revision,
                    preview.asset.id,
                  )}
                  imageAttempt={previewImageAttempt(
                    imageGate,
                    revision,
                    preview.asset.id,
                  )}
                  onImageStateChange={handleImageStateChange}
                  previewLabel={renderedPilotNotice}
                />
              )}
            </div>
          ) : (
            <div
              className="rounded-xl border border-dashed border-[#c08a3f] bg-[#fbf3e4] p-4 text-[#6b4918]"
              data-preview-empty
            >
              <p className="text-sm font-semibold">No valid preview</p>
              <p className="mt-1 text-xs">
                {capacityMessage
                  ? "Revise the approved brief above, reload this page, then generate again."
                  : "Fix the validation issue in the brief above, then generate a preview."}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
