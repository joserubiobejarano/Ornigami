import type { FollowupRunResult } from "@/modules/review-booster/types/followup.types";
import type { AtomicBeginSend, AtomicFollowupCandidate, AtomicFollowupClaim, FrozenFollowupPayload } from "@/modules/review-booster/services/atomic-followup-db.service";
import { MAX_FOLLOWUPS_PER_RUN } from "@/lib/followup-run-policy";
import { isSafeGoogleReviewUrl } from "@/modules/review-booster/services/settings-link-validation";

export type FollowupRunnerDependencies = {
  listCandidates: (limit: number) => Promise<AtomicFollowupCandidate[]>;
  claim: (visitId: string) => Promise<AtomicFollowupClaim>;
  buildSubject: (businessName: string, language: string | null) => string;
  generateBody: (visit: AtomicFollowupCandidate) => Promise<string>;
  preparePayload: (visit: AtomicFollowupCandidate, subject: string, body: string, deliveryId: string) => Promise<FrozenFollowupPayload>;
  persistPayload: (deliveryId: string, fence: string, payload: FrozenFollowupPayload, reviewUrl: string) => Promise<boolean>;
  beginSend: (deliveryId: string, fence: string) => Promise<AtomicBeginSend>;
  sendPrepared: (payload: FrozenFollowupPayload, idempotencyKey: string) => Promise<string>;
  classifySendError: (error: unknown) => "definite_rejection" | "ambiguous";
  finalizeAccepted: (input: { deliveryId: string; fence: string; providerMessageId: string; subject: string; body: string }) => Promise<boolean>;
  release: (input: { deliveryId: string; fence: string; outcome: "rejected" | "generation_failed"; error: string }) => Promise<boolean>;
  markUnknown: (input: { deliveryId: string; fence: string; error: string }) => Promise<boolean>;
};

export type FollowupRunOutcome = FollowupRunResult & { interrupted?: boolean; candidateBatchFull?: boolean };

export type FollowupRunnerOptions = {
  /** Checked before claiming each candidate. Returning false leaves it eligible for a later run. */
  shouldContinue?: () => boolean;
  /** Checked after freezing the delivery but before begin-send; false leaves a safe recovery claim. */
  shouldBeginSend?: () => boolean;
  /** Called after a candidate reaches a settled outcome (including skips and deferrals). */
  onCandidateComplete?: (visit: AtomicFollowupCandidate, outcome: Pick<FollowupRunResult, "failed" | "unknown" | "sent" | "skipped" | "deferred">) => Promise<void>;
};

export async function runEligibleFollowups(deps: FollowupRunnerDependencies, options: FollowupRunnerOptions = {}): Promise<FollowupRunOutcome> {
  // The database performs a fair, deterministic oldest-first selection capped at 50.
  const visits = await deps.listCandidates(MAX_FOLLOWUPS_PER_RUN);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let unknown = 0;
  let deferred = 0;
  let processed = 0;
  let interrupted = false;

  for (const visit of visits.slice(0, MAX_FOLLOWUPS_PER_RUN)) {
    if (options.shouldContinue && !options.shouldContinue()) { interrupted = true; break; }
    // Claim one at a time so a run that stops early does not reserve a whole batch.
    const claim = await deps.claim(visit.visitId);
    if (["busy", "existing", "ineligible", "expired", "non_sendable"].includes(claim.kind)) {
      skipped += 1;
      processed += 1;
      await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
      continue;
    }
    if (claim.kind === "quota_exhausted" || claim.kind === "reconciliation_required") {
      deferred += 1;
      processed += 1;
      await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
      continue;
    }
    if (!claim.deliveryId || !claim.fence || !claim.idempotencyKey) {
      // An incomplete claim is a database contract failure; never attempt provider I/O.
      throw new Error("Atomic follow-up claim returned incomplete delivery fencing data.");
    }

    let payload: FrozenFollowupPayload;
    let subject: string;
    let body: string;
    if (claim.kind === "recovery" && claim.payload) {
      // Never rebuild content for a prior attempt: Resend requires the exact body and key.
      payload = claim.payload;
      subject = payload.subject;
      body = payload.text;
    } else if (claim.kind === "recovery" && claim.firstAttemptAt !== null) {
      // Missing frozen content after a provider attempt cannot be reconstructed safely.
      const changed = await deps.markUnknown({ deliveryId: claim.deliveryId, fence: claim.fence, error: "Recovery delivery has no frozen payload after an earlier attempt." });
      if (changed) unknown += 1;
      else skipped += 1;
      processed += 1;
      await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
      continue;
    } else {
      try {
        if (!visit.businessName.trim()) throw new Error("Add your business name in Review Booster settings before sending follow-ups.");
        if (!isSafeGoogleReviewUrl(visit.googleReviewUrl)) throw new Error("Correct the Google review link in Review Booster settings before sending follow-ups.");
        subject = deps.buildSubject(visit.businessName, visit.language);
        body = await deps.generateBody(visit);
        payload = await deps.preparePayload(visit, subject, body, claim.deliveryId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const changed = await deps.release({ deliveryId: claim.deliveryId, fence: claim.fence, outcome: "generation_failed", error: errorMessage });
        if (changed) failed += 1;
        else skipped += 1;
        processed += 1;
        await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
        continue;
      }

      // Persisting the exact JSON must succeed before begin-send or any network call.
      // A DB failure propagates and leaves the reservation fenced for safe recovery.
      const persisted = await deps.persistPayload(claim.deliveryId, claim.fence, payload, visit.googleReviewUrl);
      if (!persisted) {
        skipped += 1;
        processed += 1;
        await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
        continue;
      }
    }

    if (options.shouldBeginSend && !options.shouldBeginSend()) { interrupted = true; break; }
    // This atomic boundary rechecks current access, suppression, visit age, destination,
    // active plan and quota immediately before allowing provider I/O.
    const begin = await deps.beginSend(claim.deliveryId, claim.fence);
    if (begin.kind !== "send") {
      if (begin.kind === "quota_exhausted") deferred += 1;
      else skipped += 1;
      processed += 1;
      await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
      continue;
    }
    // Final message history uses the content sent by the provider, including the
    // localized CTA and unsubscribe text captured in the frozen payload.
    subject = begin.payload.subject;
    body = begin.payload.text;

    let providerMessageId: string;
    try {
      providerMessageId = await deps.sendPrepared(begin.payload, begin.idempotencyKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const kind = deps.classifySendError(error);
      // firstAttemptAt on the claim means an earlier provider call may have succeeded.
      // Even a later 4xx cannot establish that the earlier call was rejected.
      if (kind === "definite_rejection" && claim.firstAttemptAt === null) {
        const released = await deps.release({ deliveryId: claim.deliveryId, fence: claim.fence, outcome: "rejected", error: errorMessage });
        if (released) failed += 1;
        else skipped += 1;
      } else {
        const recorded = await deps.markUnknown({ deliveryId: claim.deliveryId, fence: claim.fence, error: errorMessage });
        if (recorded) unknown += 1;
        else skipped += 1;
      }
      processed += 1;
      await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
      continue;
    }

    // Keep this outside the provider catch: a database failure after provider acceptance
    // is an unknown accepted outcome, never a provider rejection or a fresh-send trigger.
    const finalized = await deps.finalizeAccepted({
      deliveryId: claim.deliveryId,
      fence: claim.fence,
      providerMessageId,
      subject,
      body,
    });
    if (finalized) sent += 1;
    else {
      await deps.markUnknown({ deliveryId: claim.deliveryId, fence: claim.fence, error: "Provider accepted the email but finalization was fenced." });
      unknown += 1;
    }
    processed += 1;
    await options.onCandidateComplete?.(visit, { failed, unknown, sent, skipped, deferred });
  }

  return { ok: true, scanned: processed, sent, failed, skipped, unknown, deferred,
    interrupted, candidateBatchFull: visits.length >= MAX_FOLLOWUPS_PER_RUN };
}

export type FollowupRunnerOverrides = Partial<Pick<FollowupRunnerDependencies, "generateBody" | "preparePayload" | "sendPrepared" | "classifySendError" | "buildSubject">>;

export async function createFollowupRunnerDependencies(businessId: string, actorUserId?: string, overrides: FollowupRunnerOverrides = {}): Promise<FollowupRunnerDependencies> {
  const [db, provider, generator, reviewLinks, lifecycle] = await Promise.all([
    import("@/modules/review-booster/services/atomic-followup-db.service"),
    import("@/modules/review-booster/services/resend.provider"),
    import("@/modules/review-booster/services/followup-email-generator.service"),
    import("@/lib/review-link-token"),
    import("@/lib/account-lifecycle"),
  ]);
  const access = await import("@/modules/review-booster/services/review-booster-db.service");
  if (actorUserId) await access.assertBusinessMember(businessId, actorUserId);
  const generateBody = overrides.generateBody ?? ((visit: AtomicFollowupCandidate) => generator.generateFollowupEmailBody({
    business_name: visit.businessName,
    business_type: visit.businessType,
    city: visit.city,
    customer_name: visit.customerName,
    service_name: visit.serviceName,
    google_review_url: visit.googleReviewUrl,
    tone_setting: visit.tone,
    language: visit.language,
    visited_at: visit.visitedAt,
  }));

  return {
    listCandidates: (limit) => db.listAtomicFollowupCandidates({ businessId, limit }),
    claim: (visitId) => db.claimAtomicFollowupDelivery({ businessId, visitId }),
    buildSubject: overrides.buildSubject ?? generator.buildSubject,
    generateBody: async (visit) => {
      const ownerUserId = await db.getBoosterBusinessOwnerId(visit.businessId);
      if (!ownerUserId) throw new Error("Review Booster workspace owner is unavailable.");
      const admission = await lifecycle.beginAccountLifecycleOperation({
        userId: ownerUserId,
        actorUserId: actorUserId ?? null,
        businessId: visit.businessId,
        kind: "booster_generation",
        idempotencyKey: `${visit.deliveryId}:${globalThis.crypto.randomUUID()}`,
        leaseMs: 45_000,
      });
      if (admission.result !== "claimed" || !admission.token) {
        throw new Error(`Account lifecycle did not admit Booster content generation (${admission.result}).`);
      }
      try {
        const body = await generateBody(visit);
        if (!await lifecycle.finishAccountLifecycleOperation(admission.token, "done")) {
          throw new Error("Booster generation lease expired before its result was finalized.");
        }
        return body;
      } catch (error) {
        const unknown = error instanceof Error && error.name === "BoosterGenerationOutcomeUnknown";
        await lifecycle.finishAccountLifecycleOperation(admission.token, unknown ? "uncertain" : "failed");
        throw error;
      }
    },
    preparePayload: overrides.preparePayload ?? ((visit, subject, body, deliveryId) => provider.prepareResendPayload({
      delivery_id: deliveryId,
      business_id: visit.businessId,
      email_from_name: visit.emailFromName,
      business_name: visit.businessName,
      customer_email: visit.customerEmail,
      subject,
      body,
      google_review_url: visit.googleReviewUrl,
      review_link_url: reviewLinks.buildReviewLinkUrl({ businessId: visit.businessId, visitId: visit.visitId, reviewUrl: visit.googleReviewUrl }),
      rebooking_url: visit.rebookingUrl,
      language: visit.language,
    })),
    persistPayload: (deliveryId, fence, payload, reviewUrl) => db.persistAtomicFollowupPayload({ deliveryId, fence, payload, reviewUrl, actorUserId }),
    beginSend: (deliveryId, fence) => db.beginAtomicFollowupSend({ deliveryId, fence, actorUserId }),
    sendPrepared: overrides.sendPrepared ?? provider.sendPreparedWithResend,
    classifySendError: overrides.classifySendError ?? provider.classifyResendFailure,
    finalizeAccepted: (input) => db.finalizeAtomicFollowupAccepted({ ...input, provider: "resend" }),
    release: (input) => db.releaseAtomicFollowupDelivery(input),
    markUnknown: (input) => db.markAtomicFollowupUnknown(input),
  };
}
