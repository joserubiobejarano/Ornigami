import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  onboardingLanguages,
  onboardingBusinessTypes,
  onboardingPricingModes,
  onboardingTones,
  websitePlatforms,
  type OnboardingLanguage,
  type OnboardingBusinessType,
  type OnboardingPricingMode,
  type OnboardingTone,
  type WebsitePlatform,
} from "@/lib/onboarding";
import { db } from "@/server/db/client";
import {
  businessPromptSettings,
  businesses,
  onboardingRequests,
  type OnboardingRequest,
} from "@/server/db/schema";
import { normalizePhone } from "@/server/lib/phone";
import { normalizeStringList, normalizeText } from "@/server/validators/onboarding";
import { safeLogger } from "@/lib/safe-logger";

const businessSlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionalEmailSchema = z.email();
const optionalUrlSchema = z.url();
const optionalPhoneRegex = /^\+?[0-9()\-\s.]{7,40}$/;

export type ServicePricingEntry = {
  service: string;
  price: string;
  mode: "exact" | "starting_at";
};

export type OnboardingReviewDraft = {
  businessName: string;
  slug: string;
  businessType: OnboardingBusinessType;
  websiteUrl: string;
  websitePlatform: WebsitePlatform;
  onboardingLanguage: OnboardingLanguage;
  assistantLanguage: OnboardingLanguage;
  city: string;
  contactName: string;
  contactEmail: string;
  ownerNotificationEmail: string;
  ownerNotificationWhatsapp: string;
  notifyOwnerViaEmail: boolean;
  notifyOwnerViaWhatsapp: boolean;
  notifyOnUrgent: boolean;
  notifyOnQualificationReady: boolean;
  notifyOnNewLead: boolean;
  preferredLeadChannel: "sms" | "whatsapp";
  offeredServices: string[];
  notOfferedServices: string[];
  qualificationFields: string[];
  urgencyRules: string;
  pricingMode: OnboardingPricingMode;
  servicePricing: ServicePricingEntry[];
  toneOfVoice: OnboardingTone;
  faqNotes: string;
  doNotSay: string;
  extraNotes: string;
  internalNotes: string;
};

export type ReviewIssue = {
  severity: "error" | "warning";
  message: string;
};

export type ReviewValidationResult = {
  errors: ReviewIssue[];
  warnings: ReviewIssue[];
};

export type CreateBusinessFromOnboardingResult = {
  business: {
    id: string;
    name: string;
    slug: string;
  };
  validation: ReviewValidationResult;
  alreadyConfigured: boolean;
};

export class ReviewValidationError extends Error {
  constructor(public readonly validation: ReviewValidationResult) {
    super("Review validation failed.");
    this.name = "ReviewValidationError";
  }
}

export class AlreadyConfiguredError extends Error {
  constructor(public readonly businessId: string | null) {
    super("This onboarding request has already been configured.");
    this.name = "AlreadyConfiguredError";
  }
}

type ReviewedPayloadShape = Partial<OnboardingReviewDraft> & Record<string, unknown>;

export function buildDefaultReviewDraft(request: OnboardingRequest): OnboardingReviewDraft {
  const parsedReviewed = parseReviewedPayload(request.reviewedPayload);
  if (parsedReviewed) {
    return normalizeReviewDraft(parsedReviewed);
  }

  const preferredOwnerChannels = normalizeStringList(
    (request.preferredOwnerNotificationChannels ?? []) as string[],
  );
  const servicePricing =
    request.servicePricing?.map((entry) => ({
      service: normalizeText(entry.service),
      price: normalizeText(entry.price),
      mode: entry.mode,
    })) ?? [];

  return normalizeReviewDraft({
    businessName: request.businessName,
    slug: slugifyBusinessName(request.businessName),
    businessType: request.businessType,
    websiteUrl: request.websiteUrl ?? "",
    websitePlatform: request.websitePlatform,
    onboardingLanguage: request.onboardingLanguage,
    assistantLanguage: request.assistantLanguage,
    city: request.city ?? "",
    contactName: request.contactName,
    contactEmail: request.contactEmail,
    ownerNotificationEmail: request.ownerNotificationEmail ?? "",
    ownerNotificationWhatsapp: request.ownerNotificationWhatsapp ?? "",
    notifyOwnerViaEmail: preferredOwnerChannels.includes("email"),
    notifyOwnerViaWhatsapp: preferredOwnerChannels.includes("whatsapp"),
    notifyOnUrgent: true,
    notifyOnQualificationReady: true,
    notifyOnNewLead: false,
    preferredLeadChannel: request.preferredLeadChannel,
    offeredServices: (request.servicesOffered as string[] | null) ?? [],
    notOfferedServices: (request.servicesNotOffered as string[] | null) ?? [],
    qualificationFields: (request.qualificationFields as string[] | null) ?? [],
    urgencyRules: request.urgencyRules ?? "",
    pricingMode: request.pricingMode,
    servicePricing,
    toneOfVoice: request.toneOfVoice,
    faqNotes: request.faqNotes ?? "",
    doNotSay: request.doNotSay ?? "",
    extraNotes: request.additionalNotes ?? "",
    internalNotes: request.internalNotes ?? "",
  });
}

export function slugifyBusinessName(value: string): string {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.slice(0, 120);
}

export function normalizeReviewDraft(
  input: Partial<OnboardingReviewDraft>,
): OnboardingReviewDraft {
  const offeredServices = normalizeStringList(input.offeredServices ?? []);
  const normalizedPricingMode = onboardingPricingModes.includes(
    (input.pricingMode ?? "varies") as OnboardingPricingMode,
  )
    ? (input.pricingMode as OnboardingPricingMode)
    : "varies";
  const filteredPricing = (input.servicePricing ?? [])
    .map((entry) => ({
      service: normalizeText(entry.service),
      price: normalizeText(entry.price),
      mode:
        entry.mode === "starting_at" || entry.mode === "exact"
          ? entry.mode
          : normalizedPricingMode === "starting_at"
            ? "starting_at"
            : "exact",
    }))
    .filter((entry) => entry.service.length > 0 && entry.price.length > 0)
    .filter((entry) =>
      offeredServices.some((service) => service.toLowerCase() === entry.service.toLowerCase()),
    );

  const ownerWhatsapp = normalizeText(input.ownerNotificationWhatsapp);
  const normalizedOwnerWhatsapp = ownerWhatsapp ? normalizePhone(ownerWhatsapp) ?? ownerWhatsapp : "";

  return {
    businessName: normalizeText(input.businessName),
    slug: slugifyBusinessName(input.slug ?? ""),
    businessType: onboardingBusinessTypes.includes(
      (input.businessType ?? "other") as OnboardingBusinessType,
    )
      ? (input.businessType as OnboardingBusinessType)
      : "other",
    websiteUrl: normalizeText(input.websiteUrl),
    websitePlatform: websitePlatforms.includes(
      (input.websitePlatform ?? "other") as WebsitePlatform,
    )
      ? (input.websitePlatform as WebsitePlatform)
      : "other",
    onboardingLanguage: onboardingLanguages.includes(
      (input.onboardingLanguage ?? "english") as OnboardingLanguage,
    )
      ? (input.onboardingLanguage as OnboardingLanguage)
      : "english",
    assistantLanguage: onboardingLanguages.includes(
      (input.assistantLanguage ?? "english") as OnboardingLanguage,
    )
      ? (input.assistantLanguage as OnboardingLanguage)
      : "english",
    city: normalizeText(input.city),
    contactName: normalizeText(input.contactName),
    contactEmail: normalizeText(input.contactEmail).toLowerCase(),
    ownerNotificationEmail: normalizeText(input.ownerNotificationEmail).toLowerCase(),
    ownerNotificationWhatsapp: normalizedOwnerWhatsapp,
    notifyOwnerViaEmail: Boolean(input.notifyOwnerViaEmail),
    notifyOwnerViaWhatsapp: Boolean(input.notifyOwnerViaWhatsapp),
    notifyOnUrgent: input.notifyOnUrgent ?? true,
    notifyOnQualificationReady: input.notifyOnQualificationReady ?? true,
    notifyOnNewLead: Boolean(input.notifyOnNewLead),
    preferredLeadChannel:
      input.preferredLeadChannel === "sms" || input.preferredLeadChannel === "whatsapp"
        ? input.preferredLeadChannel
        : "whatsapp",
    offeredServices,
    notOfferedServices: normalizeStringList(input.notOfferedServices ?? []),
    qualificationFields: normalizeStringList(input.qualificationFields ?? []),
    urgencyRules: normalizeText(input.urgencyRules),
    pricingMode: normalizedPricingMode,
    servicePricing: filteredPricing,
    toneOfVoice: onboardingTones.includes((input.toneOfVoice ?? "professional") as OnboardingTone)
      ? (input.toneOfVoice as OnboardingTone)
      : "professional",
    faqNotes: normalizeText(input.faqNotes),
    doNotSay: normalizeText(input.doNotSay),
    extraNotes: normalizeText(input.extraNotes),
    internalNotes: normalizeText(input.internalNotes),
  };
}

export async function validateReviewDraft(
  draft: OnboardingReviewDraft,
  options: { configuredBusinessId?: string | null } = {},
): Promise<ReviewValidationResult> {
  const errors: ReviewIssue[] = [];
  const warnings: ReviewIssue[] = [];

  if (!draft.businessName) {
    errors.push({
      severity: "error",
      message: "Business name is required.",
    });
  }

  if (!draft.slug || !businessSlugRegex.test(draft.slug)) {
    errors.push({
      severity: "error",
      message: "Slug must be lowercase letters, numbers, and hyphens only.",
    });
  } else {
    const [slugMatch] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, draft.slug))
      .limit(1);

    if (slugMatch && slugMatch.id !== options.configuredBusinessId) {
      errors.push({
        severity: "error",
        message: `Slug "${draft.slug}" is already in use.`,
      });
    }
  }

  if (draft.contactEmail && !optionalEmailSchema.safeParse(draft.contactEmail).success) {
    errors.push({
      severity: "error",
      message: "Contact email is invalid.",
    });
  }

  if (
    draft.ownerNotificationEmail &&
    !optionalEmailSchema.safeParse(draft.ownerNotificationEmail).success
  ) {
    errors.push({
      severity: "error",
      message: "Owner notification email is invalid.",
    });
  }

  if (
    draft.ownerNotificationWhatsapp &&
    !optionalPhoneRegex.test(draft.ownerNotificationWhatsapp)
  ) {
    errors.push({
      severity: "error",
      message: "Owner notification WhatsApp looks invalid.",
    });
  }

  if (draft.websiteUrl && !optionalUrlSchema.safeParse(draft.websiteUrl).success) {
    errors.push({
      severity: "error",
      message: "Website URL is invalid.",
    });
  }

  if (draft.notifyOwnerViaEmail && !draft.ownerNotificationEmail) {
    errors.push({
      severity: "error",
      message: "Email notifications are enabled but no owner notification email is set.",
    });
  }

  if (draft.notifyOwnerViaWhatsapp && !draft.ownerNotificationWhatsapp) {
    errors.push({
      severity: "error",
      message: "WhatsApp notifications are enabled but no owner WhatsApp is set.",
    });
  }

  if (draft.offeredServices.length === 0) {
    errors.push({
      severity: "error",
      message: "At least one offered service is required.",
    });
  }

  if (draft.qualificationFields.length === 0) {
    errors.push({
      severity: "error",
      message: "At least one qualification field is required.",
    });
  }

  if (
    (draft.pricingMode === "exact" || draft.pricingMode === "starting_at") &&
    draft.servicePricing.length === 0
  ) {
    warnings.push({
      severity: "warning",
      message:
        "Pricing mode is exact/starting_at but no service pricing entries were provided.",
    });
  }

  if (draft.preferredLeadChannel === "whatsapp") {
    warnings.push({
      severity: "warning",
      message:
        "Preferred lead channel is WhatsApp. Twilio number assignment is still pending and must be completed after creation.",
    });
  }

  if (!draft.faqNotes) {
    warnings.push({
      severity: "warning",
      message: "FAQ notes are empty.",
    });
  }

  if (!draft.doNotSay) {
    warnings.push({
      severity: "warning",
      message: "Do-not-say guardrails are empty.",
    });
  }

  return {
    errors,
    warnings,
  };
}

export async function createBusinessFromOnboardingReview(params: {
  onboardingRequestId: string;
  draft: OnboardingReviewDraft;
}): Promise<CreateBusinessFromOnboardingResult> {
  const normalizedDraft = normalizeReviewDraft(params.draft);
  const now = new Date();

  const existingRequest = await db
    .select({
      id: onboardingRequests.id,
      configuredBusinessId: onboardingRequests.configuredBusinessId,
      status: onboardingRequests.status,
    })
    .from(onboardingRequests)
    .where(eq(onboardingRequests.id, params.onboardingRequestId))
    .limit(1);

  const requestRow = existingRequest[0];
  if (!requestRow) {
    throw new Error("Onboarding request not found.");
  }

  if (requestRow.status === "configured" || requestRow.configuredBusinessId) {
    throw new AlreadyConfiguredError(requestRow.configuredBusinessId ?? null);
  }

  const validation = await validateReviewDraft(normalizedDraft);
  if (validation.errors.length > 0) {
    throw new ReviewValidationError(validation);
  }

  let createdBusinessId: string | null = null;
  let createdBusiness: { id: string; name: string; slug: string } | null = null;
  let lockClaimed = false;

  try {
    const claimed = await db
      .update(onboardingRequests)
      .set({
        status: "reviewed",
        reviewedPayload: toReviewPayloadRecord(normalizedDraft),
        reviewedAt: now,
        internalNotes: normalizedDraft.internalNotes || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(onboardingRequests.id, params.onboardingRequestId),
          ne(onboardingRequests.status, "configured"),
          sql`${onboardingRequests.configuredBusinessId} is null`,
          sql`${onboardingRequests.configuredAt} is null`,
          sql`${onboardingRequests.reviewedAt} is null`,
        ),
      )
      .returning({
        id: onboardingRequests.id,
      });

    if (claimed.length === 0) {
      const [latest] = await db
        .select({
          configuredBusinessId: onboardingRequests.configuredBusinessId,
          configuredAt: onboardingRequests.configuredAt,
          reviewedAt: onboardingRequests.reviewedAt,
          status: onboardingRequests.status,
        })
        .from(onboardingRequests)
        .where(eq(onboardingRequests.id, params.onboardingRequestId))
        .limit(1);

      if (
        latest?.status === "configured" ||
        latest?.configuredBusinessId ||
        latest?.configuredAt
      ) {
        throw new AlreadyConfiguredError(latest.configuredBusinessId ?? null);
      }

      throw new Error(
        "Another creation attempt is already in progress. Retry in a few seconds.",
      );
    }
    lockClaimed = true;

    const [slugMatch] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, normalizedDraft.slug))
      .limit(1);
    if (slugMatch) {
      throw new ReviewValidationError({
        errors: [
          {
            severity: "error",
            message: `Slug "${normalizedDraft.slug}" is already in use.`,
          },
        ],
        warnings: validation.warnings,
      });
    }

    const [business] = await db
      .insert(businesses)
      .values({
        name: normalizedDraft.businessName,
        slug: normalizedDraft.slug,
        email: normalizedDraft.contactEmail,
        phone: normalizedDraft.ownerNotificationWhatsapp || "unassigned",
        preferredChannel: normalizedDraft.preferredLeadChannel,
        twilioPhoneNumber: null,
        whatsappSenderStatus: "not_started",
        whatsappEnabled: false,
        smsEnabled: normalizedDraft.preferredLeadChannel === "sms",
        notificationEmail: normalizedDraft.ownerNotificationEmail || null,
        notificationPhone: normalizedDraft.ownerNotificationWhatsapp || null,
        notificationWhatsapp: normalizedDraft.ownerNotificationWhatsapp || null,
        notifyOwnerViaEmail: normalizedDraft.notifyOwnerViaEmail,
        notifyOwnerViaWhatsapp: normalizedDraft.notifyOwnerViaWhatsapp,
        notifyOnUrgent: normalizedDraft.notifyOnUrgent,
        notifyOnQualificationReady: normalizedDraft.notifyOnQualificationReady,
        notifyOnNewLead: normalizedDraft.notifyOnNewLead,
        websitePlatform: normalizedDraft.websitePlatform,
        updatedAt: now,
      })
      .returning({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
      });
    createdBusinessId = business.id;
    createdBusiness = business;

    const servicesSummary =
      normalizedDraft.offeredServices.length === 0
        ? null
        : normalizedDraft.offeredServices.join(", ");

    await db
      .insert(businessPromptSettings)
      .values({
        businessId: business.id,
        businessDescription: buildBusinessDescription(normalizedDraft),
        servicesSummary,
        toneOfVoice: normalizedDraft.toneOfVoice,
        offeredServices: normalizedDraft.offeredServices,
        notOfferedServices:
          normalizedDraft.notOfferedServices.length > 0
            ? normalizedDraft.notOfferedServices
            : [],
        qualificationRules: {
          qualificationFields: normalizedDraft.qualificationFields,
          urgencyRules: normalizedDraft.urgencyRules || null,
          pricingMode: normalizedDraft.pricingMode,
          servicePricing: normalizedDraft.servicePricing,
          extraNotes: normalizedDraft.extraNotes || null,
        },
        faqContext: {
          faqNotes: normalizedDraft.faqNotes || null,
          additionalNotes: normalizedDraft.extraNotes || null,
        },
        escalationRules: {
          doNotSay: normalizedDraft.doNotSay || null,
          internalNotes: normalizedDraft.internalNotes || null,
        },
        assistantLanguage: normalizedDraft.assistantLanguage,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: businessPromptSettings.businessId,
        set: {
          businessDescription: buildBusinessDescription(normalizedDraft),
          servicesSummary,
          toneOfVoice: normalizedDraft.toneOfVoice,
          offeredServices: normalizedDraft.offeredServices,
          notOfferedServices:
            normalizedDraft.notOfferedServices.length > 0
              ? normalizedDraft.notOfferedServices
              : [],
          qualificationRules: {
            qualificationFields: normalizedDraft.qualificationFields,
            urgencyRules: normalizedDraft.urgencyRules || null,
            pricingMode: normalizedDraft.pricingMode,
            servicePricing: normalizedDraft.servicePricing,
            extraNotes: normalizedDraft.extraNotes || null,
          },
          faqContext: {
            faqNotes: normalizedDraft.faqNotes || null,
            additionalNotes: normalizedDraft.extraNotes || null,
          },
          escalationRules: {
            doNotSay: normalizedDraft.doNotSay || null,
            internalNotes: normalizedDraft.internalNotes || null,
          },
          assistantLanguage: normalizedDraft.assistantLanguage,
          updatedAt: now,
        },
      });

    const finalized = await db
      .update(onboardingRequests)
      .set({
        status: "configured",
        reviewedPayload: toReviewPayloadRecord(normalizedDraft),
        configuredBusinessId: business.id,
        reviewedAt: now,
        configuredAt: now,
        internalNotes: normalizedDraft.internalNotes || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(onboardingRequests.id, params.onboardingRequestId),
          sql`${onboardingRequests.configuredBusinessId} is null`,
          sql`${onboardingRequests.configuredAt} is null`,
        ),
      )
      .returning({ id: onboardingRequests.id });

    if (finalized.length === 0) {
      throw new Error("Failed to finalize onboarding configuration link.");
    }

    if (!createdBusiness) {
      throw new Error("Business creation did not return a row.");
    }

    return {
      business: createdBusiness,
      validation,
      alreadyConfigured: false,
    };
  } catch (error) {
    if (createdBusinessId) {
      try {
        await db.delete(businesses).where(eq(businesses.id, createdBusinessId));
      } catch (cleanupError) {
        safeLogger.error("Cleanup failed after onboarding conversion error.", { error: cleanupError instanceof Error ? cleanupError.message : "unknown" });
      }
    }

    if (lockClaimed) {
      try {
        await db
          .update(onboardingRequests)
          .set({
            reviewedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(onboardingRequests.id, params.onboardingRequestId),
              sql`${onboardingRequests.configuredBusinessId} is null`,
              sql`${onboardingRequests.configuredAt} is null`,
            ),
          );
      } catch (unlockError) {
        safeLogger.error("Failed to release onboarding review lock.", { error: unlockError instanceof Error ? unlockError.message : "unknown" });
      }
    }

    if (error instanceof ReviewValidationError || error instanceof AlreadyConfiguredError) {
      throw error;
    }

    if (isSlugUniqueViolation(error)) {
      throw new ReviewValidationError({
        errors: [
          {
            severity: "error",
            message: `Slug "${normalizedDraft.slug}" is already in use.`,
          },
        ],
        warnings: validation.warnings,
      });
    }

    throw error;
  }
}

function parseReviewedPayload(
  payload: Record<string, unknown> | null | undefined,
): ReviewedPayloadShape | null {
  if (!payload || typeof payload !== "object") return null;

  return payload as ReviewedPayloadShape;
}

function toReviewPayloadRecord(draft: OnboardingReviewDraft): Record<string, unknown> {
  return {
    businessName: draft.businessName,
    slug: draft.slug,
    businessType: draft.businessType,
    websiteUrl: draft.websiteUrl,
    websitePlatform: draft.websitePlatform,
    onboardingLanguage: draft.onboardingLanguage,
    assistantLanguage: draft.assistantLanguage,
    city: draft.city,
    contactName: draft.contactName,
    contactEmail: draft.contactEmail,
    ownerNotificationEmail: draft.ownerNotificationEmail,
    ownerNotificationWhatsapp: draft.ownerNotificationWhatsapp,
    notifyOwnerViaEmail: draft.notifyOwnerViaEmail,
    notifyOwnerViaWhatsapp: draft.notifyOwnerViaWhatsapp,
    notifyOnUrgent: draft.notifyOnUrgent,
    notifyOnQualificationReady: draft.notifyOnQualificationReady,
    notifyOnNewLead: draft.notifyOnNewLead,
    preferredLeadChannel: draft.preferredLeadChannel,
    offeredServices: draft.offeredServices,
    notOfferedServices: draft.notOfferedServices,
    qualificationFields: draft.qualificationFields,
    urgencyRules: draft.urgencyRules,
    pricingMode: draft.pricingMode,
    servicePricing: draft.servicePricing,
    toneOfVoice: draft.toneOfVoice,
    faqNotes: draft.faqNotes,
    doNotSay: draft.doNotSay,
    extraNotes: draft.extraNotes,
    internalNotes: draft.internalNotes,
  };
}

function buildBusinessDescription(draft: OnboardingReviewDraft): string | null {
  const parts = [
    normalizeText(draft.businessName),
    normalizeText(draft.city) ? `Located in ${normalizeText(draft.city)}` : "",
    normalizeText(draft.websiteUrl) ? `Website: ${normalizeText(draft.websiteUrl)}` : "",
  ].filter((value) => value.length > 0);

  return parts.length > 0 ? parts.join(". ") : null;
}

function isSlugUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };

  const code = typeof candidate.code === "string" ? candidate.code : null;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const causeCode =
    candidate.cause && typeof candidate.cause.code === "string"
      ? candidate.cause.code
      : null;
  const causeMessage =
    candidate.cause && typeof candidate.cause.message === "string"
      ? candidate.cause.message
      : "";

  if (code === "23505" || causeCode === "23505") return true;

  return (
    message.includes("businesses_slug_unique") || causeMessage.includes("businesses_slug_unique")
  );
}
