"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { OwnerSettingsActionState } from "@/app/owner/dashboard/settings/action-state";
import { requireOwnerDashboardSession } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { businesses } from "@/server/db/schema";
import { normalizePhone } from "@/server/lib/phone";
import { ChannelConfigurationError, assertValidPreferredChannelConfiguration } from "@/server/services/channel-policy.service";
import { and, eq } from "drizzle-orm";

const ownerSettingsSchema = z.object({
  preferredChannel: z.enum(["sms", "whatsapp"]),
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
});

function toNullable(value: string) {
  return value.length === 0 ? null : value;
}

export async function updateOwnerSettingsAction(
  _prevState: OwnerSettingsActionState,
  formData: FormData,
): Promise<OwnerSettingsActionState> {
  const session = await requireOwnerDashboardSession();

  const parsed = ownerSettingsSchema.safeParse({
    preferredChannel: formData.get("preferredChannel"),
    notificationEmail: formData.get("notificationEmail"),
    notificationWhatsapp: formData.get("notificationWhatsapp"),
    notifyOwnerViaEmail: formData.get("notifyOwnerViaEmail") === "on",
    notifyOwnerViaWhatsapp: formData.get("notifyOwnerViaWhatsapp") === "on",
    notifyOnUrgent: formData.get("notifyOnUrgent") === "on",
    notifyOnQualificationReady: formData.get("notifyOnQualificationReady") === "on",
    notifyOnNewLead: formData.get("notifyOnNewLead") === "on",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid settings payload.",
    };
  }

  try {
    const [business] = await db
      .select({
        id: businesses.id,
        smsEnabled: businesses.smsEnabled,
        whatsappEnabled: businesses.whatsappEnabled,
      })
      .from(businesses)
      .where(eq(businesses.id, session.businessId))
      .limit(1);

    if (!business) {
      return {
        status: "error",
        message: "Business not found.",
      };
    }

    assertValidPreferredChannelConfiguration({
      preferredChannel: parsed.data.preferredChannel,
      smsEnabled: business.smsEnabled,
      whatsappEnabled: business.whatsappEnabled,
    });

    const normalizedWhatsapp =
      parsed.data.notificationWhatsapp.length === 0
        ? null
        : normalizePhone(parsed.data.notificationWhatsapp) ?? parsed.data.notificationWhatsapp;

    await db
      .update(businesses)
      .set({
        preferredChannel: parsed.data.preferredChannel,
        notificationEmail: toNullable(parsed.data.notificationEmail),
        notificationWhatsapp: normalizedWhatsapp,
        notifyOwnerViaEmail: parsed.data.notifyOwnerViaEmail,
        notifyOwnerViaWhatsapp: parsed.data.notifyOwnerViaWhatsapp,
        notifyOnUrgent: parsed.data.notifyOnUrgent,
        notifyOnQualificationReady: parsed.data.notifyOnQualificationReady,
        notifyOnNewLead: parsed.data.notifyOnNewLead,
        updatedAt: new Date(),
      })
      .where(and(eq(businesses.id, session.businessId)));

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
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


