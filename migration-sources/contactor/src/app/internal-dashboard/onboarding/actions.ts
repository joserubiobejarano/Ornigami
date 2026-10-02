"use server";

import { revalidatePath } from "next/cache";

import { requireInternalAdminSession } from "@/server/auth/internal-admin";
import { deleteOnboardingRequestAndRelatedBusiness } from "@/server/services/onboarding.service";

export async function deleteOnboardingRequestAction(onboardingRequestId: string) {
  await requireInternalAdminSession();
  await deleteOnboardingRequestAndRelatedBusiness(onboardingRequestId);

  revalidatePath("/admin/onboarding");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
}
