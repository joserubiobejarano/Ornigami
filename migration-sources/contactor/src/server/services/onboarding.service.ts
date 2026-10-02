import {
  createOnboardingRequest,
  deleteOnboardingRequestById,
  getOnboardingRequestById,
  listOnboardingRequests,
} from "@/server/db/repositories/onboarding-requests.repo";
import { deleteBusinessById } from "@/server/db/repositories/businesses.repo";
import {
  normalizeStringList,
  normalizeText,
  type SubmitOnboardingInput,
} from "@/server/validators/onboarding";

export type SubmitOnboardingContext = {
  rawPayload?: Record<string, unknown> | null;
};

export async function submitOnboardingRequest(
  input: SubmitOnboardingInput,
  context: SubmitOnboardingContext = {},
) {
  const preferredOwnerNotificationChannels = normalizeNotificationChannels(
    input.preferredOwnerNotificationChannels,
  );
  const servicesOffered = normalizeStringList(input.servicesOffered);
  const servicesNotOffered = normalizeStringList(input.servicesNotOffered ?? []);
  const qualificationFields = normalizeStringList(input.qualificationFields);

  const servicePricing =
    input.pricingMode === "exact" || input.pricingMode === "starting_at"
      ? normalizeServicePricing({
          entries: input.servicePricing ?? [],
          pricingMode: input.pricingMode,
          allowedServices: servicesOffered,
        })
      : [];

  const created = await createOnboardingRequest({
    status: "new",
    businessName: normalizeText(input.businessName),
    businessType: input.businessType,
    websiteUrl: toNullableText(input.websiteUrl),
    websitePlatform: input.websitePlatform,
    onboardingLanguage: input.onboardingLanguage,
    assistantLanguage: input.assistantLanguage,
    city: toNullableText(input.city),
    contactName: normalizeText(input.contactName),
    contactEmail: normalizeText(input.contactEmail).toLowerCase(),
    ownerNotificationEmail: toNullableText(input.ownerNotificationEmail)?.toLowerCase() ?? null,
    ownerNotificationWhatsapp: toNullableText(input.ownerNotificationWhatsapp),
    preferredLeadChannel: input.preferredLeadChannel,
    preferredOwnerNotificationChannels,
    servicesOffered,
    servicesNotOffered: servicesNotOffered.length > 0 ? servicesNotOffered : null,
    pricingMode: input.pricingMode,
    servicePricing: servicePricing.length > 0 ? servicePricing : null,
    qualificationFields,
    urgencyRules: toNullableText(input.urgencyRules),
    toneOfVoice: input.toneOfVoice,
    faqNotes: toNullableText(input.faqNotes),
    doNotSay: toNullableText(input.doNotSay),
    additionalNotes: toNullableText(input.additionalNotes),
    rawPayload: context.rawPayload ?? null,
  });

  return {
    id: created.id,
    status: created.status,
    createdAt: created.createdAt,
  };
}

export async function getOnboardingRequestsForReview() {
  return listOnboardingRequests(200);
}

export async function getOnboardingRequestDetail(id: string) {
  return getOnboardingRequestById(id);
}

export async function assertOnboardingBusinessMatch(
  onboardingRequestId: string,
  businessId: string,
): Promise<void> {
  const request = await getOnboardingRequestById(onboardingRequestId);
  if (!request || request.configuredBusinessId !== businessId) {
    throw new Error("Onboarding request and business do not match.");
  }
}

export async function deleteOnboardingRequestAndRelatedBusiness(id: string) {
  const request = await getOnboardingRequestById(id);
  if (!request) return;

  if (request.configuredBusinessId) {
    await deleteBusinessById(request.configuredBusinessId);
  }

  await deleteOnboardingRequestById(id);
}

function normalizeNotificationChannels(
  channels: Array<"email" | "whatsapp">,
): Array<"email" | "whatsapp"> {
  const normalized = normalizeStringList(channels) as Array<"email" | "whatsapp">;

  if (normalized.includes("email") && normalized.includes("whatsapp")) {
    return ["email", "whatsapp"];
  }

  if (normalized.includes("email")) {
    return ["email"];
  }

  return ["whatsapp"];
}

function normalizeServicePricing({
  entries,
  pricingMode,
  allowedServices,
}: {
  entries: Array<{ service: string; price: string }>;
  pricingMode: "exact" | "starting_at";
  allowedServices: string[];
}): Array<{ service: string; price: string; mode: "exact" | "starting_at" }> {
  const normalizedAllowed = new Set(allowedServices.map((service) => service.toLowerCase()));
  const dedupe = new Set<string>();
  const result: Array<{ service: string; price: string; mode: "exact" | "starting_at" }> = [];

  for (const entry of entries) {
    const service = normalizeText(entry.service);
    const price = normalizeText(entry.price);
    if (!service || !price) continue;

    const key = service.toLowerCase();
    if (!normalizedAllowed.has(key) || dedupe.has(key)) continue;

    dedupe.add(key);
    result.push({
      service,
      price,
      mode: pricingMode,
    });
  }

  return result;
}

function toNullableText(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}
