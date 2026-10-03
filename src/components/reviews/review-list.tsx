"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DashboardCallout } from "@/components/dashboard/callout";
import { cn } from "@/lib/utils";
import { formatProductDate } from "@/lib/format-date";
import {
  canGenerateReplyDraft,
  getReviewWorkflowDisplay,
  shouldShowTestWorkflowActions,
  type Review,
} from "@/components/reviews/review-workflow";
import type { ReviewDraft } from "@/modules/review-replies/types/review.types";

export type ReviewListProps = {
  reviews: Review[];
  drafts: Record<string, string>;
  savedDraftSnapshots: Record<string, string>;
  isDemo: boolean;
  /** When true, only one review is expanded at a time (sample mode on Reviews page). */
  isSampleMode: boolean;
  /**
   * When false with isSampleMode, all sample cards stay expanded (e.g. /demo).
   * When true (default), sample list uses click-to-expand / collapse.
   */
  collapsibleSampleCards?: boolean;
  expandedId: string | null;
  onExpandedIdChange: (id: string | null) => void;
  onDraftChange: (reviewId: string, text: string) => void;
  onGenerate: (review: Review) => void;
  onPost: (review: Review) => void;
  onSaveDraft?: (review: Review) => void;
  onSaveTestDraft: (review: Review) => void;
  onMarkPostedTest: (review: Review) => void;
  draftConflicts?: Record<string, ReviewDraft | null | undefined>;
  onReloadConflict?: (review: Review) => void;
  onRefreshPostStatus?: () => void;
  postingReviewId?: string | null;
  savingReviewId?: string | null;
  generatingReviewId?: string | null;
  hasPaidAccess: boolean;
  /** Shown under handled reviews in test context (sample or demo). */
  testModeHandledResetHint?: string;
};

const DEFAULT_HANDLED_HINT =
  'Handled for this demo — reply area is locked. Use "Load sample reviews" or refresh to reset.';

function ReviewRating({ rating }: { rating?: number | null }) {
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return <span className="text-xs text-muted-foreground">Unrated</span>;
  }
  return (
    <span aria-label={`${rating} out of 5 stars`} className="font-medium text-primary">
      <span aria-hidden="true" className="text-accent-marigold">★</span> {rating}
    </span>
  );
}

export function ReviewList({
  reviews,
  drafts,
  savedDraftSnapshots,
  isDemo,
  isSampleMode,
  collapsibleSampleCards = true,
  expandedId,
  onExpandedIdChange,
  onDraftChange,
  onGenerate,
  onPost,
  onSaveDraft,
  onSaveTestDraft,
  onMarkPostedTest,
  draftConflicts = {},
  onReloadConflict,
  onRefreshPostStatus,
  postingReviewId,
  savingReviewId,
  generatingReviewId,
  hasPaidAccess,
  testModeHandledResetHint = DEFAULT_HANDLED_HINT,
}: ReviewListProps) {
  return (
    <div className="space-y-4">
      {reviews.map((rv) => {
        const draftText = drafts[rv.google_review_id] ?? "";
        const { workflow, badge } = getReviewWorkflowDisplay(
          rv,
          draftText,
          savedDraftSnapshots,
          isDemo
        );
        const isHandled = workflow === "posted";
        const recoveryLocked = Boolean(rv.postRecoveryStatus);
        const postInProgress = postingReviewId === rv.google_review_id;
        const saveInProgress = savingReviewId === rv.google_review_id;
        const generateInProgress = generatingReviewId === rv.google_review_id;
        const replyIsSaved = savedDraftSnapshots[rv.google_review_id] === draftText && (rv.draftVersion ?? 0) > 0;
        const showTestActions = shouldShowTestWorkflowActions(rv, isDemo);
        const showTestModeHandledNote = isHandled && (rv.isSample || isDemo);
        const canGenerate = canGenerateReplyDraft(rv, draftText, savedDraftSnapshots);
        const conflictDraft = draftConflicts[rv.google_review_id];

        const isExpanded =
          !isSampleMode || !collapsibleSampleCards || expandedId === rv.google_review_id;
        if (isSampleMode && collapsibleSampleCards && !isExpanded) {
          const preview = (rv.comment ?? "").slice(0, 80);
          return (
            <button
              key={rv.google_review_id}
              type="button"
              onClick={() => onExpandedIdChange(rv.google_review_id)}
              className={cn(
                "w-full rounded-xl border-[1.5px] border-border p-4 text-left shadow-ink-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isHandled
                  ? "border-accent-green/35 bg-accent-green/10 hover:bg-accent-green/15"
                  : "bg-card hover:bg-surface"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-foreground">
                      {rv.reviewer_name ?? "Anonymous"}
                    </span>
                    <ReviewRating rating={rv.star_rating} />
                    {rv.review_update_time && (
                      <span className="text-foreground text-xs">
                        {formatProductDate(rv.review_update_time)}
                      </span>
                    )}
                    <Badge variant={badge.variant} className={cn("text-[10px]", badge.className)}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground truncate">
                    {preview}
                    {preview.length >= 80 ? "…" : ""}
                  </p>
                </div>
                <span className="text-xs text-foreground shrink-0">Click to expand</span>
              </div>
            </button>
          );
        }
        return (
          <div
            key={rv.google_review_id}
            className={cn(
              "rounded-xl border-[1.5px] border-border bg-card p-5 space-y-4 shadow-ink-sm transition-colors",
              isHandled && "border-accent-green/40 bg-accent-green/10 shadow-none"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-foreground">
                    {rv.reviewer_name ?? "Anonymous"}
                  </span>
                  <ReviewRating rating={rv.star_rating} />
                  {rv.review_update_time && (
                    <span className="text-foreground">
                      {formatProductDate(rv.review_update_time)}
                    </span>
                  )}
                  <Badge variant={badge.variant} className={cn("text-xs", badge.className)}>
                    {badge.label}
                  </Badge>
                  {isDemo && (
                    <Badge variant="outline" className="text-[10px] font-normal text-foreground">
                      demo
                    </Badge>
                  )}
                  {rv.isSample && (
                    <Badge variant="outline" className="text-[10px] font-normal text-foreground">
                      Sample
                    </Badge>
                  )}
                </div>
                {showTestModeHandledNote && (
                  <p className="text-xs text-accent-green">
                    {testModeHandledResetHint}
                  </p>
                )}
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">{rv.comment}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {isSampleMode && collapsibleSampleCards && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onExpandedIdChange(null)}
                  >
                    Collapse
                  </Button>
                )}
              </div>
            </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`review-reply-${encodeURIComponent(rv.google_review_id)}`} className="text-xs font-semibold text-primary">{isHandled ? "Posted reply" : "Reply draft"}</label>
                {draftText.trim() && !replyIsSaved && !recoveryLocked && !isHandled && (
                  <span className="text-xs text-muted-foreground">Save changes before posting.</span>
                )}
              </div>
              <Textarea
                id={`review-reply-${encodeURIComponent(rv.google_review_id)}`}
                value={draftText}
                onChange={(e) => onDraftChange(rv.google_review_id, e.target.value)}
                placeholder={
                  showTestActions ? "Edit your reply (test mode)" : "Your reply will be posted to Google"
                }
                className="min-h-[80px] resize-y"
                readOnly={isHandled || recoveryLocked || postInProgress}
                aria-readonly={isHandled || recoveryLocked || postInProgress}
                aria-label={`${isHandled ? "Posted reply" : "Reply draft"} for ${rv.reviewer_name || "anonymous reviewer"}`}
              />
              {rv.postRecoveryStatus && (
                <DashboardCallout
                  variant="warning"
                  role="status"
                  aria-live="polite"
                  title={rv.postRecoveryStatus === "posting" ? "Checking reply status" : "Post status unconfirmed"}
                  action={onRefreshPostStatus ? (
                    <Button type="button" size="sm" variant="outline" onClick={onRefreshPostStatus}>
                      Refresh saved status
                    </Button>
                  ) : undefined}
                >
                  <p>Your draft is safe. Don&apos;t post again until Google&apos;s result is confirmed.</p>
                </DashboardCallout>
              )}
              {conflictDraft !== undefined && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive">
                  <span>Your edits are still here, but this draft changed elsewhere. Reload the saved version before trying again.</span>
                  {onReloadConflict && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onReloadConflict(rv)}>
                      {conflictDraft ? "Use saved draft" : "Reload saved state"}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {!isHandled && !recoveryLocked && <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {(canGenerate || generateInProgress) && <Button
                onClick={() => onGenerate(rv)}
                title={
                  !hasPaidAccess && !isDemo && !rv.isSample ? "Premium feature" : undefined
                }
                disabled={isHandled || recoveryLocked || postInProgress || generateInProgress || !canGenerate}
              >
                  {generateInProgress ? "Generating…" : "Generate AI draft"}
              </Button>}
              {showTestActions && (
                <Button
                  size="default"
                  onClick={() => onSaveTestDraft(rv)}
                  disabled={isHandled || recoveryLocked || postInProgress || saveInProgress || !draftText.trim()}
                >
                  Save draft
                </Button>
              )}
              {!showTestActions && onSaveDraft && (
                <Button
                  size="default"
                  variant="outline"
                  onClick={() => onSaveDraft(rv)}
                  disabled={isHandled || recoveryLocked || postInProgress || saveInProgress || conflictDraft !== undefined || !draftText.trim() || savedDraftSnapshots[rv.google_review_id] === draftText}
                >
                  {saveInProgress ? "Saving…" : "Save draft"}
                </Button>
              )}
              {showTestActions ? (
                <Button
                  size="default"
                  onClick={() => onMarkPostedTest(rv)}
                  disabled={isHandled || recoveryLocked || postInProgress || !draftText.trim()}
                >
                  Mark as posted (test mode)
                </Button>
              ) : (
                <Button
                  onClick={() => onPost(rv)}
                  disabled={isHandled || recoveryLocked || conflictDraft !== undefined || !replyIsSaved || isDemo || Boolean(postingReviewId)}
                  title={isDemo ? "Posting disabled in demo mode" : undefined}
                >
                  {postingReviewId === rv.google_review_id ? "Posting…" : "Post saved reply"}
                </Button>
              )}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

