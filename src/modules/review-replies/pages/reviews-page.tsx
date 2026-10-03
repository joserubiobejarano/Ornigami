"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";

import {
  DashboardCallout,
  DashboardEmptyState,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/form-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ReviewList } from "@/components/reviews/review-list";
import { readTextStream } from "@/lib/stream-client";
import { useReviewInboxData } from "@/modules/review-replies/hooks/use-review-inbox-data";
import { ReviewInboxSummary } from "@/modules/review-replies/components/review-inbox-summary";
import type { Review } from "@/modules/review-replies/types/review.types";
import { hasDraftChangedSince, shouldShowTestWorkflowActions } from "@/components/reviews/review-workflow";
import { DraftVersionConflictError, ReplyPostError, postReviewReply, saveReviewDraft } from "@/modules/review-replies/services/review-replies-api.service";
import type { ReviewDraft } from "@/modules/review-replies/types/review.types";

function ReviewsPageContent() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [postingReviewId, setPostingReviewId] = useState<string | null>(null);
  const [generatingReviewId, setGeneratingReviewId] = useState<string | null>(null);
  const [savingReviewId, setSavingReviewId] = useState<string | null>(null);
  const postingReviewIdsRef = useRef(new Set<string>());
  const generatingReviewIdsRef = useRef(new Set<string>());
  const savingReviewIdsRef = useRef(new Set<string>());
  const [draftConflicts, setDraftConflicts] = useState<Record<string, ReviewDraft | null | undefined>>({});
  const {
    businessId,
    locations,
    selectedLocation: selectedLoc,
    setSelectedLocation: setSelectedLoc,
    reviews,
    setReviews,
    drafts,
    autoReplyAllReviews,
    setDrafts,
    savedDraftSnapshots,
    setSavedDraftSnapshots,
    rememberDraftMetadata,
    isOwner,
    loading,
    pageLoading,
    hasPrevious,
    hasMore,
    error,
    syncing,
    loadReviews,
    loadLocations,
    loadFirstReviews,
    loadNextReviews,
    loadPreviousReviews,
    syncReviews,
  } = useReviewInboxData(true);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const activeScopeRef = useRef(JSON.stringify([businessId ?? null, selectedLoc]));
  activeScopeRef.current = JSON.stringify([businessId ?? null, selectedLoc]);
  useEffect(() => setDraftConflicts({}), [businessId, selectedLoc]);

  const NO_CONNECTED_MSG = "Connect your Google profile to load locations and reviews.";

  function handleConnectGoogle() {
    window.location.href = "/api/google/oauth/start";
  }

  async function generate(review: Review) {
    if (!review.isSample && !selectedLoc) {
      toast.error("Select a location before generating a reply.");
      return;
    }
    const operationScope = JSON.stringify([businessId ?? null, selectedLoc]);
    const scopeIsCurrent = () => operationScope === activeScopeRef.current;
    if (generatingReviewIdsRef.current.size > 0) return;
    generatingReviewIdsRef.current.add(review.google_review_id);
    setGeneratingReviewId(review.google_review_id);
    try {
    const localTextAtStart = draftsRef.current[review.google_review_id] ?? "";
    const body = review.isSample
      ? {
          businessName: "My Business",
          city: "Local",
          rating: Math.min(5, Math.max(1, typeof review.star_rating === "number" ? review.star_rating : 3)),
          text: review.comment || "",
        }
      : {
          reviewText: review.comment || "",
          businessName: "",
          city: "",
          rating: Math.min(5, Math.max(1, typeof review.star_rating === "number" ? review.star_rating : 3)),
        };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(review.isSample ? { "x-sample-review": "true" } : {}),
    };

    const r = await fetch("/api/openai/review-reply", {
      method: "POST",
      headers,
      body: JSON.stringify(review.isSample ? body : {
        ...body,
        ...(businessId ? { businessId } : {}),
        reviewId: review.google_review_id,
        locationName: selectedLoc,
      }),
    });
    if (!r.ok) {
      if (!scopeIsCurrent()) {
        toast.info("Generation failed for the previous location. Return there before taking further action.");
        return;
      }
      const j = await r.json().catch(() => ({})) as { error?: string; currentDraft?: ReviewDraft | null };
      if (!scopeIsCurrent()) {
        toast.info("Generation failed for the previous location. Return there before taking further action.");
        return;
      }
      if (j.currentDraft !== undefined) {
        setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: j.currentDraft ?? null }));
      }
      const message = j?.error ?? `Generate failed (${r.status})`;
      toast.error(message);
      return;
    }

    let replyText = "";
    let generatedDraft: ReviewDraft | undefined;
    if (!review.isSample) {
      const result = await r.json() as { draft?: ReviewDraft; reply?: string };
      generatedDraft = result.draft;
      replyText = generatedDraft?.reply ?? result.reply ?? "";
      if (!replyText || !generatedDraft) {
        toast.error("The generated draft could not be saved. Please try again.");
        return;
      }
      rememberDraftMetadata(review.google_review_id, { draftState: generatedDraft.state, draftVersion: generatedDraft.version, draftUpdatedAt: generatedDraft.updatedAt }, { businessId, location: selectedLoc }, replyText);
      if (!scopeIsCurrent()) {
        toast.info("Generation finished for the previous location. Return there and refresh its inbox to review the saved draft.");
        return;
      }
      const userEditedWhileGenerating = hasDraftChangedSince(draftsRef.current[review.google_review_id], localTextAtStart);
      setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
      setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
        ? { ...item, draftState: generatedDraft!.state, draftVersion: generatedDraft!.version, draftUpdatedAt: generatedDraft!.updatedAt }
        : item));
      setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: undefined }));
      if (userEditedWhileGenerating) {
        toast.success("AI draft saved. Your edits are still here; save them before posting.");
        return;
      }
    } else if (r.headers.get("content-type")?.includes("text/event-stream")) {
      await readTextStream(r, (text) => { replyText += text; }, (finalText) => { replyText = finalText; });
    } else {
      const j = await r.json() as { reply?: string; markdown?: string; text?: string };
      replyText = j.reply ?? j.markdown ?? j.text ?? "";
    }
    if (!scopeIsCurrent()) {
      toast.info("Generation finished for the previous location. Return there and refresh its inbox to review the saved draft.");
      return;
    }
    if (!hasDraftChangedSince(draftsRef.current[review.google_review_id], localTextAtStart)) {
      setDrafts((d) => ({ ...d, [review.google_review_id]: replyText }));
    }

    if (review.isSample) {
      toast.success("Reply generated. Save it to keep your test draft.");
    } else {
      if (!selectedLoc) {
        toast.error("Select a location before saving or posting a reply.");
        return;
      }
      toast.success("AI draft generated and saved. Review it, then edit or post when ready.");
    }
    } catch {
      toast.error(scopeIsCurrent()
        ? "We couldn't generate a reply. Your current text is preserved; retry when the connection is available."
        : "Generation did not finish in the current view. Return to the original location and refresh its inbox.");
    } finally {
      generatingReviewIdsRef.current.delete(review.google_review_id);
      setGeneratingReviewId(null);
    }
  }

  async function post(review: Review) {
    const reply = drafts[review.google_review_id];
    if (!reply?.trim() || !selectedLoc) {
      toast.error("Write or generate a reply before posting.");
      return;
    }
    const localSnapshot = savedDraftSnapshots[review.google_review_id];
    const version = review.draftVersion ?? 0;
    if (localSnapshot !== reply || version <= 0) {
      toast.error("Save this exact reply draft before posting it to Google.");
      return;
    }
    if (postingReviewIdsRef.current.size > 0) return;
    postingReviewIdsRef.current.add(review.google_review_id);
    setPostingReviewId(review.google_review_id);
    const operationScope = JSON.stringify([businessId ?? null, selectedLoc]);
    const scopeIsCurrent = () => operationScope === activeScopeRef.current;
    try {
      await postReviewReply({
        ...(businessId ? { businessId } : {}),
        reviewId: review.google_review_id,
        locationName: selectedLoc,
        reply,
        expectedVersion: version,
      });
      rememberDraftMetadata(review.google_review_id, { draftState: "posted", draftVersion: version, draftUpdatedAt: review.draftUpdatedAt }, { businessId, location: selectedLoc });
      if (!scopeIsCurrent()) {
        toast.info("Posting finished for the previous location. Return there and refresh its inbox to check the saved status.");
        return;
      }
      setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
        ? { ...item, status: "replied", draftState: "posted", postRecoveryStatus: null }
        : item));
      await loadReviews();
      toast.success("Reply posted to Google.");
    } catch (cause) {
      if (!scopeIsCurrent()) {
        toast.info("Posting could not be confirmed for the previous location. Return there and refresh its saved status.");
      } else if (cause instanceof DraftVersionConflictError) {
        setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: cause.currentDraft }));
        toast.error("This draft changed elsewhere. Your edits are preserved; reload the saved draft before retrying.");
      } else {
        if (!scopeIsCurrent()) {
          toast.info("Posting could not be confirmed for the previous location. Return there and refresh its saved status.");
        } else if (!(cause instanceof ReplyPostError) || cause.outcomeUncertain) {
          if (cause instanceof ReplyPostError && cause.currentDraft !== undefined) {
            setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: cause.currentDraft ?? null }));
          }
          setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
            ? { ...item, postRecoveryStatus: "reconciliation_required" }
            : item));
          toast.error("The post result could not be confirmed. Refresh the saved status before taking any further action.");
        } else {
          toast.error(cause.message);
        }
      }
    } finally {
      postingReviewIdsRef.current.delete(review.google_review_id);
      setPostingReviewId(null);
    }
  }

  async function saveDraft(review: Review) {
    const reply = drafts[review.google_review_id] ?? "";
    if (!reply.trim()) {
      toast.error("Write a reply before saving.");
      return;
    }
    if (savingReviewIdsRef.current.size > 0) return;
    savingReviewIdsRef.current.add(review.google_review_id);
    setSavingReviewId(review.google_review_id);
    const operationScope = JSON.stringify([businessId ?? null, selectedLoc]);
    const scopeIsCurrent = () => operationScope === activeScopeRef.current;
    try {
      const draft = await saveReviewDraft({
        ...(businessId ? { businessId } : {}),
        reviewId: review.google_review_id,
        reply,
        expectedVersion: review.draftVersion ?? 0,
      });
      const canonicalText = draft.reply ?? reply.trim();
      rememberDraftMetadata(review.google_review_id, { draftState: draft.state, draftVersion: draft.version, draftUpdatedAt: draft.updatedAt }, { businessId, location: selectedLoc }, canonicalText);
      if (!scopeIsCurrent()) {
        toast.info("The draft was saved for the previous location. Return there and refresh its inbox to review it.");
        return;
      }
      setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: canonicalText }));
      if (!hasDraftChangedSince(draftsRef.current[review.google_review_id], reply)) {
        setDrafts((previous) => ({ ...previous, [review.google_review_id]: canonicalText }));
      }
      setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
        ? { ...item, draftState: draft.state, draftVersion: draft.version, draftUpdatedAt: draft.updatedAt }
        : item));
      setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: undefined }));
      toast.success("Your reply draft is saved.");
    } catch (cause) {
      if (!scopeIsCurrent()) {
        toast.info("The save could not be confirmed for the previous location. Return there and refresh its inbox.");
      } else if (cause instanceof DraftVersionConflictError) {
        setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: cause.currentDraft }));
        toast.error("This draft changed elsewhere. Your edits are preserved; reload the saved draft before retrying.");
      } else {
        toast.error(cause instanceof Error ? cause.message : "We couldn't save this draft. Try again.");
      }
    } finally {
      savingReviewIdsRef.current.delete(review.google_review_id);
      setSavingReviewId(null);
    }
  }

  function reloadConflict(review: Review) {
    const current = draftConflicts[review.google_review_id];
    rememberDraftMetadata(review.google_review_id, {
      draftState: current?.state ?? "new",
      draftVersion: current?.version ?? 0,
      draftUpdatedAt: current?.updatedAt ?? null,
    }, { businessId, location: selectedLoc }, current?.reply ?? null);
    setDrafts((previous) => ({ ...previous, [review.google_review_id]: current?.reply ?? "" }));
    setSavedDraftSnapshots((previous) => {
      const next = { ...previous };
      if (current?.reply) next[review.google_review_id] = current.reply;
      else delete next[review.google_review_id];
      return next;
    });
    setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
      ? { ...item, draftState: current?.state ?? "new", draftVersion: current?.version ?? 0, draftUpdatedAt: current?.updatedAt ?? null }
      : item));
    setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: undefined }));
  }

  function saveTestDraft(review: Review) {
    if (!shouldShowTestWorkflowActions(review, false)) return;
    const text = drafts[review.google_review_id] ?? "";
    if (!text.trim()) {
      toast.error("Nothing to save yet. Generate a reply or type your draft first.");
      return;
    }
    setSavedDraftSnapshots((s) => ({
      ...s,
      [review.google_review_id]: text,
    }));
    toast.success(
        "Test draft saved. Keep editing or mark it as posted in this test session."
    );
  }

  function markAsPostedTest(review: Review) {
    if (!shouldShowTestWorkflowActions(review, false)) return;
    const reply = drafts[review.google_review_id];
    if (!reply?.trim()) {
      toast.error("Add or generate a reply first.");
      return;
    }
    setReviews((prev) =>
      prev.map((r) =>
        r.google_review_id === review.google_review_id ? { ...r, status: "replied" } : r
      )
    );
    setSavedDraftSnapshots((s) => ({
      ...s,
      [review.google_review_id]: reply,
    }));
    toast.success(
      "Marked as posted (test mode). No further action is needed for this test session."
    );
  }

  const isSampleMode = reviews.length > 0 && reviews.every((r) => r.isSample);
  const displayLocations = locations;
  const hasRealLocations = locations.length > 0;

  const expandedReviewId = isSampleMode && reviews.length > 0
    ? expandedId && reviews.some((review) => review.google_review_id === expandedId)
      ? expandedId
      : reviews[0].google_review_id
    : null;

  const isNoConnectedOnly = error === NO_CONNECTED_MSG;

  return (
    <DashboardPage width="md" className="space-y-8">
      <DashboardPageHeader
        kicker="Review inbox"
        title="Your review inbox."
        description="Draft, edit and approve replies in your own voice."
      />

      <div className="space-y-3">
        {!hasRealLocations && !loading && !error && (
          <DashboardCallout
            variant="neutral"
            action={isOwner ? (
              <Button type="button" size="sm" onClick={handleConnectGoogle}>
                Connect Google
              </Button>
            ) : undefined}
          >
            <p className="text-foreground">
              {isOwner
                ? "Connect Google and select a location to load your reviews."
                : "Ask the workspace owner to connect Google and select a location."}
            </p>
          </DashboardCallout>
        )}

        {isSampleMode && (
          <DashboardCallout variant="neutral" title="Test mode — sample reviews">
            <p className="text-foreground">
              Sample reviews only. Test actions never post to Google.
            </p>
          </DashboardCallout>
        )}

        {error && isNoConnectedOnly && hasRealLocations && (
          <DashboardCallout variant="neutral">
            <p className="text-foreground">{error}</p>
          </DashboardCallout>
        )}
        {error && !isNoConnectedOnly && (
          <DashboardCallout variant="error" action={<Button type="button" size="sm" variant="outline" onClick={() => void (selectedLoc ? loadReviews() : loadLocations())} disabled={loading || pageLoading}>Retry</Button>}>
            <p role="alert">{error}</p>
          </DashboardCallout>
        )}
      </div>

      {hasRealLocations && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              className={cn(nativeSelectClassName, "min-w-[200px] sm:min-w-[220px] sm:max-w-md sm:flex-1")}
              aria-label="Select a Google review location"
              value={selectedLoc}
              onChange={(e) => setSelectedLoc(e.target.value)}
              disabled={loading}
            >
              <option value="">Select a location</option>
              {displayLocations.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.title || l.name}
                </option>
              ))}
            </select>

            <Button
              onClick={() => void syncReviews()}
              disabled={!selectedLoc || syncing || loading}
            >
              {syncing ? "Syncing…" : "Sync reviews now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {autoReplyAllReviews
              ? "Interactive sync may post eligible 4–5-star replies. Unknown and 1–3-star ratings always need your approval; scheduled runs save drafts only."
              : "Sync saves drafts. You choose what posts to Google."}
          </p>
          <details className="text-sm text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">How replies work</summary>
            <p className="mt-2 max-w-2xl leading-relaxed">Generate AI draft saves a suggestion. Save draft stores your edits. Post saved reply publishes that exact saved text to Google. Unknown and 1–3-star ratings need your approval; scheduled runs save drafts only.</p>
          </details>
        </div>
      )}

      <ReviewInboxSummary
        reviews={reviews}
        drafts={drafts}
        savedDraftSnapshots={savedDraftSnapshots}
      />

      {loading && reviews.length === 0 && (
        <div className="rounded-2xl border-[1.5px] border-border bg-card px-6 py-12 text-center text-sm text-primary shadow-ink-sm">
          <div className="space-y-3"><Skeleton className="mx-auto h-5 w-40" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        </div>
      )}

      {!loading && !error && reviews.length === 0 && hasRealLocations && (
        <DashboardEmptyState
          title="No reviews yet"
          description="No reviews were returned for this selected location. Sync the location to check for recent reviews."
        />
      )}

      <ReviewList
        reviews={reviews}
        drafts={drafts}
        savedDraftSnapshots={savedDraftSnapshots}
        isDemo={false}
        isSampleMode={isSampleMode}
        expandedId={expandedReviewId}
        onExpandedIdChange={setExpandedId}
        onDraftChange={(reviewId, text) =>
          setDrafts((d) => ({ ...d, [reviewId]: text }))
        }
        onGenerate={(rv) => {
          void generate(rv);
        }}
        onPost={(rv) => {
          void post(rv);
        }}
        onSaveDraft={(rv) => void saveDraft(rv)}
        onSaveTestDraft={saveTestDraft}
        onMarkPostedTest={markAsPostedTest}
        hasPaidAccess
        draftConflicts={draftConflicts}
        postingReviewId={postingReviewId}
        savingReviewId={savingReviewId}
        generatingReviewId={generatingReviewId}
        onReloadConflict={reloadConflict}
        onRefreshPostStatus={() => void loadReviews()}
      />
      {reviews.length === 0 && hasPrevious && !pageLoading && (
        <p className="text-sm text-muted-foreground">No reviews were returned for this page. The list may have changed; go back to the newest reviews.</p>
      )}
      {(reviews.length > 0 || hasPrevious) && (
        <nav className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Review pages">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {pageLoading ? "Loading reviews…" : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"} on this page`}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void loadPreviousReviews()} disabled={!hasPrevious || pageLoading || loading}>
              Previous
            </Button>
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void loadNextReviews()} disabled={!hasMore || pageLoading || loading}>
              {pageLoading ? "Loading…" : "Next"}
            </Button>
            {hasPrevious && reviews.length === 0 && (
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => void loadFirstReviews()} disabled={pageLoading || loading}>
                Newest reviews
              </Button>
            )}
          </div>
        </nav>
      )}
    </DashboardPage>
  );
}

export default function ReviewsPage() {
  return <ReviewsPageContent />;
}
