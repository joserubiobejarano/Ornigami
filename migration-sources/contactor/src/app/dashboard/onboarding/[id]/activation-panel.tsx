"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialActivationActionState,
} from "@/app/dashboard/onboarding/[id]/activation-action-state";
import {
  activateWhatsappAction,
  assignTwilioNumberAction,
  createDashboardUserAction,
  markWhatsappApprovedAction,
  markWhatsappRejectedAction,
  markWhatsappSubmittedAction,
  toggleProductionTestCompletedAction,
} from "@/app/dashboard/onboarding/[id]/activation-actions";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import {
  buildClientHandoffText,
  getHandoffLabels,
  getInstallInstructions,
} from "@/lib/activation-handoff";
import type { OnboardingLanguage, WebsitePlatform } from "@/lib/onboarding";

type Checklist = {
  businessCreated: boolean;
  promptSettingsConfigured: boolean;
  notificationsConfigured: boolean;
  emailNotificationsOperational: boolean;
  dashboardUserCreated: boolean;
  hostedFormUrlReady: boolean;
  embedSnippetReady: boolean;
  twilioNumberAssigned: boolean;
  whatsappSenderApproved: boolean;
  whatsappActive: boolean;
  productionTestCompleted: boolean;
};

type BusinessSnapshot = {
  id: string;
  name: string;
  slug: string;
  twilioPhoneNumber: string | null;
  whatsappSenderStatus:
    | "not_started"
    | "number_assigned"
    | "pending_approval"
    | "approved"
    | "rejected";
  whatsappDisplayName: string | null;
  whatsappBusinessCategory: string | null;
  whatsappActivatedAt: Date | null;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  updatedAt: Date;
};

type OwnerUserSnapshot = {
  fullName: string;
  email: string;
} | null;

type EmailNotificationStatus = {
  enabled: boolean;
  destinationConfigured: boolean;
  provider: "mock" | "resend" | "disabled";
  operational: boolean;
  reason: string | null;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return <li>{done ? "?" : "?"} {label}</li>;
}

export function ActivationPanel({
  onboardingRequestId,
  business,
  ownerUser,
  checklist,
  emailNotifications,
  defaultOwnerName,
  defaultOwnerEmail,
  loginUrl,
  hostedFormUrl,
  iframeSnippet,
  websitePlatform,
  onboardingLanguage,
}: {
  onboardingRequestId: string;
  business: BusinessSnapshot;
  ownerUser: OwnerUserSnapshot;
  checklist: Checklist;
  emailNotifications: EmailNotificationStatus;
  defaultOwnerName: string;
  defaultOwnerEmail: string;
  loginUrl: string;
  hostedFormUrl: string;
  iframeSnippet: string;
  websitePlatform: WebsitePlatform;
  onboardingLanguage: OnboardingLanguage;
}) {
  const createUserActionWithContext = createDashboardUserAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const assignTwilioActionWithContext = assignTwilioNumberAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const markSubmittedActionWithContext = markWhatsappSubmittedAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const markApprovedActionWithContext = markWhatsappApprovedAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const markRejectedActionWithContext = markWhatsappRejectedAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const activateWhatsappActionWithContext = activateWhatsappAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );
  const toggleProductionActionWithContext = toggleProductionTestCompletedAction.bind(
    null,
    onboardingRequestId,
    business.id,
  );

  const [createUserState, createUserFormAction] = useActionState(
    createUserActionWithContext,
    initialActivationActionState,
  );
  const [assignTwilioState, assignTwilioFormAction] = useActionState(
    assignTwilioActionWithContext,
    initialActivationActionState,
  );
  const [submittedState, submittedFormAction] = useActionState(
    markSubmittedActionWithContext,
    initialActivationActionState,
  );
  const [approvedState, approvedFormAction] = useActionState(
    markApprovedActionWithContext,
    initialActivationActionState,
  );
  const [rejectedState, rejectedFormAction] = useActionState(
    markRejectedActionWithContext,
    initialActivationActionState,
  );
  const [activateState, activateFormAction] = useActionState(
    activateWhatsappActionWithContext,
    initialActivationActionState,
  );
  const [productionState, productionFormAction] = useActionState(
    toggleProductionActionWithContext,
    initialActivationActionState,
  );
  const ownerEmailForHandoff =
    createUserState.ownerEmail ?? ownerUser?.email ?? defaultOwnerEmail;
  const temporaryPassword = createUserState.temporaryPassword;
  const temporaryPasswordAvailable = Boolean(temporaryPassword);
  const temporaryPasswordDisplay = temporaryPasswordAvailable
    ? temporaryPassword
    : "Not available. Reset or recreate owner access to issue a new temporary password.";
  const labels = getHandoffLabels(onboardingLanguage);
  const installInstructions = getInstallInstructions(onboardingLanguage, websitePlatform);
  const temporaryPasswordHandoffLabel = temporaryPasswordAvailable
    ? labels.temporaryPassword
    : `${labels.temporaryPassword} (${
        onboardingLanguage === "spanish"
          ? "requiere restablecer o recrear"
          : "reset or recreate required"
      })`;
  const temporaryPasswordHandoffValue = temporaryPasswordAvailable
    ? (temporaryPassword ?? "")
    : onboardingLanguage === "spanish"
      ? "La contrasena temporal ya no esta disponible. Restablece o recrea el acceso del propietario."
      : "Temporary password is no longer available. Reset or recreate owner access.";
  const handoffText = buildClientHandoffText({
    language: onboardingLanguage,
    platform: websitePlatform,
    loginUrl,
    ownerEmail: ownerEmailForHandoff,
    temporaryPasswordLabel: temporaryPasswordHandoffLabel,
    temporaryPasswordValue: temporaryPasswordHandoffValue,
    hostedFormUrl,
    iframeSnippet,
    whatsappSenderApproved: business.whatsappSenderStatus === "approved",
  });
  const whatsappSenderStatusLabel = business.whatsappSenderStatus.replace(/_/g, " ");
  const canActivateWhatsapp =
    Boolean(business.twilioPhoneNumber) && business.whatsappSenderStatus === "approved";
  const clientWhatsappStatusMessage =
    business.whatsappSenderStatus === "approved"
      ? labels.whatsappLiveMessage
      : labels.whatsappInProgressMessage;

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="text-lg font-semibold text-emerald-900">Business activation</h2>
      <p className="mt-1 text-sm text-emerald-800">
        {business.name} is ready for activation and owner dashboard access.
      </p>

      <ul className="mt-4 grid gap-2 text-sm text-emerald-900">
        <ChecklistItem done={checklist.businessCreated} label="Business created" />
        <ChecklistItem done={checklist.promptSettingsConfigured} label="Prompt settings configured" />
        <ChecklistItem done={checklist.notificationsConfigured} label="Notifications configured" />
        <ChecklistItem
          done={checklist.emailNotificationsOperational}
          label="Email notifications operational"
        />
        <ChecklistItem done={checklist.dashboardUserCreated} label="Dashboard user created" />
        <ChecklistItem done={checklist.hostedFormUrlReady} label="Hosted form URL ready" />
        <ChecklistItem done={checklist.embedSnippetReady} label="Embed snippet ready" />
        <ChecklistItem done={checklist.twilioNumberAssigned} label="Twilio number assigned" />
        <ChecklistItem done={checklist.whatsappSenderApproved} label="WhatsApp sender approved" />
        <ChecklistItem done={checklist.whatsappActive} label="WhatsApp active" />
        <ChecklistItem done={checklist.productionTestCompleted} label="Production test completed" />
      </ul>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <article className="rounded-lg border border-emerald-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{labels.sectionTitle}</h3>
          <p className="mt-1 text-xs text-slate-600">
            {labels.sectionDescription}
          </p>
          <p
            className={`mt-2 rounded-md border p-2 text-xs ${
              emailNotifications.operational
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-300 bg-amber-50 text-amber-900"
            }`}
          >
            <span className="font-semibold">Email notifications:</span>{" "}
            {emailNotifications.operational ? "Operational" : "Needs setup"}{" "}
            (provider: {emailNotifications.provider}, enabled: {emailNotifications.enabled ? "yes" : "no"})
            {emailNotifications.reason ? ` - ${emailNotifications.reason}` : ""}
          </p>
          <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <span className="font-semibold">{labels.whatsappStatusTitle}:</span>{" "}
            {clientWhatsappStatusMessage}
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.loginUrl}</p>
          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {loginUrl}
          </div>
          <div className="mt-2">
            <CopyTextButton value={loginUrl} label="Copy login URL" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.ownerEmail}</p>
          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {ownerEmailForHandoff}
          </div>
          <div className="mt-2">
            <CopyTextButton value={ownerEmailForHandoff} label="Copy owner email" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.temporaryPassword}
          </p>
          <div
            className={`mt-1 rounded-md border p-2 text-xs ${
              temporaryPasswordAvailable
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {temporaryPasswordDisplay}
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.hostedFormUrl}</p>
          <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {hostedFormUrl}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {labels.hostedFormHelper}
          </p>
          <div className="mt-2">
            <CopyTextButton value={hostedFormUrl} label="Copy hosted form URL" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.iframeSnippet}</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {iframeSnippet}
          </pre>
          <p className="mt-1 text-xs text-slate-600">
            {labels.iframeHelper}
          </p>
          <div className="mt-2">
            <CopyTextButton value={iframeSnippet} label="Copy iframe snippet" />
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.installInstructions}
          </p>
          <ol className="mt-1 grid gap-1 text-xs text-slate-700">
            {installInstructions.map((step, index) => (
              <li key={`${step}-${index}`}>{`${index + 1}. ${step}`}</li>
            ))}
          </ol>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {labels.handoffText}
          </p>
          <pre className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            {handoffText}
          </pre>
          <div className="mt-2">
            <CopyTextButton value={handoffText} label={labels.copyFullHandoffText} />
          </div>
        </article>

        <article className="rounded-lg border border-emerald-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Internal activation actions</h3>

          <form action={createUserFormAction} className="mt-3 grid gap-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Create dashboard user
            </p>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Owner full name</span>
              <input
                name="ownerFullName"
                defaultValue={ownerUser?.fullName ?? defaultOwnerName}
                className="rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-500"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-slate-700">Owner login email</span>
              <input
                name="ownerEmail"
                type="email"
                defaultValue={ownerUser?.email ?? defaultOwnerEmail}
                className="rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-500"
              />
            </label>
            <SubmitButton label="Create dashboard user" pendingLabel="Creating user..." />
            <p className="text-xs text-slate-600">
              Existing owner login email: {ownerUser?.email ?? "Not created yet"}
            </p>
            {createUserState.message ? (
              <p className={`text-xs ${createUserState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                {createUserState.message}
              </p>
            ) : null}
            {createUserState.temporaryPassword ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p className="font-semibold">Temporary password (shown once):</p>
                <p className="mt-1 font-mono">{createUserState.temporaryPassword}</p>
              </div>
            ) : null}
          </form>

          <div className="mt-3 grid gap-3 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              WhatsApp setup
            </p>
            <div className="grid gap-2 text-xs text-slate-700">
              <p>
                <span className="font-medium text-slate-900">Current Twilio number:</span>{" "}
                {business.twilioPhoneNumber ?? "Not assigned"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Sender status:</span>{" "}
                {whatsappSenderStatusLabel}
              </p>
              <p>
                <span className="font-medium text-slate-900">Display name:</span>{" "}
                {business.whatsappDisplayName ?? "Not set"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Category:</span>{" "}
                {business.whatsappBusinessCategory ?? "Not set"}
              </p>
              <p>
                <span className="font-medium text-slate-900">Last updated:</span>{" "}
                {business.updatedAt.toLocaleString()}
              </p>
              <p>
                <span className="font-medium text-slate-900">WhatsApp active:</span>{" "}
                {business.whatsappEnabled ? "Yes" : "No"}
              </p>
            </div>

            {!business.twilioPhoneNumber ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Assign a Twilio number before submitting WhatsApp sender details.
              </p>
            ) : null}
            {business.whatsappSenderStatus !== "approved" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                WhatsApp cannot be activated until sender status is approved.
              </p>
            ) : null}
            {!canActivateWhatsapp ? (
              <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
                Activation guard: WhatsApp stays disabled until both Twilio number assignment and
                sender approval are complete.
              </p>
            ) : null}

            <form action={assignTwilioFormAction} className="grid gap-2 rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Assign / update Twilio number
              </p>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-slate-700">Twilio number (manual)</span>
                <input
                  name="twilioPhoneNumber"
                  defaultValue={business.twilioPhoneNumber ?? ""}
                  placeholder="+15799002615 or whatsapp:+15799002615"
                  className="rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-500"
                />
              </label>
              <SubmitButton label="Assign / update Twilio number" pendingLabel="Saving..." />
              {assignTwilioState.message ? (
                <p className={`text-xs ${assignTwilioState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                  {assignTwilioState.message}
                </p>
              ) : null}
            </form>

            <form action={submittedFormAction} className="grid gap-2 rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Mark as submitted for WhatsApp
              </p>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-slate-700">Display name</span>
                <input
                  name="whatsappDisplayName"
                  defaultValue={business.whatsappDisplayName ?? ""}
                  placeholder="Business display name"
                  className="rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-500"
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="font-medium text-slate-700">Business category</span>
                <input
                  name="whatsappBusinessCategory"
                  defaultValue={business.whatsappBusinessCategory ?? ""}
                  placeholder="healthcare, beauty, fitness, etc."
                  className="rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-slate-500"
                />
              </label>
              <SubmitButton label="Mark as submitted for WhatsApp" pendingLabel="Saving..." />
              {submittedState.message ? (
                <p className={`text-xs ${submittedState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                  {submittedState.message}
                </p>
              ) : null}
            </form>

            <div className="grid gap-2 sm:grid-cols-2">
              <form action={approvedFormAction} className="grid gap-2 rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Approval status
                </p>
                <SubmitButton label="Mark as approved" pendingLabel="Saving..." />
                {approvedState.message ? (
                  <p className={`text-xs ${approvedState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                    {approvedState.message}
                  </p>
                ) : null}
              </form>

              <form action={rejectedFormAction} className="grid gap-2 rounded-md border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rejection status
                </p>
                <SubmitButton label="Mark as rejected" pendingLabel="Saving..." />
                {rejectedState.message ? (
                  <p className={`text-xs ${rejectedState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                    {rejectedState.message}
                  </p>
                ) : null}
              </form>
            </div>

            <form action={activateFormAction} className="grid gap-2 rounded-md border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Go live
              </p>
              <button
                type="submit"
                disabled={!canActivateWhatsapp}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Activate WhatsApp
              </button>
              {!canActivateWhatsapp ? (
                <p className="text-xs text-slate-600">
                  Activation is disabled until the sender is approved and a Twilio number is assigned.
                </p>
              ) : null}
              {activateState.message ? (
                <p className={`text-xs ${activateState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                  {activateState.message}
                </p>
              ) : null}
            </form>
          </div>

          <form action={productionFormAction} className="mt-3 grid gap-2 rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Production test
            </p>
            <input
              type="hidden"
              name="completed"
              value={checklist.productionTestCompleted ? "false" : "true"}
            />
            <SubmitButton
              label={
                checklist.productionTestCompleted
                  ? "Mark production test pending"
                  : "Mark production test completed"
              }
              pendingLabel="Saving..."
            />
            {productionState.message ? (
              <p className={`text-xs ${productionState.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
                {productionState.message}
              </p>
            ) : null}
          </form>
        </article>
      </div>
    </section>
  );
}
