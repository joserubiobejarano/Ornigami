"use server";

import { revalidatePath } from "next/cache";
import { safeLogger } from "@/lib/safe-logger";

import type { OnboardingReviewActionState } from "@/app/dashboard/onboarding/[id]/action-state";
import {
  AlreadyConfiguredError,
  ReviewValidationError,
  createBusinessFromOnboardingReview,
  normalizeReviewDraft,
  validateReviewDraft,
  type OnboardingReviewDraft,
  type ServicePricingEntry,
} from "@/server/services/onboarding-business-conversion.service";
import { requireInternalAdminSession } from "@/server/auth/internal-admin";

export async function runOnboardingReviewChecksAction(
  onboardingRequestId: string,
  _prevState: OnboardingReviewActionState,
  formData: FormData,
): Promise<OnboardingReviewActionState> {
  try {
    await requireInternalAdminSession();
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      errors: [],
      warnings: [],
      createdBusiness: null,
      normalizedDraft: null,
    };
  }

  const normalizedDraft = normalizeReviewDraft(readDraftFromFormData(formData));
  const validation = await validateReviewDraft(normalizedDraft);

  return {
    status: validation.errors.length > 0 ? "error" : "success",
    message:
      validation.errors.length > 0
        ? "Resolve blocking issues before creating the business."
        : "Review checks completed.",
    errors: validation.errors,
    warnings: validation.warnings,
    createdBusiness: null,
    normalizedDraft,
  };
}

export async function createBusinessFromOnboardingAction(
  onboardingRequestId: string,
  _prevState: OnboardingReviewActionState,
  formData: FormData,
): Promise<OnboardingReviewActionState> {
  try {
    await requireInternalAdminSession();
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      errors: [],
      warnings: [],
      createdBusiness: null,
      normalizedDraft: null,
    };
  }

  const normalizedDraft = normalizeReviewDraft(readDraftFromFormData(formData));

  try {
    const result = await createBusinessFromOnboardingReview({
      onboardingRequestId,
      draft: normalizedDraft,
    });

    revalidatePath("/dashboard/onboarding");
    revalidatePath(`/dashboard/onboarding/${onboardingRequestId}`);
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Business "${result.business.name}" created from onboarding.`,
      errors: [],
      warnings: result.validation.warnings,
      createdBusiness: result.business,
      normalizedDraft,
    };
  } catch (error) {
    if (error instanceof ReviewValidationError) {
      return {
        status: "error",
        message: "Resolve blocking issues before creating the business.",
        errors: error.validation.errors,
        warnings: error.validation.warnings,
        createdBusiness: null,
        normalizedDraft,
      };
    }

    if (error instanceof AlreadyConfiguredError) {
      return {
        status: "error",
        message: "This onboarding request is already configured.",
        errors: [
          {
            severity: "error",
            message: "A business has already been created for this onboarding request.",
          },
        ],
        warnings: [],
        createdBusiness: null,
        normalizedDraft,
      };
    }

    safeLogger.error("onboarding.convert.failed", { error: error instanceof Error ? error.message : "unknown" });

    const detailedMessage =
      error instanceof Error && error.message
        ? error.message
        : "Unexpected error during creation. Please retry.";

    return {
      status: "error",
      message: `Creation failed. ${detailedMessage}`,
      errors: [
        {
          severity: "error",
          message: detailedMessage,
        },
      ],
      warnings: [],
      createdBusiness: null,
      normalizedDraft,
    };
  }
}

function readDraftFromFormData(formData: FormData): OnboardingReviewDraft {
  return {
    businessName: readString(formData, "businessName"),
    slug: readString(formData, "slug"),
    businessType: readString(formData, "businessType") as OnboardingReviewDraft["businessType"],
    websiteUrl: readString(formData, "websiteUrl"),
    websitePlatform: readString(formData, "websitePlatform") as OnboardingReviewDraft["websitePlatform"],
    onboardingLanguage: readString(formData, "onboardingLanguage") as OnboardingReviewDraft["onboardingLanguage"],
    assistantLanguage: readString(formData, "assistantLanguage") as OnboardingReviewDraft["assistantLanguage"],
    city: readString(formData, "city"),
    contactName: readString(formData, "contactName"),
    contactEmail: readString(formData, "contactEmail"),
    ownerNotificationEmail: readString(formData, "ownerNotificationEmail"),
    ownerNotificationWhatsapp: readString(formData, "ownerNotificationWhatsapp"),
    notifyOwnerViaEmail: readBoolean(formData, "notifyOwnerViaEmail"),
    notifyOwnerViaWhatsapp: readBoolean(formData, "notifyOwnerViaWhatsapp"),
    notifyOnUrgent: readBoolean(formData, "notifyOnUrgent"),
    notifyOnQualificationReady: readBoolean(formData, "notifyOnQualificationReady"),
    notifyOnNewLead: readBoolean(formData, "notifyOnNewLead"),
    preferredLeadChannel: readString(formData, "preferredLeadChannel") as "sms" | "whatsapp",
    offeredServices: readListField(formData, "offeredServices"),
    notOfferedServices: readListField(formData, "notOfferedServices"),
    qualificationFields: readListField(formData, "qualificationFields"),
    urgencyRules: readString(formData, "urgencyRules"),
    pricingMode: readString(formData, "pricingMode") as OnboardingReviewDraft["pricingMode"],
    servicePricing: readServicePricing(formData, "servicePricing"),
    toneOfVoice: readString(formData, "toneOfVoice") as OnboardingReviewDraft["toneOfVoice"],
    faqNotes: readString(formData, "faqNotes"),
    doNotSay: readString(formData, "doNotSay"),
    extraNotes: readString(formData, "extraNotes"),
    internalNotes: readString(formData, "internalNotes"),
  };
}

function readString(formData: FormData, key: string): string {
  const raw = formData.get(key);
  if (typeof raw !== "string") return "";
  return raw;
}

function readBoolean(formData: FormData, key: string): boolean {
  return readString(formData, key) === "on";
}

function readListField(formData: FormData, key: string): string[] {
  return readString(formData, key)
    .split(/\r?\n|,/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readServicePricing(formData: FormData, key: string): ServicePricingEntry[] {
  const rows = readString(formData, key)
    .split(/\r?\n/g)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  const entries: ServicePricingEntry[] = [];

  for (const row of rows) {
    const splitIndex = row.includes("|") ? row.indexOf("|") : row.indexOf(":");
    if (splitIndex <= 0) continue;

    const service = row.slice(0, splitIndex).trim();
    const price = row.slice(splitIndex + 1).trim();
    if (!service || !price) continue;

    entries.push({
      service,
      price,
      mode: "exact",
    });
  }

  return entries;
}
