"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { updateDashboardSettings } from "@/server/services/dashboard.service";
import { normalizePhone } from "@/server/lib/phone";
import { ChannelConfigurationError } from "@/server/services/channel-policy.service";
import type { DashboardSettingsActionState } from "@/app/internal-dashboard/settings/action-state";
import { requireInternalAdminBusinessAccess } from "@/server/auth/internal-admin";

const settingsSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  preferredChannel: z.enum(["sms", "whatsapp"]),
  whatsappEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  twilioPhoneNumber: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value.length === 0 || normalizePhone(value) !== null, {
      message: "Twilio phone number format is invalid.",
    }),
  notificationEmail: z
    .string()
    .trim()
    .max(255)
    .refine((value) => value.length === 0 || z.email().safeParse(value).success, {
      message: "Notification email must be valid.",
    }),
  notificationWhatsapp: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value.length === 0 || /^\+?[0-9()\-\s.]{7,40}$/.test(value), {
      message: "Notification WhatsApp format is invalid.",
    }),
  notifyOwnerViaEmail: z.boolean(),
  notifyOwnerViaWhatsapp: z.boolean(),
  notifyOnUrgent: z.boolean(),
  notifyOnQualificationReady: z.boolean(),
  notifyOnNewLead: z.boolean(),
  businessDescription: z.string().trim().max(10000),
  servicesSummary: z.string().trim().max(10000),
  toneOfVoice: z.string().trim().max(80),
  assistantLanguage: z.enum(["english", "spanish"]),
  offeredServicesJson: z.string().trim().max(40000),
  notOfferedServicesJson: z.string().trim().max(40000),
  qualificationRulesJson: z.string().trim().max(40000),
  faqContextJson: z.string().trim().max(40000),
});

function parseJsonObjectField(rawValue: string, fieldName: string) {
  if (!rawValue) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`${fieldName} must be valid JSON.`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function parseJsonStructuredField(rawValue: string, fieldName: string) {
  if (!rawValue) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error(`${fieldName} must be valid JSON.`);
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    (Array.isArray(parsed) && parsed.length === 0)
  ) {
    if (Array.isArray(parsed)) return parsed;
    throw new Error(`${fieldName} must be a JSON array or object.`);
  }

  return parsed;
}

function toNullable(value: string) {
  return value.length === 0 ? null : value;
}

export async function updateDashboardSettingsAction(
  _prevState: DashboardSettingsActionState,
  formData: FormData,
): Promise<DashboardSettingsActionState> {
  const businessId = String(formData.get("businessId") ?? "");
  try {
    await requireInternalAdminBusinessAccess(businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
    };
  }

  const parsed = settingsSchema.safeParse({
    businessName: formData.get("businessName"),
    preferredChannel: formData.get("preferredChannel"),
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    smsEnabled: formData.get("smsEnabled") === "on",
    twilioPhoneNumber: formData.get("twilioPhoneNumber"),
    notificationEmail: formData.get("notificationEmail"),
    notificationWhatsapp: formData.get("notificationWhatsapp"),
    notifyOwnerViaEmail: formData.get("notifyOwnerViaEmail") === "on",
    notifyOwnerViaWhatsapp: formData.get("notifyOwnerViaWhatsapp") === "on",
    notifyOnUrgent: formData.get("notifyOnUrgent") === "on",
    notifyOnQualificationReady: formData.get("notifyOnQualificationReady") === "on",
    notifyOnNewLead: formData.get("notifyOnNewLead") === "on",
    businessDescription: formData.get("businessDescription"),
    servicesSummary: formData.get("servicesSummary"),
    toneOfVoice: formData.get("toneOfVoice"),
    assistantLanguage: formData.get("assistantLanguage"),
    offeredServicesJson: formData.get("offeredServicesJson"),
    notOfferedServicesJson: formData.get("notOfferedServicesJson"),
    qualificationRulesJson: formData.get("qualificationRulesJson"),
    faqContextJson: formData.get("faqContextJson"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Invalid settings payload.",
    };
  }

  try {
    const qualificationRules = parseJsonObjectField(
      parsed.data.qualificationRulesJson,
      "Qualification rules",
    );
    const faqContext = parseJsonObjectField(parsed.data.faqContextJson, "FAQ context");
    const offeredServices = parseJsonStructuredField(
      parsed.data.offeredServicesJson,
      "Offered services",
    );
    const notOfferedServices = parseJsonStructuredField(
      parsed.data.notOfferedServicesJson,
      "Not offered services",
    );
    const normalizedTwilioPhoneNumber =
      parsed.data.twilioPhoneNumber.length === 0
        ? null
        : normalizePhone(parsed.data.twilioPhoneNumber);

    if (parsed.data.twilioPhoneNumber.length > 0 && !normalizedTwilioPhoneNumber) {
      return {
        status: "error",
        message: "Twilio phone number format is invalid.",
      };
    }

    await updateDashboardSettings({
      businessName: parsed.data.businessName,
      preferredChannel: parsed.data.preferredChannel,
      whatsappEnabled: parsed.data.whatsappEnabled,
      smsEnabled: parsed.data.smsEnabled,
      twilioPhoneNumber: normalizedTwilioPhoneNumber,
      notificationEmail: toNullable(parsed.data.notificationEmail),
      notificationWhatsapp: toNullable(parsed.data.notificationWhatsapp),
      notifyOwnerViaEmail: parsed.data.notifyOwnerViaEmail,
      notifyOwnerViaWhatsapp: parsed.data.notifyOwnerViaWhatsapp,
      notifyOnUrgent: parsed.data.notifyOnUrgent,
      notifyOnQualificationReady: parsed.data.notifyOnQualificationReady,
      notifyOnNewLead: parsed.data.notifyOnNewLead,
      businessDescription: toNullable(parsed.data.businessDescription),
      servicesSummary: toNullable(parsed.data.servicesSummary),
      toneOfVoice: toNullable(parsed.data.toneOfVoice),
      assistantLanguage: parsed.data.assistantLanguage,
      offeredServices,
      notOfferedServices,
      qualificationRules,
      faqContext,
    }, { businessId });

    revalidatePath("/admin");
    revalidatePath("/admin/settings");
    revalidatePath("/admin/leads");
  } catch (error) {
    if (error instanceof ChannelConfigurationError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    if (error instanceof Error) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "Unable to update settings.",
    };
  }

  return {
    status: "success",
    message: "Settings updated.",
  };
}

