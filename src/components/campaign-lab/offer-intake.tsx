"use client";

import { BrandEvidenceReview } from "./brand-evidence-review";
import type { BrandKitSnapshot } from "@/lib/campaign-lab/brand-review";
import Link from "next/link";
import { VISUAL_DIRECTIONS } from "@/lib/campaign-lab/visual-directions";
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
import { browserOfferBriefFromIntake } from "@/lib/campaign-lab/browser-offer-brief";
import {
  hasPersistedBriefContent,
  OFFER_INTAKE_BRIEF_STORAGE_KEY,
  parsePersistedOfferIntakeBrief,
  parsePreparedOfferIntakeBrief,
  serializePersistedOfferIntakeBrief,
} from "@/lib/campaign-lab/offer-intake-brief";
import {
  PackshotReadError,
  readPackshotFile,
} from "@/lib/campaign-lab/packshot";
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
  file: File;
};

type SubmittedBrief = {
  key: number;
  fixture: CampaignFixture;
  catalog: CampaignCatalog;
  input: BrowserOfferIntakeInput;
  assetSrc: string;
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

export function OfferIntake() {
  const baseId = useId().replace(/:/g, "");
  const objectUrlRef = useRef<string | null>(null);
  const packshotReadRef = useRef(0);
  const preparedBriefReadRef = useRef(0);
  const mountedRef = useRef(true);
  const submissionCount = useRef(0);

  const [briefHydrated, setBriefHydrated] = useState(false);
  const [restoredBrief, setRestoredBrief] = useState(false);
  const [evidenceSession, setEvidenceSession] = useState(0);
  const [brandKitSnapshot, setBrandKitSnapshot] = useState<BrandKitSnapshot>();
  const [directionId, setDirectionId] = useState("clear");
  const [accentOverride, setAccentOverride] = useState("");
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [audience, setAudience] = useState("");
  const [objective, setObjective] = useState("");
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
  const [readingPreparedBrief, setReadingPreparedBrief] = useState(false);
  const [preparedBriefNotice, setPreparedBriefNotice] = useState<string | null>(
    null,
  );
  const [preparedBriefError, setPreparedBriefError] = useState<string | null>(
    null,
  );
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
  const audienceId = `${baseId}-audience`;
  const objectiveId = `${baseId}-objective`;
  const offerId = `${baseId}-offer`;
  const destinationId = `${baseId}-destination`;
  const factsId = `${baseId}-facts`;
  const packshotId = `${baseId}-packshot`;
  const altId = `${baseId}-alt`;
  const rightsId = `${baseId}-rights`;
  const preparedBriefId = `${baseId}-prepared-brief`;

  useEffect(() => {
    formValuesRef.current = { offer, destinationUrl, rights };
  }, [destinationUrl, offer, rights]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let raw: string | null = null;
      try {
        raw = window.sessionStorage.getItem(OFFER_INTAKE_BRIEF_STORAGE_KEY);
      } catch {
        // Storage can be unavailable; the intake still works without recovery.
      }
      const brief = parsePersistedOfferIntakeBrief(raw);
      if (brief) {
        setBrandKitSnapshot(brief.brandKitSnapshot);
        setDirectionId(brief.directionId ?? "clear");
        setAccentOverride(brief.accent ?? "");
        setBrandName(brief.brandName);
        setProductName(brief.productName);
        setAudience(brief.audience);
        setObjective(brief.objective);
        setOffer(brief.offer);
        setDestinationUrl(brief.destinationUrl);
        setFacts(brief.facts);
        setAlt(brief.alt);
        setRights(brief.rights);
        setRestoredBrief(hasPersistedBriefContent(brief));
      }
      setBriefHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!briefHydrated) return;
    try {
      window.sessionStorage.setItem(
        OFFER_INTAKE_BRIEF_STORAGE_KEY,
        serializePersistedOfferIntakeBrief({
          directionId,
          brandKitSnapshot,
          accent: accentOverride,
          brandName,
          productName,
          audience,
          objective,
          offer,
          destinationUrl,
          facts,
          alt,
          rights,
        }),
      );
    } catch {
      // A full or blocked storage area must not block the intake.
    }
  }, [
    directionId, accentOverride, brandKitSnapshot,
    alt,
    audience,
    brandName,
    destinationUrl,
    facts,
    objective,
    offer,
    productName,
    briefHydrated,
    rights,
  ]);

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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      packshotReadRef.current += 1;
      preparedBriefReadRef.current += 1;
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

  async function handlePreparedBriefChange(file: File | null) {
    if (!file) return;

    const readId = preparedBriefReadRef.current + 1;
    preparedBriefReadRef.current = readId;
    setReadingPreparedBrief(true);
    setPreparedBriefNotice(null);
    setPreparedBriefError(null);

    let raw: string;
    try {
      raw = await file.text();
    } catch {
      if (readId !== preparedBriefReadRef.current || !mountedRef.current) return;
      setPreparedBriefError("The prepared brief could not be read.");
      setReadingPreparedBrief(false);
      return;
    }
    if (readId !== preparedBriefReadRef.current || !mountedRef.current) return;

    const parsed = parsePreparedOfferIntakeBrief(raw);
    if (!parsed.ok) {
      setPreparedBriefNotice(null);
      setPreparedBriefError(parsed.error);
      setReadingPreparedBrief(false);
      return;
    }

    const brief = parsed.brief;
    setEvidenceSession(current => current + 1);
    setBrandKitSnapshot(brief.brandKitSnapshot);
        setDirectionId(brief.directionId ?? "clear");
        setAccentOverride(brief.accent ?? "");
        setBrandName(brief.brandName);
    setProductName(brief.productName);
    setAudience(brief.audience);
    setObjective(brief.objective);
    setOffer(brief.offer);
    setDestinationUrl(brief.destinationUrl);
    setFacts(brief.facts.map((fact) => ({ ...fact })));
    setAlt(brief.alt);
    setRights(brief.rights);
    setConfirmations({ offer: null, destination: null, rights: null });
    setErrors({});
    setRestoredBrief(false);
    setPreparedBriefError(null);
    setPreparedBriefNotice(
      "Prepared brief loaded. Review every field, select the packshot, and confirm the exact inputs below.",
    );
    handlePackshotChange(null);
    setReadingPreparedBrief(false);
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
      const read = await readPackshotFile(file);
      if (readId !== packshotReadRef.current || !mountedRef.current) {
        URL.revokeObjectURL(read.src);
        return;
      }
      objectUrlRef.current = read.src;
      setPackshot({ ...read, fileName: file.name, file });
      clearError("packshot");
    } catch (error) {
      if (readId !== packshotReadRef.current || !mountedRef.current) return;
      setPackshotError(
        error instanceof PackshotReadError
          ? error.message
          : "The file could not be read as a packshot image. Choose another PNG, JPEG, or WebP.",
      );
    } finally {
      if (readId === packshotReadRef.current && mountedRef.current) {
        setReadingPackshot(false);
      }
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
    setBrandKitSnapshot(snapshot.values.brandKitSnapshot);
    setDirectionId(snapshot.values.directionId ?? "clear");
    setAccentOverride(snapshot.values.accentOverride ?? "");
    setProductName(snapshot.values.productName);
    setAudience(snapshot.values.audience ?? "");
    setObjective(snapshot.values.objective ?? "");
    setOffer(snapshot.values.offer);
    setDestinationUrl(snapshot.values.destinationUrl);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readingPreparedBrief || readingPackshot || packshotError) return;

    const input: BrowserOfferIntakeInput = {
      brandKitSnapshot,
      directionId,
      ...(accentOverride ? { accent: accentOverride } : {}),
      brandName,
      productName,
      audience,
      objective,
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
      input,
      assetSrc: input.packshot?.src ?? built.catalog.assets[0]?.src ?? "",
    });
    setRestoredBrief(false);
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
      <div data-intake-ready={briefHydrated ? "true" : "false"} className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
        <div className="border-b border-[#ddd3c2] bg-[#fbf8f1]">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-[#5f5a4f]">
              Local session · text fields are restored after refresh; the packshot and local approval are not.
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
          browserBrief={(nextValues) =>
            browserOfferBriefFromIntake({
              ...submitted.input,
              directionId: nextValues.directionId,
              brandKitSnapshot: nextValues.brandKitSnapshot,
              productName: nextValues.productName,
              audience: nextValues.audience,
              objective: nextValues.objective,
              offer: nextValues.offer,
              destinationUrl: nextValues.destinationUrl,
              confirmations,
            }, {
              accent: nextValues.accentOverride,
            })
          }
          browserAssetSrc={submitted.assetSrc}
          previewNotice={renderedNotice}
          previewStatus={renderedStatus}
          previewNote={renderedNote}
          exportVerification={renderedVerification?.verification ?? null}
          exportPackshotBlob={packshot?.file ?? null}
          onEditorStateChange={handleEditorStateChange}
        />
      </div>
    );
  }

  return (
    <div data-intake-ready={briefHydrated ? "true" : "false"} className="min-h-screen bg-[#f5f1e8] text-[#1d2a22]">
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
        <BrandEvidenceReview key={evidenceSession} snapshot={brandKitSnapshot} directionId={directionId} accentOverride={accentOverride} onApply={setBrandKitSnapshot} />
        <fieldset className="mb-5 grid gap-3 sm:grid-cols-2"><legend className="mb-2 font-semibold">Visual direction</legend>
          {VISUAL_DIRECTIONS.map(direction => <label key={direction.id} className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-[#c9bda8] bg-[#fbf8f1] p-3">
            <input type="radio" name="visualDirection" value={direction.id} checked={directionId === direction.id} onChange={() => setDirectionId(direction.id)} />
            <span><span className="block text-lg" style={{fontFamily:direction.tokens.displayFont}}>{direction.name}</span><span className="text-sm">{direction.description}</span></span>
          </label>)}
        </fieldset>
        <div className="mb-5 space-y-1"><Label htmlFor="intake-accent-override">Accent override (hex)</Label><Input className="min-h-11" id="intake-accent-override" value={accentOverride} placeholder="Optional — use direction default" onChange={event => { setAccentOverride(event.target.value); clearError("accent"); }} />{errors.accent ? <p role="alert">{errors.accent}</p> : null}</div>
        {restoredBrief ? (
          <div
            role="status"
            data-restored-brief="true"
            className="mb-4 rounded-xl border border-[#b98237] bg-[#fbf3e4] p-3 text-sm text-[#6b4918]"
          >
            <p className="font-semibold">Brief restored after refresh.</p>
            <p className="mt-1 text-xs">
              {packshot
                ? "Packshot reselected. Review the newly rendered revision and record a fresh local approval."
                : "Reselect the packshot to continue. The previous packshot and local approval were not restored."}
            </p>
          </div>
        ) : null}
        <form
          method="post"
          noValidate
          onSubmit={handleSubmit}
          data-restored-brief={restoredBrief ? "true" : "false"}
          className="space-y-5 rounded-[1.25rem] border border-[#ddd3c2] bg-[#fffdf8] p-4 shadow-[0_20px_60px_-50px_rgba(35,36,32,.55)] sm:p-6"
        >
          <fieldset
            className="m-0 space-y-3 border-0 border-b border-[#e8dfd0] p-0 pb-4"
            data-prepared-brief-status={
              readingPreparedBrief
                ? "reading"
                : preparedBriefError
                  ? "error"
                  : preparedBriefNotice
                    ? "loaded"
                    : "idle"
            }
            aria-busy={readingPreparedBrief}
          >
            <legend className="mb-2 text-base font-semibold">Prepared brief</legend>
            <p className="text-xs text-[#6d6a5f]">
              Load a local JSON brief, review the populated fields, then select the
              packshot and confirm the exact inputs below.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor={preparedBriefId}>Prepared brief JSON</Label>
              <Input
                id={preparedBriefId}
                type="file"
                accept="application/json,.json"
                data-prepared-brief-input
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0] ?? null;
                  input.value = "";
                  void handlePreparedBriefChange(file);
                }}
                aria-invalid={Boolean(preparedBriefError)}
                aria-describedby={
                  readingPreparedBrief
                    ? `${preparedBriefId}-reading`
                    : preparedBriefError
                      ? `${preparedBriefId}-error`
                      : preparedBriefNotice
                        ? `${preparedBriefId}-notice`
                        : undefined
                }
              />
              {readingPreparedBrief ? (
                <p
                  id={`${preparedBriefId}-reading`}
                  className="text-xs text-[#6d6a5f]"
                  role="status"
                  data-prepared-brief-reading
                >
                  Reading prepared brief…
                </p>
              ) : preparedBriefError ? (
                <p
                  id={`${preparedBriefId}-error`}
                  className="text-xs font-medium text-[#a2382a]"
                  role="alert"
                  data-prepared-brief-error
                >
                  {preparedBriefError}
                </p>
              ) : preparedBriefNotice ? (
                <p
                  id={`${preparedBriefId}-notice`}
                  className="text-xs font-medium text-[#4f6b55]"
                  role="status"
                  data-prepared-brief-notice
                >
                  {preparedBriefNotice}
                </p>
              ) : null}
            </div>
          </fieldset>

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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={audienceId}>Audience</Label>
                <Input
                  id={audienceId}
                  value={audience}
                  onChange={(event) => {
                    setAudience(event.target.value);
                    clearError("audience");
                  }}
                  autoComplete="off"
                  placeholder="Who is this campaign for?"
                  aria-invalid={Boolean(fieldError(errors, "audience"))}
                  aria-describedby={
                    fieldError(errors, "audience")
                      ? `${audienceId}-error`
                      : undefined
                  }
                />
                {fieldError(errors, "audience") ? (
                  <p id={`${audienceId}-error`} className="text-xs font-medium text-[#a2382a]">
                    {fieldError(errors, "audience")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={objectiveId}>Campaign objective</Label>
                <Input
                  id={objectiveId}
                  value={objective}
                  onChange={(event) => {
                    setObjective(event.target.value);
                    clearError("objective");
                  }}
                  autoComplete="off"
                  placeholder="What should the page achieve?"
                  aria-invalid={Boolean(fieldError(errors, "objective"))}
                  aria-describedby={
                    fieldError(errors, "objective")
                      ? `${objectiveId}-error`
                      : undefined
                  }
                />
                {fieldError(errors, "objective") ? (
                  <p id={`${objectiveId}-error`} className="text-xs font-medium text-[#a2382a]">
                    {fieldError(errors, "objective")}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-[#6d6a5f]">
              Optional. Used to choose the page opening; never rendered.
            </p>

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

          <fieldset
            className="m-0 space-y-4 border-0 p-0"
            data-packshot-status={
              readingPackshot
                ? "reading"
                : packshotError
                  ? "error"
                  : packshot
                    ? "ready"
                    : "empty"
            }
          >
            <legend className="mb-2 text-base font-semibold">Packshot</legend>
            <div className="space-y-1.5">
              <Label htmlFor={packshotId}>Product image</Label>
              <Input
                id={packshotId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                data-packshot-input
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0] ?? null;
                  // Clear the picker value so selecting the same file again still
                  // emits a change event and retries the read.
                  input.value = "";
                  void handlePackshotChange(file);
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
                <p
                  id={`${packshotId}-error`}
                  className="text-xs font-medium text-[#a2382a]"
                  data-packshot-error
                  role="alert"
                >
                  {packshotError ?? fieldError(errors, "packshot")}
                </p>
              ) : readingPackshot ? (
                <p className="text-xs text-[#6d6a5f]" data-packshot-reading>
                  Reading packshot…
                </p>
              ) : packshot ? (
                <p
                  className="text-xs text-[#4f6b55]"
                  data-packshot-ready
                  data-packshot-file={packshotName ?? ""}
                  data-packshot-width={packshot.width}
                  data-packshot-height={packshot.height}
                  data-packshot-hash={packshot.contentHash}
                >
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
              Local session only. Text fields are restored after refresh; the packshot and local approval are not.
            </p>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={
                readingPreparedBrief ||
                readingPackshot ||
                Boolean(packshotError)
              }
            >
              {readingPreparedBrief
                ? "Reading prepared brief…"
                : readingPackshot
                  ? "Reading packshot…"
                  : "Open Campaign Lab preview"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
