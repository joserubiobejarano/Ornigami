import { NextResponse } from "next/server";

import { auth, signOut } from "@/auth";
import {
  beginAccountDeletion,
  assertAccountLifecycleDrained,
  claimAccountDeletion,
  finalizeAccountDeletion,
  getFrozenDeletionOperation,
  getAccountDeletionSteps,
  recordAccountDeletionStep,
  releaseAccountDeletion,
  renewAccountDeletionLease,
} from "@/lib/privacy-account-deletion";
import { reconcileOwnerStripeForDeletion, revokeActorGoogleGrant } from "@/lib/privacy-deletion-providers";
import { cancelMappedOwnedBillingSubscriptions } from "@/lib/billing/reconciliation";
import { stripe } from "@/lib/stripe";
import { isSameOriginMutation } from "@/lib/team-lifecycle";
import { safeLogger } from "@/lib/safe-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DeletionSession = { user?: { id?: string | null } | null; deletionUserId?: string | null };
type RequestConfirmation = { confirmation?: unknown; confirmSharedWorkspaceData?: unknown };

function json(value: unknown, status: number) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}

async function readConfirmation(request: Request): Promise<RequestConfirmation | null> {
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (contentType !== "application/json" && !contentType.endsWith("+json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    const parsed: unknown = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as RequestConfirmation : null;
  } catch {
    return null;
  }
}

function errorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : "provider_or_storage_failure";
  return /^[a-z][a-z0-9_]{0,79}$/.test(raw) ? raw : "provider_or_storage_failure";
}

export async function POST(request: Request) {
  if (process.env.PRIVACY_ACCOUNT_DELETION_ENABLED !== "true") {
    return json({ error: "Account deletion is temporarily unavailable." }, 503);
  }
  if (!isSameOriginMutation(request)) return json({ error: "Cross-origin request rejected." }, 403);

  const session = await auth();
  const deletionSession = session as unknown as DeletionSession | null;
  const userId = deletionSession?.user?.id;
  const restrictedUserId = deletionSession?.deletionUserId;
  const actorUserId = userId || restrictedUserId;
  if (!actorUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorUserId)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const isRestrictedResume = !userId && Boolean(restrictedUserId);
  const confirmation = await readConfirmation(request);
  if (!confirmation) return json({ error: "A valid confirmation request is required." }, 400);
  if (confirmation.confirmation !== "DELETE MY DATA") {
    return json({ error: "Confirmation required." }, 400);
  }

  try {
    const frozenOperationId = isRestrictedResume ? await getFrozenDeletionOperation(actorUserId) : null;
    if (isRestrictedResume && !frozenOperationId) return json({ error: "No frozen deletion request can be resumed." }, 403);
    // Restricted sessions must first prove a frozen operation exists. Calling
    // begin again only allows explicit consent to upgrade that same operation;
    // the SQL function never creates a new operation for a missing user.
    const begin = await beginAccountDeletion(actorUserId, confirmation.confirmSharedWorkspaceData === true);
    if (isRestrictedResume && begin.operationId !== frozenOperationId) {
      return json({ error: "No frozen deletion request can be resumed." }, 403);
    }
    if (begin.result === "team_confirmation_required") {
      return json({ error: "Confirm that deleting this account will also delete its workspace and team data.", confirmationRequired: true }, 409);
    }
    if (begin.result === "not_found") return json({ error: "Account not found." }, 401);
    if (!begin.operationId) throw new Error("privacy_deletion_operation_unavailable");
    if (begin.result === "complete") {
      await signOut({ redirect: false }).catch(() => {});
      return json({ ok: true }, 200);
    }

    const claim = await claimAccountDeletion(begin.operationId);
    if (claim.result === "busy") return json({ ok: false, recoverable: true, operationId: begin.operationId }, 409);
    if (claim.result === "complete") {
      await signOut({ redirect: false }).catch(() => {});
      return json({ ok: true }, 200);
    }
    if (claim.result !== "claimed" || !claim.actorUserId || !claim.accountRole || !claim.fence) {
      return json({ error: "The deletion request could not be resumed." }, 503);
    }
    if (claim.actorUserId !== actorUserId) return json({ error: "The deletion request could not be resumed." }, 403);

    try {
      await assertAccountLifecycleDrained(claim.actorUserId);
      await reconcileOwnerStripeForDeletion({
        stripe,
        ownerUserId: claim.actorUserId,
        operationId: begin.operationId,
        assertFence: () => renewAccountDeletionLease(begin.operationId!, claim.fence!),
        cancelMapped: async (ownerUserId, operationId) => cancelMappedOwnedBillingSubscriptions({
            ownerUserId,
            operationId,
            retrieveSubscription: (id) => stripe.subscriptions.retrieve(id, {}, { timeout: 10_000, maxNetworkRetries: 0 }),
            cancelSubscription: async (id) => {
              await renewAccountDeletionLease(begin.operationId!, claim.fence!);
              const result = await stripe.subscriptions.cancel(id, {}, { timeout: 10_000, maxNetworkRetries: 0 });
              await renewAccountDeletionLease(begin.operationId!, claim.fence!);
              return result;
            },
        }),
      });
      await recordAccountDeletionStep(begin.operationId, claim.fence, "billing");

      const currentSteps = await getAccountDeletionSteps(begin.operationId);
      if (!currentSteps.google) {
        await renewAccountDeletionLease(begin.operationId, claim.fence);
        await revokeActorGoogleGrant(claim.actorUserId, begin.operationId);
        await renewAccountDeletionLease(begin.operationId, claim.fence);
        await recordAccountDeletionStep(begin.operationId, claim.fence, "google");
      }

      const finalized = await finalizeAccountDeletion(begin.operationId, claim.fence);
      if (finalized === "team_confirmation_required") {
        await releaseAccountDeletion(begin.operationId, claim.fence, "team_confirmation_required").catch(() => {});
        return json({
          error: "A teammate or pending invitation joined this workspace while deletion was in progress. Confirm shared workspace deletion to continue.",
          confirmationRequired: true,
          operationId: begin.operationId,
        }, 409);
      }
      if (finalized !== "complete") throw new Error(`privacy_finalize_${finalized}`);
      await signOut({ redirect: false }).catch(() => {});
      return json({ ok: true }, 200);
    } catch (error) {
      const code = errorCode(error);
      await releaseAccountDeletion(begin.operationId, claim.fence, code).catch(() => {});
      safeLogger.error("privacy.account_deletion.recoverable_failure", { operationId: begin.operationId, code });
      return json({ ok: false, recoverable: true, operationId: begin.operationId }, 202);
    }
  } catch (error) {
    safeLogger.error("privacy.account_deletion.failed", { code: errorCode(error) });
    return json({ error: "Account deletion could not be started. Please retry." }, 503);
  }
}
