import type { FollowupRunResult } from "@/modules/review-booster/types/followup.types";
import type { AtomicBeginSend, AtomicFollowupCandidate, AtomicFollowupClaim, FrozenFollowupPayload } from "@/modules/review-booster/services/atomic-followup-db.service";
import { MAX_FOLLOWUPS_PER_RUN } from "@/lib/followup-run-policy";

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

export type FollowupRunOutcome = FollowupRunResult;

export async function runEligibleFollowups(deps: FollowupRunnerDependencies): Promise<FollowupRunOutcome> {
  // The database performs a fair, deterministic oldest-first selection capped at 50.
  const visits = await deps.listCandidates(MAX_FOLLOWUPS_PER_RUN);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let unknown = 0;
  let deferred = 0;

  for (const visit of visits.slice(0, MAX_FOLLOWUPS_PER_RUN)) {
    // Claim one at a time so a run that stops early does not reserve a whole batch.
    const claim = await deps.claim(visit.visitId);
    if (["busy", "existing", "ineligible", "expired", "non_sendable"].includes(claim.kind)) {
      skipped += 1;
      continue;
    }
    if (claim.kind === "quota_exhausted" || claim.kind === "reconciliation_required") {
      deferred += 1;
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
      continue;
    } else {
      try {
        if (!visit.businessName.trim()) throw new Error("Add your business name in Review Booster settings before sending follow-ups.");
        subject = deps.buildSubject(visit.businessName, visit.language);
        body = await deps.generateBody(visit);
        payload = await deps.preparePayload(visit, subject, body, claim.deliveryId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const changed = await deps.release({ deliveryId: claim.deliveryId, fence: claim.fence, outcome: "generation_failed", error: errorMessage });
        if (changed) failed += 1;
        else skipped += 1;
        continue;
      }

      // Persisting the exact JSON must succeed before begin-send or any network call.
      // A DB failure propagates and leaves the reservation fenced for safe recovery.
      const persisted = await deps.persistPayload(claim.deliveryId, claim.fence, payload, visit.googleReviewUrl);
      if (!persisted) {
        skipped += 1;
        continue;
      }
    }

    // This atomic boundary rechecks current access, suppression, visit age, destination,
    // active plan and quota immediately before allowing provider I/O.
    const begin = await deps.beginSend(claim.deliveryId, claim.fence);
    if (begin.kind !== "send") {
      if (begin.kind === "quota_exhausted") deferred += 1;
      else skipped += 1;
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
  }

  return { ok: true, scanned: visits.length, sent, failed, skipped, unknown, deferred };
}

export type FollowupRunnerOverrides = Partial<Pick<FollowupRunnerDependencies, "generateBody" | "preparePayload" | "sendPrepared" | "classifySendError" | "buildSubject">>;

export async function createFollowupRunnerDependencies(businessId: string, actorUserId?: string, overrides: FollowupRunnerOverrides = {}): Promise<FollowupRunnerDependencies> {
  const [db, provider, generator, reviewLinks] = await Promise.all([
    import("@/modules/review-booster/services/atomic-followup-db.service"),
    import("@/modules/review-booster/services/resend.provider"),
    import("@/modules/review-booster/services/followup-email-generator.service"),
    import("@/lib/review-link-token"),
  ]);
  const access = await import("@/modules/review-booster/services/review-booster-db.service");
  if (actorUserId) await access.assertBusinessMember(businessId, actorUserId);

  return {
    listCandidates: (limit) => db.listAtomicFollowupCandidates({ businessId, limit }),
    claim: (visitId) => db.claimAtomicFollowupDelivery({ businessId, visitId }),
    buildSubject: overrides.buildSubject ?? generator.buildSubject,
    generateBody: overrides.generateBody ?? ((visit) => generator.generateFollowupEmailBody({
      business_name: visit.businessName,
      business_type: visit.businessType,
      city: visit.city,
      customer_name: visit.customerName,
      service_name: visit.serviceName,
      google_review_url: visit.googleReviewUrl,
      tone_setting: visit.tone,
      language: visit.language,
      visited_at: visit.visitedAt,
    })),
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
      language: visit.language,
    })),
    persistPayload: (deliveryId, fence, payload, reviewUrl) => db.persistAtomicFollowupPayload({ deliveryId, fence, payload, reviewUrl }),
    beginSend: (deliveryId, fence) => db.beginAtomicFollowupSend({ deliveryId, fence, actorUserId }),
    sendPrepared: overrides.sendPrepared ?? provider.sendPreparedWithResend,
    classifySendError: overrides.classifySendError ?? provider.classifyResendFailure,
    finalizeAccepted: (input) => db.finalizeAtomicFollowupAccepted({ ...input, provider: "resend" }),
    release: (input) => db.releaseAtomicFollowupDelivery(input),
    markUnknown: (input) => db.markAtomicFollowupUnknown(input),
  };
}
