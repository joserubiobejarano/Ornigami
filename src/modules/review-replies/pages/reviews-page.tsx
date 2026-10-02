"use client";

export const dynamic = "force-dynamic";

import { useRef, useState } from "react";

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
import { DraftVersionConflictError, postReviewReply, saveReviewDraft } from "@/modules/review-replies/services/review-replies-api.service";
import type { ReviewDraft } from "@/modules/review-replies/types/review.types";

function ReviewsPageContent() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    loading,
    error,
    syncing,
    loadReviews,
    syncReviews,
  } = useReviewInboxData(true);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const NO_CONNECTED_MSG = "Connect your Google profile to load locations and reviews.";

  function handleConnectGoogle() {
    window.location.href = "/api/google/oauth/start";
  }

  async function generate(review: Review) {
    if (!review.isSample && !selectedLoc) {
      toast.error("Select a location before generating a reply.");
      return;
    }
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
      const j = await r.json().catch(() => ({})) as { error?: string; currentDraft?: ReviewDraft | null };
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
  }

  async function post(review: Review) {
    const reply = drafts[review.google_review_id];
    if (!reply?.trim() || !selectedLoc) {
      toast.error("Write or generate a reply before posting.");
      return;
    }

    const localSnapshot = savedDraftSnapshots[review.google_review_id];
    try {
      let version = review.draftVersion ?? 0;
      let postText = reply;
      if (localSnapshot !== reply || version === 0) {
        const saved = await saveReviewDraft({
          ...(businessId ? { businessId } : {}),
          reviewId: review.google_review_id,
          reply,
          expectedVersion: version,
        });
        version = saved.version;
        postText = saved.reply ?? reply.trim();
        setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: postText }));
        if (!hasDraftChangedSince(draftsRef.current[review.google_review_id], reply)) {
          setDrafts((previous) => ({ ...previous, [review.google_review_id]: postText }));
        }
        setReviews((previous) => previous.map((item) => item.google_review_id === review.google_review_id
          ? { ...item, draftState: saved.state, draftVersion: saved.version, draftUpdatedAt: saved.updatedAt }
          : item));
      }
      await postReviewReply({
        ...(businessId ? { businessId } : {}),
        reviewId: review.google_review_id,
        locationName: selectedLoc,
        reply: postText,
        expectedVersion: version,
      });
      await loadReviews();
      toast.success("Reply posted to Google.");
    } catch (cause) {
      if (cause instanceof DraftVersionConflictError) {
        setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: cause.currentDraft }));
        toast.error("This draft changed elsewhere. Your edits are preserved; reload the saved draft before retrying.");
      } else {
        toast.error(cause instanceof Error ? cause.message : "We couldn't post this reply. Try again.");
      }
    }
  }

  async function saveDraft(review: Review) {
    const reply = drafts[review.google_review_id] ?? "";
    if (!reply.trim()) {
      toast.error("Write a reply before saving.");
      return;
    }
    try {
      const draft = await saveReviewDraft({
        ...(businessId ? { businessId } : {}),
        reviewId: review.google_review_id,
        reply,
        expectedVersion: review.draftVersion ?? 0,
      });
      const canonicalText = draft.reply ?? reply.trim();
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
      if (cause instanceof DraftVersionConflictError) {
        setDraftConflicts((previous) => ({ ...previous, [review.google_review_id]: cause.currentDraft }));
        toast.error("This draft changed elsewhere. Your edits are preserved; reload the saved draft before retrying.");
      } else {
        toast.error(cause instanceof Error ? cause.message : "We couldn't save this draft. Try again.");
      }
    }
  }

  function reloadConflict(review: Review) {
    const current = draftConflicts[review.google_review_id];
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
        title="Review replies and approve each post."
        description="Generate creates a saved AI draft. Save keeps your edits. Approve & post publishes the reply you review."
      />

      <div className="space-y-3">
        {!hasRealLocations && !loading && (
          <DashboardCallout
            variant="neutral"
            action={
              <Button type="button" size="sm" onClick={handleConnectGoogle}>
                Connect Google
              </Button>
            }
          >
            <p className="text-foreground">
              Connect Google and select a location in Google settings to load your review inbox. You stay in control of each reply you post.
            </p>
          </DashboardCallout>
        )}

        {isSampleMode && (
          <DashboardCallout variant="neutral" title="Test mode — sample reviews">
            <p className="text-foreground">
              Sample data only. In live mode, you decide what posts to Google.
            </p>
            <p className="text-foreground mt-2">
              Sample reviews for internal testing. These are not live Google reviews.
            </p>
          </DashboardCallout>
        )}

        {error && isNoConnectedOnly && (
          <DashboardCallout variant="neutral">
            <p className="text-foreground">{error}</p>
          </DashboardCallout>
        )}
        {error && !isNoConnectedOnly && (
          <DashboardCallout variant="error">
            <p>{error}</p>
          </DashboardCallout>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          className={cn(nativeSelectClassName, "min-w-[200px] sm:min-w-[220px] sm:max-w-md sm:flex-1")}
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
          : "Sync creates drafts for review. Unknown and 1–3-star ratings always need your approval; scheduled runs save drafts only."}
      </p>

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

      {!loading && reviews.length === 0 && hasRealLocations && (
        <DashboardEmptyState
          title="No reviews yet"
          description="No reviews yet. Once your Google profile is connected, new reviews land here with a draft ready."
        >
          <Button type="button" onClick={handleConnectGoogle}>
            Connect Google
          </Button>
        </DashboardEmptyState>
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
        onReloadConflict={reloadConflict}
      />
    </DashboardPage>
  );
}

export default function ReviewsPage() {
  return <ReviewsPageContent />;
}
