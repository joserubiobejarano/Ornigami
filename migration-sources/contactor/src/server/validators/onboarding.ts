import { z } from "zod";

import {
  onboardingLanguages,
  onboardingBusinessTypes,
  onboardingPricingModes,
  onboardingTones,
  ownerNotificationChannels,
  websitePlatforms,
} from "@/lib/onboarding";

const textListItemSchema = z.string().trim().min(1).max(120);
const optionalTrimmedString = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalUrlSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => !value || z.url().safeParse(value).success, {
    message: "Please enter a valid URL.",
  });

const optionalEmailSchema = z
  .string()
  .trim()
  .max(255)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: "Please enter a valid email address.",
  });

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => !value || /^\+?[0-9()\-\s.]{7,40}$/.test(value), {
    message: "Please enter a valid phone number.",
  });

const servicePricingEntrySchema = z.object({
  service: z.string().trim().min(1).max(120),
  price: z.string().trim().min(1).max(120),
});

export const submitOnboardingSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200),
    businessType: z.enum(onboardingBusinessTypes),
    websiteUrl: optionalUrlSchema,
    websitePlatform: z.enum(websitePlatforms),
    onboardingLanguage: z.enum(onboardingLanguages),
    assistantLanguage: z.enum(onboardingLanguages),
    city: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
    contactName: z.string().trim().min(2).max(200),
    contactEmail: z.string().trim().email().max(255),
    ownerNotificationEmail: optionalEmailSchema,
    ownerNotificationWhatsapp: optionalPhoneSchema,
    preferredLeadChannel: z.enum(["whatsapp", "sms"]),
    preferredOwnerNotificationChannels: z.array(z.enum(ownerNotificationChannels)).min(1),
    servicesOffered: z.array(textListItemSchema).min(1),
    servicesNotOffered: z.array(textListItemSchema).optional(),
    pricingMode: z.enum(onboardingPricingModes),
    servicePricing: z.array(servicePricingEntrySchema).optional(),
    qualificationFields: z.array(textListItemSchema).min(1),
    urgencyRules: optionalTrimmedString,
    toneOfVoice: z.enum(onboardingTones),
    faqNotes: optionalTrimmedString,
    doNotSay: optionalTrimmedString,
    additionalNotes: optionalTrimmedString,
  })
  .superRefine((input, ctx) => {
    const preferredChannels = normalizeStringList(input.preferredOwnerNotificationChannels);

    if (preferredChannels.includes("email") && !input.ownerNotificationEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerNotificationEmail"],
        message: "Notification email is required when email alerts are selected.",
      });
    }

    if (preferredChannels.includes("whatsapp") && !input.ownerNotificationWhatsapp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerNotificationWhatsapp"],
        message: "Notification WhatsApp is required when WhatsApp alerts are selected.",
      });
    }

    const normalizedServices = normalizeStringList(input.servicesOffered);
    if (normalizedServices.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["servicesOffered"],
        message: "Add at least one offered service.",
      });
    }

    const normalizedQualifications = normalizeStringList(input.qualificationFields);
    if (normalizedQualifications.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["qualificationFields"],
        message: "Add at least one qualification field.",
      });
    }

    if ((input.pricingMode === "exact" || input.pricingMode === "starting_at") && input.servicePricing) {
      for (const entry of input.servicePricing) {
        const normalizedService = normalizeText(entry.service);
        if (!normalizedService) continue;

        if (!normalizedServices.some((service) => service.toLowerCase() === normalizedService.toLowerCase())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["servicePricing"],
            message: `Pricing entry service \"${normalizedService}\" is not in services offered.`,
          });
          break;
        }
      }
    }
  });

export type SubmitOnboardingInput = z.infer<typeof submitOnboardingSchema>;

export function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    result.push(normalized);
  }

  return result;
}

export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\s+/g, " ");
}
