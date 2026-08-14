"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";

import {
  DashboardCallout,
  DashboardEmptyState,
  DashboardPage,
  DashboardPageHeader,
} from "@/components/dashboard";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { nativeSelectClassName } from "@/lib/form-controls";
import { useCurrentPlan } from "@/lib/use-current-plan";
import { isPaidUser, isTrialing } from "@/lib/plan";
import { UpgradeBanner, PlanGateModal } from "@/components/PlanGate";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ReviewList } from "@/components/reviews/review-list";
import { readTextStream } from "@/lib/stream-client";
import { useReviewInboxData } from "@/modules/review-replies/hooks/use-review-inbox-data";
import { ReviewInboxSummary } from "@/modules/review-replies/components/review-inbox-summary";
import type { Review } from "@/modules/review-replies/types/review.types";
import { shouldShowTestWorkflowActions } from "@/components/reviews/review-workflow";

function ReviewsPageContent() {
  const { planStatus, planInfo } = useCurrentPlan();
  const hasPaidAccess = isPaidUser(planStatus) || isTrialing(planStatus);
  const [showPlanGateModal, setShowPlanGateModal] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const {
    locations,
    selectedLocation: selectedLoc,
    setSelectedLocation: setSelectedLoc,
    reviews,
    setReviews,
    drafts,
    setDrafts,
    savedDraftSnapshots,
    setSavedDraftSnapshots,
    loading,
    error,
    syncing,
    autoReplyAllReviews,
    loadReviews,
    syncReviews,
  } = useReviewInboxData(hasPaidAccess);

  const NO_CONNECTED_MSG = "Connect your Google profile to load locations and reviews.";

  function handleConnectGoogle() {
    window.location.href = "/api/google/oauth/start";
  }

  async function generate(review: Review) {
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
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { error?: string };
      const message = j?.error ?? `Generate failed (${r.status})`;
      toast.error(message);
      return;
    }

    let replyText = "";
    if (r.headers.get("content-type")?.includes("text/event-stream")) {
      await readTextStream(r, (text) => { replyText += text; }, (finalText) => { replyText = finalText; });
    } else {
      const j = await r.json() as { reply?: string; markdown?: string; text?: string };
      replyText = j.reply ?? j.markdown ?? j.text ?? "";
    }
    setDrafts((d) => ({ ...d, [review.google_review_id]: replyText }));

    if (review.isSample) {
      toast.success(
        "Reply generated. Review below, save as draft, then mark as posted (test mode) when final."
      );
    } else {
      if (!selectedLoc) {
        toast.error("Select a location before saving or posting a reply.");
        return;
      }
      try {
        if (autoReplyAllReviews && hasPaidAccess) {
          const pr = await fetch("/api/google/replies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reviewId: review.google_review_id,
              locationName: selectedLoc,
              reply: replyText,
            }),
          });
          if (pr.ok) {
            setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
            await loadReviews();
            toast.success("Reply generated and posted to Google.");
          } else {
            const dr = await fetch("/api/reviews/draft", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reviewId: review.google_review_id, reply: replyText }),
            });
            if (dr.ok) {
              setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
            }
            toast.success(
              "Reply generated. We couldn't post to Google, so we saved it as a draft. Edit or post manually when ready."
            );
          }
        } else {
          const dr = await fetch("/api/reviews/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reviewId: review.google_review_id, reply: replyText }),
          });
          if (!dr.ok) {
            toast.error("We couldn't save this draft. Try again in a moment.");
            return;
          }
          setSavedDraftSnapshots((s) => ({ ...s, [review.google_review_id]: replyText }));
          toast.success(
            autoReplyAllReviews && !hasPaidAccess
              ? "Reply generated and saved as draft. Upgrade to post replies to Google automatically."
              : "Reply generated and saved as draft."
          );
        }
      } catch {
        toast.error("We couldn't save or post this reply. Try again in a moment.");
      }
    }
  }

  async function post(review: Review) {
    const reply = drafts[review.google_review_id];
    if (!reply?.trim() || !selectedLoc) {
      toast.error("Write or generate a reply before posting.");
      return;
    }

    const r = await fetch("/api/google/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: review.google_review_id,
        locationName: selectedLoc,
        reply,
      }),
    });

    if (r.ok) {
      await loadReviews();
      toast.success("Reply posted successfully");
    } else {
      toast.error("We couldn't post this reply to Google. We'll keep it here so you can try again.");
    }
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
      "Draft saved. Mark as posted (test mode) when this reply is final, or keep editing."
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
      "Marked as posted (test mode). This review is handled â€” no further action needed for this test session."
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
        title="Approve replies and keep an eye on whatâ€™s new."
        description="Your reviews land here with a draft ready. You decide what goes live."
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
              Connect your Google profile to load your review inbox. You stay in control of what posts.
            </p>
          </DashboardCallout>
        )}

        {isSampleMode && (
          <DashboardCallout variant="neutral" title="Test mode â€” sample reviews">
            <p className="text-foreground">
              Sample data only. In live mode, you decide what posts to Google.
            </p>
            <p className="text-foreground mt-2">
              Sample reviews for internal testing. These are not live Google reviews.
            </p>
          </DashboardCallout>
        )}

        {planInfo && hasPaidAccess && (
          <UpgradeBanner planStatus={planStatus} currentPeriodEnd={planInfo.currentPeriodEnd} />
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
          onClick={() => {
            if (!hasPaidAccess) {
              setShowPlanGateModal(true);
              return;
            }
            syncReviews();
          }}
          disabled={!selectedLoc || syncing || loading}
          title={!hasPaidAccess ? "Premium feature" : undefined}
        >
          {syncing ? "Syncing..." : "Sync reviews now"}
        </Button>
      </div>

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
          if (!hasPaidAccess && !rv.isSample) {
            setShowPlanGateModal(true);
            return;
          }
          void generate(rv);
        }}
        onPost={(rv) => {
          if (!hasPaidAccess) {
            setShowPlanGateModal(true);
            return;
          }
          void post(rv);
        }}
        onSaveTestDraft={saveTestDraft}
        onMarkPostedTest={markAsPostedTest}
        hasPaidAccess={hasPaidAccess}
      />

      <PlanGateModal
        open={showPlanGateModal}
        onOpenChange={setShowPlanGateModal}
        featureName="Review Replies"
      />
    </DashboardPage>
  );
}

export default function ReviewsPage() {
  return <ReviewsPageContent />;
}
