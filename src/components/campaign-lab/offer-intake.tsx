"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BROWSER_OFFER_MAX_FACTS,
  BROWSER_OFFER_MIN_FACTS,
  buildBrowserOfferCatalog,
  isProvisionalRights,
  validateBrowserOfferIntake,
} from "@/lib/campaign-lab/browser-offer";
import type {
  BrowserOfferFactInput,
  BrowserOfferIntakeErrors,
  BrowserOfferIntakeInput,
} from "@/lib/campaign-lab/browser-offer";
import type { CampaignCatalog, CampaignFixture } from "@/lib/campaign-lab/types";

import { CampaignLab } from "./campaign-lab";

type PackshotFile = {
  src: string;
  width: number;
  height: number;
  contentHash: string;
  fileName: string;
};

type SubmittedBrief = {
  key: number;
  fixture: CampaignFixture;
  catalog: CampaignCatalog;
};

const EMPTY_FACT: BrowserOfferFactInput = { label: "", value: "" };

function fieldError(
  errors: BrowserOfferIntakeErrors,
  key: keyof BrowserOfferIntakeErrors,
): string | undefined {
  const error = errors[key];
  return typeof error === "string" ? error : undefined;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readPackshot(file: File): Promise<Omit<PackshotFile, "fileName">> {
  const src = URL.createObjectURL(file);
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
      throw new Error("The image has no dimensions.");
    }
    return {
      src,
      width: image.naturalWidth,
      height: image.naturalHeight,
      contentHash: await sha256(file),
    };
  } catch (error) {
    URL.revokeObjectURL(src);
    throw error;
  }
}

export function OfferIntake() {
  const baseId = useId().replace(/:/g, "");
  const objectUrlRef = useRef<string | null>(null);
  const submissionCount = useRef(0);

  const [productName, setProductName] = useState("");
  const [offer, setOffer] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [facts, setFacts] = useState<BrowserOfferFactInput[]>([
    { ...EMPTY_FACT },
    { ...EMPTY_FACT },
  ]);
  const [packshot, setPackshot] = useState<PackshotFile | null>(null);
  const [packshotName, setPackshotName] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [rights, setRights] = useState("");
  const [readingPackshot, setReadingPackshot] = useState(false);
  const [packshotError, setPackshotError] = useState<string | null>(null);
  const [errors, setErrors] = useState<BrowserOfferIntakeErrors>({});
  const [submitted, setSubmitted] = useState<SubmittedBrief | null>(null);

  const productNameId = `${baseId}-product-name`;
  const offerId = `${baseId}-offer`;
  const destinationId = `${baseId}-destination`;
  const factsId = `${baseId}-facts`;
  const packshotId = `${baseId}-packshot`;
  const altId = `${baseId}-alt`;
  const rightsId = `${baseId}-rights`;

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function clearError(key: keyof BrowserOfferIntakeErrors) {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function changeFact(index: number, field: keyof BrowserOfferFactInput, value: string) {
    setFacts((current) =>
      current.map((fact, factIndex) =>
        factIndex === index ? { ...fact, [field]: value } : fact,
      ),
    );
    setErrors((current) => {
      if (!current.factRows?.[index]) return current;
      const rows = { ...current.factRows };
      const row = { ...rows[index] };
      delete row[field];
      if (Object.keys(row).length > 0) rows[index] = row;
      else delete rows[index];
      return {
        ...current,
        factRows: Object.keys(rows).length > 0 ? rows : undefined,
        ...(current.facts ? { facts: undefined } : {}),
      };
    });
  }

  function addFact() {
    if (facts.length >= BROWSER_OFFER_MAX_FACTS) return;
    setFacts((current) => [...current, { ...EMPTY_FACT }]);
  }

  function removeFact(index: number) {
    if (facts.length <= BROWSER_OFFER_MIN_FACTS) return;
    setFacts((current) => current.filter((_, factIndex) => factIndex !== index));
    setErrors((current) => ({ ...current, facts: undefined, factRows: undefined }));
  }

  async function handlePackshotChange(file: File | null) {
    setPackshotError(null);
    setPackshotName(file?.name ?? null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPackshot(null);
    if (!file) return;
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      setPackshotError("Use a PNG, JPEG, or WebP packshot.");
      return;
    }

    setReadingPackshot(true);
    try {
      const read = await readPackshot(file);
      objectUrlRef.current = read.src;
      setPackshot({ ...read, fileName: file.name });
      clearError("packshot");
    } catch {
      setPackshotError("The file could not be read as a packshot image.");
    } finally {
      setReadingPackshot(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingPackshot) return;

    const input: BrowserOfferIntakeInput = {
      productName,
      offer,
      destinationUrl,
      facts,
      packshot: packshot
        ? {
            ...packshot,
            alt,
            rights,
          }
        : null,
      reviewedOn: new Date().toISOString().slice(0, 10),
    };
    const validation = validateBrowserOfferIntake(input);
    if (!validation.valid) {
      setErrors(validation.errors);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setErrors({});
    submissionCount.current += 1;
    const built = buildBrowserOfferCatalog(input);
    setSubmitted({
      key: submissionCount.current,
      fixture: built.fixture,
      catalog: built.catalog,
    });
    window.scrollTo({ top: 0 });
  }

  const rightsProvisional = isProvisionalRights(rights);

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
        <div className="border-b border-[#ddd3c2] bg-[#fbf8f1]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-[#5f5a4f]">
              Local brief · {submitted.fixture.label}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSubmitted(null)}
            >
              Edit brief inputs
            </Button>
          </div>
        </div>
        <CampaignLab
          key={submitted.key}
          initialFixtureId={submitted.fixture.id}
          catalog={submitted.catalog}
          showFixtureNav={false}
          localOnly
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
      <header className="border-b border-[#ddd3c2] bg-[#fbf8f1]">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <Link
            href="/campaign-lab"
            className="text-xs font-semibold text-[#5f5a4f] underline decoration-[#b8aa93] underline-offset-4 hover:text-[#1d2a22]"
          >
            Campaign Lab
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Offer intake
            </h1>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#c9bda8] bg-[#efe7d8] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#5b5346]">
              <span className="size-1.5 rounded-full bg-[#9a3f25]" aria-hidden="true" />
              Local only · not published
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <form
          method="post"
          noValidate
          onSubmit={handleSubmit}
          className="space-y-5 rounded-[1.25rem] border border-[#ddd3c2] bg-[#fffdf8] p-4 shadow-[0_20px_60px_-50px_rgba(35,36,32,.55)] sm:p-6"
        >
          <fieldset className="m-0 space-y-4 border-0 p-0">
            <legend className="mb-2 text-base font-semibold">Product and offer</legend>
            <div className="space-y-1.5">
              <Label htmlFor={productNameId}>Product name</Label>
              <Input
                id={productNameId}
                value={productName}
                onChange={(event) => {
                  setProductName(event.target.value);
                  clearError("productName");
                }}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldError(errors, "productName"))}
                aria-describedby={
                  fieldError(errors, "productName") ? `${productNameId}-error` : undefined
                }
              />
              {fieldError(errors, "productName") ? (
                <p id={`${productNameId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "productName")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={offerId}>Offer</Label>
              <Input
                id={offerId}
                value={offer}
                onChange={(event) => {
                  setOffer(event.target.value);
                  clearError("offer");
                }}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldError(errors, "offer"))}
                aria-describedby={fieldError(errors, "offer") ? `${offerId}-error` : undefined}
              />
              {fieldError(errors, "offer") ? (
                <p id={`${offerId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "offer")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={destinationId}>Destination URL</Label>
              <Input
                id={destinationId}
                type="url"
                inputMode="url"
                value={destinationUrl}
                onChange={(event) => {
                  setDestinationUrl(event.target.value);
                  clearError("destinationUrl");
                }}
                autoComplete="url"
                spellCheck={false}
                required
                aria-invalid={Boolean(fieldError(errors, "destinationUrl"))}
                aria-describedby={
                  fieldError(errors, "destinationUrl")
                    ? `${destinationId}-error`
                    : undefined
                }
              />
              {fieldError(errors, "destinationUrl") ? (
                <p id={`${destinationId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "destinationUrl")}
                </p>
              ) : null}
            </div>
          </fieldset>

          <fieldset
            className="m-0 space-y-3 border-0 p-0"
            aria-describedby={fieldError(errors, "facts") ? factsId : undefined}
          >
            <legend className="text-base font-semibold">Approved facts</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[#6d6a5f]">
                The offer page shows {BROWSER_OFFER_MIN_FACTS}–{BROWSER_OFFER_MAX_FACTS}.
                All entered facts stay together.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addFact}
                disabled={facts.length >= BROWSER_OFFER_MAX_FACTS}
              >
                Add fact
              </Button>
            </div>
            {fieldError(errors, "facts") ? (
              <p id={factsId} className="text-xs font-medium text-[#a2382a]">
                {fieldError(errors, "facts")}
              </p>
            ) : null}
            <div className="space-y-3">
              {facts.map((fact, index) => {
                const rowErrors = errors.factRows?.[index];
                return (
                  <div
                    key={index}
                    className="grid gap-2 rounded-xl border border-[#ebe3d6] bg-[#f8f3ea] p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] sm:items-end"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`${factsId}-${index}-label`}>Label</Label>
                      <Input
                        id={`${factsId}-${index}-label`}
                        value={fact.label}
                        onChange={(event) =>
                          changeFact(index, "label", event.target.value)
                        }
                        autoComplete="off"
                        required
                        aria-invalid={Boolean(rowErrors?.label)}
                        aria-describedby={
                          rowErrors?.label ? `${factsId}-${index}-label-error` : undefined
                        }
                      />
                      {rowErrors?.label ? (
                        <p
                          id={`${factsId}-${index}-label-error`}
                          className="text-xs font-medium text-[#a2382a]"
                        >
                          {rowErrors.label}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${factsId}-${index}-value`}>Approved value</Label>
                      <Input
                        id={`${factsId}-${index}-value`}
                        value={fact.value}
                        onChange={(event) =>
                          changeFact(index, "value", event.target.value)
                        }
                        autoComplete="off"
                        required
                        aria-invalid={Boolean(rowErrors?.value)}
                        aria-describedby={
                          rowErrors?.value ? `${factsId}-${index}-value-error` : undefined
                        }
                      />
                      {rowErrors?.value ? (
                        <p
                          id={`${factsId}-${index}-value-error`}
                          className="text-xs font-medium text-[#a2382a]"
                        >
                          {rowErrors.value}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-self-start text-[#6d2b20] sm:justify-self-end"
                      onClick={() => removeFact(index)}
                      disabled={facts.length <= BROWSER_OFFER_MIN_FACTS}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="m-0 space-y-4 border-0 p-0">
            <legend className="mb-2 text-base font-semibold">Packshot</legend>
            <div className="space-y-1.5">
              <Label htmlFor={packshotId}>Product image</Label>
              <Input
                id={packshotId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void handlePackshotChange(event.target.files?.[0] ?? null);
                }}
                required
                aria-invalid={Boolean(packshotError || fieldError(errors, "packshot"))}
                aria-describedby={
                  packshotError || fieldError(errors, "packshot")
                    ? `${packshotId}-error`
                    : undefined
                }
              />
              {packshotError || fieldError(errors, "packshot") ? (
                <p id={`${packshotId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {packshotError ?? fieldError(errors, "packshot")}
                </p>
              ) : readingPackshot ? (
                <p className="text-xs text-[#6d6a5f]">Reading packshot…</p>
              ) : packshot ? (
                <p className="text-xs text-[#4f6b55]">
                  {packshotName} · {packshot.width} × {packshot.height} · SHA-256 recorded
                </p>
              ) : (
                <p className="text-xs text-[#6d6a5f]">PNG, JPEG, or WebP.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={altId}>Alt text</Label>
              <Input
                id={altId}
                value={alt}
                onChange={(event) => {
                  setAlt(event.target.value);
                  clearError("alt");
                }}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldError(errors, "alt"))}
                aria-describedby={fieldError(errors, "alt") ? `${altId}-error` : undefined}
              />
              {fieldError(errors, "alt") ? (
                <p id={`${altId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "alt")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={rightsId}>Usage rights</Label>
              <Input
                id={rightsId}
                value={rights}
                onChange={(event) => {
                  setRights(event.target.value);
                  clearError("rights");
                }}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldError(errors, "rights"))}
                aria-describedby={fieldError(errors, "rights") ? `${rightsId}-error` : undefined}
              />
              {fieldError(errors, "rights") ? (
                <p id={`${rightsId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "rights")}
                </p>
              ) : rightsProvisional ? (
                <p className="text-xs font-medium text-[#7a541d]">
                  This reads as provisional. Confirm media rights before publication.
                </p>
              ) : null}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-[#ebe3d6] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6d6a5f]">
              The existing brief validation, renderer, and revision approval run next.
            </p>
            <Button type="submit" className="w-full sm:w-auto" disabled={readingPackshot}>
              {readingPackshot ? "Reading packshot…" : "Open Campaign Lab preview"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
