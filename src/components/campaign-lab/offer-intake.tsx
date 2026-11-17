"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BROWSER_OFFER_MAX_FACTS,
  BROWSER_OFFER_MIN_FACTS,
  browserOfferPilotNote,
  buildBrowserOfferCatalog,
  isProvisionalRights,
  provisionalOfferInputs,
  validateBrowserOfferIntake,
  verifyBrowserOffer,
} from "@/lib/campaign-lab/browser-offer";
import type {
  BrowserOfferConfirmations,
  BrowserOfferFactInput,
  BrowserOfferIntakeErrors,
  BrowserOfferIntakeInput,
  BrowserOfferVerification,
} from "@/lib/campaign-lab/browser-offer";
import type {
  CampaignCatalog,
  CampaignFixture,
  CampaignFormValues,
} from "@/lib/campaign-lab/types";

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

type EditorSnapshot = {
  values: CampaignFormValues;
  revision: string | null;
  dirty: boolean;
  rendered: VerificationValues | null;
};

type RenderedVerification = {
  revision: string;
  values: VerificationValues;
  verification: BrowserOfferVerification;
};

const EMPTY_FACT: BrowserOfferFactInput = { label: "", value: "" };

function fieldError(
  errors: BrowserOfferIntakeErrors,
  key: keyof BrowserOfferIntakeErrors,
): string | undefined {
  const error = errors[key];
  return typeof error === "string" ? error : undefined;
}

const VERIFICATION_LABELS = {
  offer: {
    missing: "Offer missing",
    provisional: "Offer provisional",
    confirmed: "Offer entered",
  },
  destination: {
    missing: "Destination missing",
    search: "Amazon/search placeholder · provisional",
    unconfirmed: "Direct URL · unconfirmed",
    invalid: "Destination invalid",
    direct: "Direct URL · confirmed",
  },
  rights: {
    missing: "Media rights missing",
    provisional: "Media rights provisional",
    confirmed: "Media rights recorded",
  },
} as const;

function verificationTone(status: string): string {
  if (status === "missing" || status === "invalid") {
    return "border-[#c65c45] bg-[#fff1ec] text-[#6d2b20]";
  }
  if (
    status === "provisional" ||
    status === "search" ||
    status === "unconfirmed"
  ) {
    return "border-[#b98237] bg-[#fbf3e4] text-[#6b4918]";
  }
  return "border-[#bcd7c2] bg-[#eef5ee] text-[#285a3d]";
}

type VerificationValues = {
  offer: string;
  destination: string;
  rights: string;
};

function VerificationCards({
  verification,
  values,
}: {
  verification: BrowserOfferVerification;
  values: VerificationValues;
}) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      {(
        [
          ["Offer", VERIFICATION_LABELS.offer[verification.offer], verification.offer, values.offer],
          [
            "Destination",
            VERIFICATION_LABELS.destination[verification.destination],
            verification.destination,
            values.destination,
          ],
          [
            "Media",
            VERIFICATION_LABELS.rights[verification.rights],
            verification.rights,
            values.rights,
          ],
        ] as const
      ).map(([label, text, status, value]) => (
        <div
          key={label}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${verificationTone(status)}`}
          data-verification-card={label.toLowerCase()}
          data-verification-label={text}
        >
          <p className="text-[0.62rem] uppercase tracking-[0.12em] opacity-80">{label}</p>
          <p className="mt-1">{text}</p>
          <p className="mt-1 break-words text-[0.66rem] font-normal opacity-85">
            {value || "Not entered"}
          </p>
        </div>
      ))}
    </div>
  );
}

function provisionalNotice(
  verification: BrowserOfferVerification,
): string | undefined {
  const provisional = provisionalOfferInputs(verification);
  return provisional.length > 0
    ? `Preview · ${provisional.join(", ")} provisional`
    : undefined;
}

function VerificationSummary({
  verification,
  values,
  revision = null,
  pending = null,
}: {
  verification: BrowserOfferVerification;
  values: VerificationValues;
  revision?: string | null;
  pending?: {
    verification: BrowserOfferVerification;
    values: VerificationValues;
  } | null;
}) {
  return (
    <div
      className="rounded-xl border border-[#ddd3c2] bg-[#fbf8f1] p-3"
      data-intake-verification
      data-offer-verification={verification.offer}
      data-destination-verification={verification.destination}
      data-rights-verification={verification.rights}
      data-offer-value={values.offer}
      data-destination-value={values.destination}
      data-rights-value={values.rights}
      data-verification-value-source={revision ? "rendered" : "pending"}
      data-verification-revision={revision ?? undefined}
      data-verification-dirty={pending ? "true" : "false"}
      data-verification-pending={pending ? "true" : "false"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Commercial and media check</p>
        <p className="text-[0.68rem] font-medium text-[#6d6a5f]">
          {revision
            ? `Revision ${revision.slice(0, 10)} · rendered values`
            : "Current intake values"}
        </p>
      </div>
      <VerificationCards verification={verification} values={values} />

      {pending ? (
        <div
          className="mt-3 rounded-lg border border-[#b98237] bg-[#fbf3e4] p-3"
          data-intake-pending
          data-pending-offer-verification={pending.verification.offer}
          data-pending-destination-verification={pending.verification.destination}
          data-pending-rights-verification={pending.verification.rights}
          data-pending-offer-value={pending.values.offer}
          data-pending-destination-value={pending.values.destination}
          data-pending-rights-value={pending.values.rights}
        >
          <p className="text-xs font-semibold text-[#6b4918]">
            Pending edits · not rendered
          </p>
          <p className="mt-1 text-[0.68rem] font-medium text-[#6b4918]">
            {revision
              ? `The preview and footer still describe revision ${revision.slice(0, 10)}. Approval is cleared for pending edits. Generate preview to validate these values.`
              : "Generate preview to validate these values."}
          </p>
          <VerificationCards
            verification={pending.verification}
            values={pending.values}
          />
        </div>
      ) : null}
    </div>
  );
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
  const packshotReadRef = useRef(0);
  const submissionCount = useRef(0);

  const [brandName, setBrandName] = useState("");
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
  const [confirmations, setConfirmations] = useState<BrowserOfferConfirmations>({
    offer: null,
    destination: null,
    rights: null,
  });
  const [errors, setErrors] = useState<BrowserOfferIntakeErrors>({});
  const [submitted, setSubmitted] = useState<SubmittedBrief | null>(null);
  const [editorSnapshot, setEditorSnapshot] = useState<EditorSnapshot | null>(null);
  const [renderedVerification, setRenderedVerification] =
    useState<RenderedVerification | null>(null);
  const formValuesRef = useRef({ offer, destinationUrl, rights });
  const renderedVerificationRef = useRef<{
    revision: string | null;
    dirty: boolean;
  }>({ revision: null, dirty: false });

  const productNameId = `${baseId}-product-name`;
  const offerId = `${baseId}-offer`;
  const destinationId = `${baseId}-destination`;
  const factsId = `${baseId}-facts`;
  const packshotId = `${baseId}-packshot`;
  const altId = `${baseId}-alt`;
  const rightsId = `${baseId}-rights`;

  useEffect(() => {
    formValuesRef.current = { offer, destinationUrl, rights };
  }, [destinationUrl, offer, rights]);

  useEffect(() => {
    const snapshot = editorSnapshot;
    if (!snapshot?.revision || !snapshot.rendered) return;

    const previous = renderedVerificationRef.current;
    if (snapshot.dirty) {
      renderedVerificationRef.current = {
        revision: previous.revision,
        dirty: true,
      };
      return;
    }

    const renderedNow =
      previous.revision === null ||
      previous.dirty ||
      snapshot.revision !== previous.revision;
    if (!renderedNow) return;

    const verification = verifyBrowserOffer({
      brandName,
      productName,
      offer: snapshot.rendered.offer,
      destinationUrl: snapshot.rendered.destination,
      facts,
      packshot: packshot
        ? { ...packshot, alt, rights: snapshot.rendered.rights }
        : null,
      reviewedOn: "",
      confirmations,
    });
    renderedVerificationRef.current = {
      revision: snapshot.revision,
      dirty: snapshot.dirty,
    };
    setRenderedVerification({
      revision: snapshot.revision,
      values: snapshot.rendered,
      verification,
    });
  }, [
    alt,
    brandName,
    confirmations,
    editorSnapshot,
    facts,
    packshot,
    productName,
  ]);

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
    const readId = packshotReadRef.current + 1;
    packshotReadRef.current = readId;
    setConfirmations((current) => ({ ...current, rights: null }));
    setPackshotError(null);
    setPackshotName(file?.name ?? null);
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPackshot(null);
    if (!file) {
      setReadingPackshot(false);
      return;
    }
    if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) {
      setPackshotError("Use a PNG, JPEG, or WebP packshot.");
      setReadingPackshot(false);
      return;
    }

    setReadingPackshot(true);
    try {
      const read = await readPackshot(file);
      if (readId !== packshotReadRef.current) {
        URL.revokeObjectURL(read.src);
        return;
      }
      objectUrlRef.current = read.src;
      setPackshot({ ...read, fileName: file.name });
      clearError("packshot");
    } catch {
      if (readId !== packshotReadRef.current) return;
      setPackshotError("The file could not be read as a packshot image.");
    } finally {
      if (readId === packshotReadRef.current) setReadingPackshot(false);
    }
  }

  const handleEditorStateChange = useCallback((snapshot: EditorSnapshot) => {
    setEditorSnapshot(snapshot);
    const previous = formValuesRef.current;
    if (snapshot.values.offer !== previous.offer) {
      setConfirmations((current) => ({ ...current, offer: null }));
    }
    if (snapshot.values.destinationUrl !== previous.destinationUrl) {
      setConfirmations((current) => ({ ...current, destination: null }));
    }
    formValuesRef.current = {
      offer: snapshot.values.offer,
      destinationUrl: snapshot.values.destinationUrl,
      rights: previous.rights,
    };
    setProductName(snapshot.values.productName);
    setOffer(snapshot.values.offer);
    setDestinationUrl(snapshot.values.destinationUrl);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingPackshot || packshotError) return;

    const input: BrowserOfferIntakeInput = {
      brandName,
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
      confirmations,
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
    renderedVerificationRef.current = { revision: null, dirty: false };
    setRenderedVerification(null);
    setEditorSnapshot(null);
    window.scrollTo({ top: 0 });
  }

  const rightsProvisional = isProvisionalRights(rights);
  const formVerification = verifyBrowserOffer({
    brandName,
    productName,
    offer,
    destinationUrl,
    facts,
    packshot: packshot ? { ...packshot, alt, rights } : null,
    reviewedOn: "",
    confirmations,
  });
  const renderedNotice = renderedVerification
    ? provisionalNotice(renderedVerification.verification)
    : undefined;
  const renderedStatus = renderedVerification
    ? renderedVerification.verification.provisional
      ? "preview"
      : "confirmed"
    : undefined;
  const renderedNote = renderedVerification
    ? browserOfferPilotNote(renderedVerification.verification)
    : undefined;
  const renderedValues = renderedVerification?.values ?? {
    offer,
    destination: destinationUrl,
    rights,
  };
  const pendingEdits =
    editorSnapshot?.dirty && renderedVerification
      ? {
          verification: formVerification,
          values: { offer, destination: destinationUrl, rights },
        }
      : null;

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
        <div className="border-b border-[#ddd3c2] bg-[#fbf8f1]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-[#5f5a4f]">
              Local session · refreshing clears this brief and local approval.
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
        <div className="mx-auto max-w-[1600px] px-4 pt-3 sm:px-6 lg:px-8">
          <VerificationSummary
            verification={renderedVerification?.verification ?? formVerification}
            values={renderedValues}
            revision={renderedVerification?.revision ?? null}
            pending={pendingEdits}
          />
        </div>
        <CampaignLab
          key={submitted.key}
          initialFixtureId={submitted.fixture.id}
          catalog={submitted.catalog}
          showFixtureNav={false}
          localOnly
          previewNotice={renderedNotice}
          previewStatus={renderedStatus}
          previewNote={renderedNote}
          onEditorStateChange={handleEditorStateChange}
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
              <Label htmlFor={`${baseId}-brand-name`}>Brand name</Label>
              <Input
                id={`${baseId}-brand-name`}
                value={brandName}
                onChange={(event) => setBrandName(event.target.value)}
                autoComplete="organization"
                placeholder="Optional — neutral preview if blank"
              />
            </div>
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
                  setConfirmations((current) => ({ ...current, offer: null }));
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
              <p className="text-xs text-[#6d6a5f]">
                Automatic headlines only shorten a simple discount, optionally dated. Any
                other terms keep the product name, and the exact offer stays beside the CTA.
              </p>
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
                  setConfirmations((current) => ({
                    ...current,
                    destination: null,
                  }));
                  clearError("destinationUrl");
                }}
                autoComplete="url"
                spellCheck={false}
                required
                aria-invalid={Boolean(fieldError(errors, "destinationUrl"))}
                aria-describedby={[
                  fieldError(errors, "destinationUrl")
                    ? `${destinationId}-error`
                    : null,
                  `${destinationId}-hint`,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              {fieldError(errors, "destinationUrl") ? (
                <p id={`${destinationId}-error`} className="text-xs font-medium text-[#a2382a]">
                  {fieldError(errors, "destinationUrl")}
                </p>
              ) : null}
              <p id={`${destinationId}-hint`} className="text-xs text-[#6d6a5f]">
                A direct URL stays unconfirmed until you check the exact destination.
                Amazon search and placeholder URLs stay provisional after confirmation.
              </p>
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
                  setConfirmations((current) => ({ ...current, rights: null }));
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

          <fieldset
            className="m-0 space-y-3 rounded-xl border border-[#ebe3d6] bg-[#f8f3ea] p-3"
            data-confirmations
            data-offer-confirmed={formVerification.offer === "confirmed" ? "true" : "false"}
            data-destination-confirmed={
              formVerification.destination === "direct" ? "true" : "false"
            }
            data-rights-confirmed={formVerification.rights === "confirmed" ? "true" : "false"}
          >
            <legend className="text-sm font-semibold">Operator confirmations</legend>
            <label className="flex items-start gap-2 text-xs text-[#4f4a3f]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[#234a6b]"
                checked={Boolean(offer.trim()) && confirmations.offer === offer.trim()}
                disabled={!offer.trim()}
                onChange={(event) =>
                  setConfirmations((current) => ({
                    ...current,
                    offer: event.target.checked ? offer.trim() : null,
                  }))
                }
              />
              <span>
                I confirm these exact offer terms:
                <strong className="ml-1 break-words font-semibold">
                  {offer.trim() || "not entered"}
                </strong>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[#4f4a3f]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[#234a6b]"
                checked={
                  Boolean(destinationUrl.trim()) &&
                  confirmations.destination === destinationUrl.trim()
                }
                disabled={!destinationUrl.trim()}
                onChange={(event) =>
                  setConfirmations((current) => ({
                    ...current,
                    destination: event.target.checked
                      ? destinationUrl.trim()
                      : null,
                  }))
                }
              />
              <span>
                I confirm this exact destination:
                <strong className="ml-1 break-words font-semibold">
                  {destinationUrl.trim() || "not entered"}
                </strong>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[#4f4a3f]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[#234a6b]"
                checked={Boolean(rights.trim()) && confirmations.rights === rights.trim()}
                disabled={!rights.trim()}
                onChange={(event) =>
                  setConfirmations((current) => ({
                    ...current,
                    rights: event.target.checked ? rights.trim() : null,
                  }))
                }
              />
              <span>
                I confirm these media rights:
                <strong className="ml-1 break-words font-semibold">
                  {rights.trim() || "not entered"}
                </strong>
              </span>
            </label>
          </fieldset>

          <VerificationSummary
            verification={formVerification}
            values={{ offer, destination: destinationUrl, rights }}
          />

          <div className="flex flex-col gap-3 border-t border-[#ebe3d6] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6d6a5f]">
              Local session only. Refreshing clears this brief and any local approval.
            </p>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={readingPackshot || Boolean(packshotError)}
            >
              {readingPackshot ? "Reading packshot…" : "Open Campaign Lab preview"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
