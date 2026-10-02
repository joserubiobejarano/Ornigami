"use server";

import { revalidatePath } from "next/cache";

import type { ActivationActionState } from "@/app/internal-dashboard/onboarding/[id]/activation-action-state";
import {
  DashboardAuthError,
  DashboardUserAlreadyExistsError,
  createOwnerDashboardUser,
} from "@/server/services/dashboard-auth.service";
import {
  activateBusinessWhatsapp,
  assignBusinessTwilioNumber,
  markBusinessProductionTestCompleted,
  markBusinessWhatsappSenderStatus,
  updateBusinessWhatsappSenderProfile,
} from "@/server/services/dashboard.service";
import { normalizePhone } from "@/server/lib/phone";
import { requireInternalAdminBusinessAccess, requireInternalAdminSession } from "@/server/auth/internal-admin";
import { assertOnboardingBusinessMatch } from "@/server/services/onboarding.service";
import { WhatsappActivationError } from "@/server/services/channel-policy.service";

function revalidateActivation(onboardingRequestId: string) {
  revalidatePath(`/admin/onboarding/${onboardingRequestId}`);
  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}

export async function createDashboardUserAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  formData: FormData,
): Promise<ActivationActionState> {
  try {
    await requireInternalAdminSession();
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  const fullName = String(formData.get("ownerFullName") ?? "").trim();
  const email = String(formData.get("ownerEmail") ?? "").trim().toLowerCase();

  try {
    const result = await createOwnerDashboardUser({
      businessId,
      fullName,
      email,
    });

    revalidateActivation(onboardingRequestId);

    return {
      status: "success",
      message: "Dashboard user created. Temporary password is shown once below.",
      ownerEmail: result.user.email,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    if (error instanceof DashboardUserAlreadyExistsError || error instanceof DashboardAuthError) {
      return {
        status: "error",
        message: error.message,
        ownerEmail: null,
        temporaryPassword: null,
      };
    }

    return {
      status: "error",
      message: "Unable to create dashboard user right now.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }
}

export async function assignTwilioNumberAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  formData: FormData,
): Promise<ActivationActionState> {
  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  const twilioInput = String(formData.get("twilioPhoneNumber") ?? "").trim();
  const normalizedTwilioPhoneNumber = twilioInput.length === 0 ? null : normalizePhone(twilioInput);

  if (twilioInput.length > 0 && !normalizedTwilioPhoneNumber) {
    return {
      status: "error",
      message: "Twilio number format is invalid.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  await assignBusinessTwilioNumber({
    businessId,
    twilioPhoneNumber: normalizedTwilioPhoneNumber,
  });

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: normalizedTwilioPhoneNumber
      ? "Twilio number assigned/updated."
      : "Twilio number cleared.",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

export async function markWhatsappSubmittedAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  formData: FormData,
): Promise<ActivationActionState> {
  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  const displayNameRaw = String(formData.get("whatsappDisplayName") ?? "").trim();
  const categoryRaw = String(formData.get("whatsappBusinessCategory") ?? "").trim();

  await updateBusinessWhatsappSenderProfile({
    businessId,
    displayName: displayNameRaw.length > 0 ? displayNameRaw : null,
    businessCategory: categoryRaw.length > 0 ? categoryRaw : null,
  });

  try {
    await markBusinessWhatsappSenderStatus({
      businessId,
      senderStatus: "pending_approval",
    });
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Unable to mark WhatsApp sender as submitted.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: "WhatsApp sender marked as submitted (pending approval).",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

export async function markWhatsappApprovedAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  _formData: FormData,
): Promise<ActivationActionState> {
  void _prevState;
  void _formData;

  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  try {
    await markBusinessWhatsappSenderStatus({
      businessId,
      senderStatus: "approved",
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to mark WhatsApp as approved.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: "WhatsApp sender marked as approved.",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

export async function markWhatsappRejectedAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  _formData: FormData,
): Promise<ActivationActionState> {
  void _prevState;
  void _formData;

  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  try {
    await markBusinessWhatsappSenderStatus({
      businessId,
      senderStatus: "rejected",
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to mark WhatsApp as rejected.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: "WhatsApp sender marked as rejected. WhatsApp has been disabled.",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

export async function activateWhatsappAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  _formData: FormData,
): Promise<ActivationActionState> {
  void _prevState;
  void _formData;

  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  try {
    await activateBusinessWhatsapp({ businessId });
  } catch (error) {
    if (error instanceof WhatsappActivationError || error instanceof Error) {
      return {
        status: "error",
        message: error.message,
        ownerEmail: null,
        temporaryPassword: null,
      };
    }

    return {
      status: "error",
      message: "Unable to activate WhatsApp.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: "WhatsApp is now active for this business.",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

export async function toggleProductionTestCompletedAction(
  onboardingRequestId: string,
  businessId: string,
  _prevState: ActivationActionState,
  formData: FormData,
): Promise<ActivationActionState> {
  try {
    await requireInternalAdminBusinessAccess(businessId);
    await assertOnboardingBusinessMatch(onboardingRequestId, businessId);
  } catch {
    return {
      status: "error",
      message: "Unauthorized action context.",
      ownerEmail: null,
      temporaryPassword: null,
    };
  }

  const completed = formData.get("completed") === "true";

  await markBusinessProductionTestCompleted({
    businessId,
    completed,
  });

  revalidateActivation(onboardingRequestId);

  return {
    status: "success",
    message: completed ? "Production test marked as completed." : "Production test marked as pending.",
    ownerEmail: null,
    temporaryPassword: null,
  };
}

