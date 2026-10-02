import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  onboardingRequests,
  type OnboardingRequest,
} from "@/server/db/schema";

type OnboardingStatus = OnboardingRequest["status"];

type ServicePricingEntry = {
  service: string;
  price: string;
  mode: "exact" | "starting_at";
};

type CreateOnboardingRequestInput = {
  status?: OnboardingStatus;
  businessName: string;
  businessType: OnboardingRequest["businessType"];
  websiteUrl?: string | null;
  websitePlatform: OnboardingRequest["websitePlatform"];
  onboardingLanguage: OnboardingRequest["onboardingLanguage"];
  assistantLanguage: OnboardingRequest["assistantLanguage"];
  city?: string | null;
  contactName: string;
  contactEmail: string;
  ownerNotificationEmail?: string | null;
  ownerNotificationWhatsapp?: string | null;
  preferredLeadChannel: OnboardingRequest["preferredLeadChannel"];
  preferredOwnerNotificationChannels: Array<"email" | "whatsapp">;
  servicesOffered: string[];
  servicesNotOffered?: string[] | null;
  pricingMode: OnboardingRequest["pricingMode"];
  servicePricing?: ServicePricingEntry[] | null;
  qualificationFields: string[];
  urgencyRules?: string | null;
  toneOfVoice: OnboardingRequest["toneOfVoice"];
  faqNotes?: string | null;
  doNotSay?: string | null;
  additionalNotes?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

export async function createOnboardingRequest(
  input: CreateOnboardingRequestInput,
): Promise<OnboardingRequest> {
  const [created] = await db
    .insert(onboardingRequests)
    .values({
      status: input.status ?? "new",
      businessName: input.businessName,
      businessType: input.businessType,
      websiteUrl: input.websiteUrl ?? null,
      websitePlatform: input.websitePlatform,
      onboardingLanguage: input.onboardingLanguage,
      assistantLanguage: input.assistantLanguage,
      city: input.city ?? null,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      ownerNotificationEmail: input.ownerNotificationEmail ?? null,
      ownerNotificationWhatsapp: input.ownerNotificationWhatsapp ?? null,
      preferredLeadChannel: input.preferredLeadChannel,
      preferredOwnerNotificationChannels: input.preferredOwnerNotificationChannels,
      servicesOffered: input.servicesOffered,
      servicesNotOffered: input.servicesNotOffered ?? null,
      pricingMode: input.pricingMode,
      servicePricing: input.servicePricing ?? null,
      qualificationFields: input.qualificationFields,
      urgencyRules: input.urgencyRules ?? null,
      toneOfVoice: input.toneOfVoice,
      faqNotes: input.faqNotes ?? null,
      doNotSay: input.doNotSay ?? null,
      additionalNotes: input.additionalNotes ?? null,
      rawPayload: input.rawPayload ?? null,
      updatedAt: new Date(),
    })
    .returning();

  return created;
}

export async function listOnboardingRequests(limit = 100): Promise<OnboardingRequest[]> {
  return db
    .select()
    .from(onboardingRequests)
    .orderBy(desc(onboardingRequests.createdAt))
    .limit(limit);
}

export async function getOnboardingRequestById(id: string): Promise<OnboardingRequest | null> {
  const [result] = await db
    .select()
    .from(onboardingRequests)
    .where(eq(onboardingRequests.id, id))
    .limit(1);

  return result ?? null;
}

export async function deleteOnboardingRequestById(id: string): Promise<void> {
  await db.delete(onboardingRequests).where(eq(onboardingRequests.id, id));
}
