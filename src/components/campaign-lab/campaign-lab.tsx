"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADVERTORIAL_MANIFEST,
  assessAdvertorialFit,
  buildConfiguredPreview,
} from "@/lib/campaign-lab/advertorial";
import type {
  AdvertorialPreviewData,
  ConfiguredPreviewData,
} from "@/lib/campaign-lab/advertorial";
import {
  createFormValues,
  defaultAccent,
  getAsset,
  getBrand,
  isBrandId,
} from "@/lib/campaign-lab/fixtures";
import { GenerationRequestGate } from "@/lib/campaign-lab/generation/client-gate";
import type { GenerationMetadata } from "@/lib/campaign-lab/generation/types";
import {
  SINGLE_PRODUCT_OFFER_TEMPLATE,
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

import { AdvertorialPage } from "./advertorial-page";
import { CampaignPage } from "./campaign-page";

type CampaignLabProps = {
  initialFixtureId: FixtureId;
  catalog: CampaignCatalog;
};

type Approval = {
  revision: string;
  approvedAt: string;
};

type GenerationState = { status: "idle" } | GenerationMetadata;

function isAdvertorialPreview(preview: ConfiguredPreviewData): preview is AdvertorialPreviewData {
  return preview.draft.templateId === ADVERTORIAL_MANIFEST.id;
}

const ASSET_LABELS: Record<string, string> = {
  "harbor-field-bottle-front": "Harbor Field bottle",
  "morrow-ceramic-dripper-front": "Morrow Ceramic dripper",
  "momisa-glow-box-front": "Momisa Glow Box packshot",
};

function assetLabel(asset: ApprovedAsset, catalog: CampaignCatalog): string {
  return ASSET_LABELS[asset.id] ??
    `${catalog.brands[asset.brandId]?.name ?? asset.brandId} product image`;
}

export function CampaignLab({ initialFixtureId, catalog }: CampaignLabProps) {
  const fixture = catalog.fixtures[initialFixtureId];
  const editorReady = useSyncExternalStore(() => () => {}, () => true, () => false);
  const baseId = useId().replace(/:/g, "");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const previousIssueCount = useRef(0);
  const requestGate = useRef(new GenerationRequestGate());
  const inFlight = useRef<AbortController | null>(null);

  const [values, setValues] = useState<CampaignFormValues>(() => createFormValues(fixture, catalog));
  const [preview, setPreview] = useState<ConfiguredPreviewData>(() => {
    const result = buildConfiguredPreview(fixture, createFormValues(fixture, catalog), catalog);
    if (!result.ok) throw new Error(`The ${fixture.label} campaign fixture is invalid.`);
    return result.preview;
  });
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const [generating, setGenerating] = useState(false);

  const brand = getBrand(values.brandId, catalog);
  const selectedAsset = getAsset(values.assetId, catalog);
  const advertorialPreview = isAdvertorialPreview(preview) ? preview : null;
  const advertorialFit = assessAdvertorialFit(fixture, values, catalog);
  const format: CampaignFormat =
    values.format ?? (fixture.brief.advertorial ? "advertorial" : "offer");
  const advertorialOpenings = fixture.brief.advertorial?.openings ?? [];
  const approvedHeroAssignment = fixture.brief.advertorial?.assetAssignments.find(
    (assignment) => assignment.role === "product-hero",
  );
  const heroAssetOptions = catalog.assets.filter((asset) =>
    format === "advertorial"
      ? asset.id === approvedHeroAssignment?.assetId
      : asset.role === "product-hero",
  );
  const template = advertorialPreview ? ADVERTORIAL_MANIFEST : SINGLE_PRODUCT_OFFER_TEMPLATE;
  const layout = advertorialPreview
    ? ADVERTORIAL_MANIFEST.layouts[advertorialPreview.draft.layout]
    : SINGLE_PRODUCT_OFFER_TEMPLATE.layouts[(preview as CampaignPreviewData).draft.layout];
  const issueByField = new Map(issues.map((issue) => [issue.field, issue.message]));
  const approved = approval?.revision === preview.revision && !dirty && !generating;
  const canApprove = editorReady && !dirty && !generating && issues.length === 0 && !approved;
  const revisionLabel = shortRevision(preview.revision);

  const fieldIds: Record<ValidationField, string> = {
    brandId: `${baseId}-brand-style`,
    accent: `${baseId}-accent`,
    productName: `${baseId}-product-name`,
    offer: `${baseId}-offer`,
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
  const assetMetaId = `${baseId}-asset-meta`;
  const accentHintId = `${baseId}-accent-hint`;

  useEffect(() => {
    if (issues.length > previousIssueCount.current) {
      errorSummaryRef.current?.focus();
    }
    previousIssueCount.current = issues.length;
  }, [issues]);

  useEffect(() => {
    const gate = requestGate.current;
    return () => {
      gate.invalidate();
      inFlight.current?.abort();
    };
  }, []);

  function invalidateGenerationRequest() {
    requestGate.current.invalidate();
    inFlight.current?.abort();
    inFlight.current = null;
    setGenerating(false);
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
    setValues((current) => ({ ...current, [field]: value }));
    clearChangedState(field as ValidationField);
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
      const next = { ...current, format: nextFormat };
      if (nextFormat === "advertorial") {
        const approvedHero = fixture.brief.advertorial?.assetAssignments.find(
          (assignment) => assignment.role === "product-hero",
        )?.assetId;
        if (approvedHero) next.assetId = approvedHero;
        const openings = fixture.brief.advertorial?.openings ?? [];
        if (openings.length > 0 && !openings.some((opening) => opening.id === current.openingFocus)) {
          next.openingFocus = openings[0].id;
        }
      } else if (
        fixture.openings &&
        !fixture.openings.some((opening) => opening.id === current.openingFocus)
      ) {
        next.openingFocus = fixture.openings[0]?.id;
      }
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
    invalidateGenerationRequest();
    const next: CampaignFormValues = {
      ...values,
      format: "offer",
      advertorialLayout: "auto",
    };
    const heroAsset = getAsset(next.assetId, catalog);
    if (heroAsset?.role !== "product-hero") {
      next.assetId =
        catalog.assets.find((asset) => asset.role === "product-hero" && asset.brandId === next.brandId)?.id ??
        next.assetId;
    }
    if (
      fixture.openings &&
      !fixture.openings.some((opening) => opening.id === next.openingFocus)
    ) {
      next.openingFocus = fixture.openings[0]?.id;
    }
    setValues(next);
    setIssues([]);
    setApproval(null);
    const result = buildConfiguredPreview(fixture, next, catalog);
    if (result.ok) {
      setPreview(result.preview);
      setDirty(false);
      setGeneration(
        deterministicFallback(
          "The single-product offer template is selected because this brief has no approved advertorial story.",
        ),
      );
    } else {
      setIssues(result.issues);
      setDirty(true);
    }
  }

  function deterministicFallback(
    message: string,
    code: GenerationMetadata["code"] = "unavailable",
  ): GenerationMetadata {
    return {
      status: "fallback",
      provider: "deterministic",
      providerLabel: "Deterministic builder",
      code,
      message,
    };
  }

  async function handleGenerate() {
    const snapshot = { ...values };
    const local = buildConfiguredPreview(fixture, snapshot, catalog);
    if (!local.ok) {
      invalidateGenerationRequest();
      setIssues(local.issues);
      setDirty(true);
      setApproval(null);
      return;
    }

    const requestId = requestGate.current.begin();
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setGenerating(true);
    setApproval(null);
    setIssues([]);

    try {
      const response = await fetch("/api/campaign-lab/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fixture.id,
          values: snapshot,
          requestId: String(requestId),
        }),
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

        setPreview(local.preview);
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
        setPreview(local.preview);
        setGeneration(
          deterministicFallback("The generation endpoint returned an unreadable preview."),
        );
        setIssues([]);
        setDirty(false);
        return;
      }

      setPreview(payload.preview as ConfiguredPreviewData);
      setGeneration(
        (payload.generation as GenerationMetadata | undefined) ??
          deterministicFallback("The preview was generated without provenance metadata."),
      );
      setIssues([]);
      setDirty(false);
    } catch {
      if (!requestGate.current.isCurrent(requestId)) return;
      setPreview(local.preview);
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
    if (!canApprove) return;
    setApproval({
      revision: preview.revision,
      approvedAt: new Date().toISOString(),
    });
  }

  function describedBy(field: ValidationField, extraId?: string): string | undefined {
    const ids = [
      issueByField.has(field) ? `${fieldIds[field]}-error` : null,
      extraId,
    ].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  }

  const previewStatusText = generating
    ? `Generating a fresh preview. Revision ${revisionLabel} stays available until a valid response arrives.`
    : approved
      ? `Approved locally. Revision ${revisionLabel} matches the preview.`
      : dirty
        ? issues.length > 0
          ? `Preview not updated. Fix ${issues.length} ${issues.length === 1 ? "field" : "fields"} and generate again. The last valid preview, revision ${revisionLabel}, is still shown.`
          : `Preview out of date. Approval is cleared. Showing the last valid preview, revision ${revisionLabel}. Generate a fresh preview to review your edits.`
        : `Preview ready for local review. Revision ${revisionLabel}.`;

  const reviewStatusText = generating
    ? "Not approved. A fresh preview is being generated."
    : approved
      ? `Approved locally — revision ${revisionLabel}.`
      : dirty
        ? "Not approved. Changes need a fresh preview."
        : "Not approved. Preview ready for local review.";

  const reviewTone = approved
    ? "border-[#3f7a5a] bg-[#eef5ee]"
    : dirty || generating
      ? "border-[#b98237] bg-[#fbf3e4]"
      : "border-[#d8cebd] bg-[#f8f3ea]";

  const generationStatusText = (() => {
    if (generation.status === "idle") {
      return "Deterministic draft. Generation has not run in this session.";
    }
    if (generation.status === "generated") {
      const angle = generation.angle ?? "selected angle";
      const sections = generation.sections?.join(" → ") ?? "selected sections";
      const facts = generation.factIds?.length
        ? generation.factIds.join(", ")
        : "no approved facts";
      return `Generated with ${generation.providerLabel}${generation.model ? ` (${generation.model})` : ""}. Opening ${angle}; sections ${sections}; facts ${facts}.`;
    }
    const detail = generation.issues?.length
      ? ` ${generation.issues.length} proposal ${generation.issues.length === 1 ? "issue was" : "issues were"} rejected.`
      : "";
    return `Deterministic fallback · ${generation.message ?? "generation was unavailable."}${detail}`;
  })();

  const generationTone = generation.status === "generated"
    ? "border-[#bcd7c2] bg-[#eef5ee] text-[#285a3d]"
    : generation.status === "fallback"
      ? "border-[#e2c99d] bg-[#fbf3e4] text-[#7a541d]"
      : "border-[#ddd3c2] bg-[#f8f3ea] text-[#5b5346]";

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
      <header className="border-b border-[#ddd3c2] bg-[#fbf8f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#6d6a5f]">
              Ornigami · campaign workflow
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Campaign Lab
              </h1>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#c9bda8] bg-[#efe7d8] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#5b5346]">
                <span className="size-1.5 rounded-full bg-[#9a3f25]" aria-hidden="true" />
                Local only · not published
              </span>
              {catalog.pilot ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#b98237] bg-[#fbf3e4] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a541d]">
                  {catalog.pilot.label} ·{" "}
                  {catalog.pilot.status === "preview" ? "preview inputs" : "confirmed inputs"}
                </span>
              ) : null}
            </div>
          </div>

          <nav aria-label="Campaign fixtures" className="flex flex-wrap items-center gap-2">
            {Object.values(catalog.fixtures).map((item) => {
              const active = item.id === initialFixtureId;
              return (
                <Link
                  key={item.id}
                  href={`/campaign-lab?fixture=${item.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d2a22] focus-visible:ring-offset-2",
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
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:px-8 lg:py-6">
        <aside
          className="rounded-[1.25rem] border border-[#ddd3c2] bg-[#fffdf8] p-4 shadow-[0_20px_60px_-50px_rgba(35,36,32,.55)] lg:sticky lg:top-4"
          aria-labelledby={`${baseId}-campaign-brief-heading`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#ebe3d6] pb-3">
            <div>
              <h2
                id={`${baseId}-campaign-brief-heading`}
                className="text-sm font-semibold tracking-tight"
              >
                Campaign brief
              </h2>
              <p className="mt-1 text-xs text-[#6d6a5f]">{fixture.description}</p>
              {catalog.pilot?.note ? (
                <p className="mt-1 text-xs font-medium text-[#7a541d]">{catalog.pilot.note}</p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-[#efe7d8] px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#5b5346]">
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

              <div className="space-y-1.5">
                <Label htmlFor={fieldIds.format}>Format</Label>
                <select
                  id={fieldIds.format}
                  name="format"
                  className={nativeSelectClassName}
                  value={format}
                  onChange={(event) => handleFormatChange(event.target.value as CampaignFormat)}
                  aria-invalid={issueByField.has("format")}
                  aria-describedby={describedBy("format")}
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
                    aria-invalid={issueByField.has("advertorialLayout")}
                    aria-describedby={describedBy("advertorialLayout")}
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

              {!advertorialFit.fit ? (
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
                  ) : (
                    <p className="mt-1 text-xs">
                      Single-product offer is recommended. The advertorial still needs:
                    </p>
                  )}
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {advertorialFit.missingInputs.slice(0, 6).map((input) => (
                      <li key={input}>{input}</li>
                    ))}
                  </ul>
                  {format === "advertorial" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {advertorialFit.compatibleLayout ? (
                        <Button
                          type="button"
                          className="w-full sm:w-auto"
                          onClick={() => handleUseCompatibleLayout(advertorialFit.compatibleLayout!)}
                        >
                          Use{" "}
                          {ADVERTORIAL_MANIFEST.layouts[advertorialFit.compatibleLayout].label}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        onClick={handleUseOfferTemplate}
                      >
                        Use single-product offer
                      </Button>
                    </div>
                  ) : null}
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

              {format === "advertorial" && advertorialOpenings.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldIds.openingFocus}>Advertorial opening</Label>
                  <select
                    id={fieldIds.openingFocus}
                    name="openingFocus"
                    className={nativeSelectClassName}
                    value={values.openingFocus}
                    onChange={(event) => handleValueChange("openingFocus", event.target.value)}
                    aria-invalid={issueByField.has("openingFocus")}
                    aria-describedby={describedBy("openingFocus")}
                  >
                    {advertorialOpenings.map((opening) => (
                      <option key={opening.id} value={opening.id}>
                        {opening.headline}
                      </option>
                    ))}
                  </select>
                  {issueByField.has("openingFocus") ? (
                    <p id={fieldIds.openingFocus + "-error"} className="text-xs font-medium text-[#a2382a]">
                      {issueByField.get("openingFocus")}
                    </p>
                  ) : null}
                </div>
              ) : fixture.openings ? (
                <div className="space-y-1.5">
                  <Label htmlFor={fieldIds.openingFocus}>Opening focus</Label>
                  <select
                    id={fieldIds.openingFocus}
                    name="openingFocus"
                    className={nativeSelectClassName}
                    value={values.openingFocus}
                    onChange={(event) => handleValueChange("openingFocus", event.target.value)}
                    aria-invalid={issueByField.has("openingFocus")}
                    aria-describedby={describedBy("openingFocus")}
                  >
                    {fixture.openings.map((opening) => (
                      <option key={opening.id} value={opening.id}>{opening.label}</option>
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
                  {heroAssetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
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

              <div className="space-y-1.5">
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
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={fieldIds.accent}>Accent color</Label>
                  <code className="text-xs text-[#6d6a5f]">{values.accent}</code>
                </div>
                <input
                  id={fieldIds.accent}
                  name="accent"
                  type="color"
                  value={values.accent}
                  onChange={(event) => handleValueChange("accent", event.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-[#d8cebd] bg-[#fffdf8] p-1"
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

            {issues.length > 0 ? (
              <div
                ref={errorSummaryRef}
                tabIndex={-1}
                role="group"
                aria-labelledby={errorSummaryHeadingId}
                className="rounded-xl border border-[#c65c45] bg-[#fff1ec] p-3 text-[#6d2b20] outline-none focus-visible:ring-2 focus-visible:ring-[#a2382a] focus-visible:ring-offset-2"
              >
                <p id={errorSummaryHeadingId} className="text-sm font-semibold">
                  Preview not generated
                </p>
                <p className="mt-1 text-xs">
                  The last valid preview is still shown. Fix{" "}
                  {issues.length === 1 ? "this field" : "these fields"}:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {issues.map((issue) => (
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
                Approve preview
              </Button>
            </div>

            <p
              id={formStatusId}
              role="status"
              aria-live="polite"
              className={cn(
                "text-xs font-medium",
                issues.length > 0
                  ? "text-[#a2382a]"
                  : dirty
                    ? "text-[#7a541d]"
                    : "text-[#4f6b55]",
              )}
            >
              {generating
                ? "Generating preview. The last valid preview remains available."
                : issues.length > 0
                  ? `${issues.length} ${issues.length === 1 ? "field needs" : "fields need"} attention.`
                  : dirty
                    ? "Changes not yet validated. Generate preview to validate."
                    : "No validation errors."}
            </p>

            <div className={cn("rounded-xl border p-3", reviewTone)}>
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
                  {approved ? "Approved" : dirty ? "Needs fresh preview" : "Not approved"}
                </span>
              </div>
              <p id={reviewStatusId} className="mt-2 text-sm font-medium">
                {reviewStatusText}
              </p>
              <p className="mt-1 text-xs text-[#6d6a5f]">
                Approval applies to revision {revisionLabel}. Editing any field clears it.
                {approval ? " Recorded locally in this browser session." : ""}
              </p>
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
                    ? generation.providerLabel
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
          className="rounded-[1.25rem] border border-[#d8cebd] bg-[#fffdf8] p-3 shadow-[0_20px_60px_-55px_rgba(35,36,32,.55)] sm:p-4"
          aria-labelledby={previewHeadingId}
          aria-describedby={previewStatusId}
          data-fixture={initialFixtureId}
          data-format={format}
          data-template={preview.draft.templateId}
          data-template-version={preview.draft.templateVersion}
          data-layout={preview.draft.layout}
          data-revision={preview.revision}
          data-asset-id={preview.asset.id}
          data-pilot={catalog.pilot?.id}
          data-preview-status={catalog.pilot?.status}
          data-generation-status={generation.status}
          data-generation-provider={generation.status === "idle" ? "deterministic" : generation.provider}
          data-generation-code={generation.status === "fallback" ? generation.code : undefined}
          data-generation-angle={generation.status === "generated" ? generation.angle : undefined}
          data-section-order={preview.draft.sections.join(",")}
          data-fact-ids={preview.draft.facts.map((fact) => fact.id).join(",")}
          data-story-beat-ids={advertorialPreview?.draft.story.map((beat) => beat.id).join(",")}
          data-disclosure-label={advertorialPreview?.draft.disclosure.label}
          data-advertorial-fit={advertorialFit.fit ? "true" : "false"}
          data-advertorial-compatible-layout={advertorialFit.compatibleLayout}
          data-generation-issues={
            generation.status === "fallback" ? generation.issues?.join(" | ") : undefined
          }
        >
          <div className="flex flex-wrap items-start justify-between gap-3 px-1 pb-3">
            <div>
              <h2 id={previewHeadingId} className="text-sm font-semibold tracking-tight">
                Campaign preview
              </h2>
              <p className="mt-1 text-xs text-[#6d6a5f]">
                {template.name} · v{template.version} · {layout.label}
              </p>
            </div>
            <span
              className="rounded-full border border-[#d4c8b5] bg-[#f8f3ea] px-3 py-1 font-mono text-[0.68rem] text-[#5b5346]"
              title={preview.revision}
              data-approved={approved ? "true" : "false"}
            >
              Revision {revisionLabel}
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

          <div
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
              />
            ) : (
              <CampaignPage
                brief={(preview as CampaignPreviewData).brief}
                draft={(preview as CampaignPreviewData).draft}
                asset={preview.asset}
                theme={preview.theme}
                headingId={pageHeadingId}
                previewLabel={
                  catalog.pilot?.status === "preview"
                    ? "Preview · offer and destination unconfirmed"
                    : undefined
                }
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
