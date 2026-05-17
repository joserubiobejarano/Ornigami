"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getReviewWorkflowDisplay,
  shouldShowTestWorkflowActions,
  type Review,
} from "@/components/reviews/review-workflow";

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
  onSaveTestDraft: (review: Review) => void;
  onMarkPostedTest: (review: Review) => void;
  hasPaidAccess: boolean;
  /** Shown under handled reviews in test context (sample or demo). */
  testModeHandledResetHint?: string;
};

const DEFAULT_HANDLED_HINT =
  'Handled for this demo , reply area is locked. Use "Load sample reviews" or refresh to reset.';

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
  onSaveTestDraft,
  onMarkPostedTest,
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
        const showTestActions = shouldShowTestWorkflowActions(rv, isDemo);
        const showTestModeHandledNote = isHandled && (rv.isSample || isDemo);

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
                "w-full rounded-xl border p-4 text-left shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isHandled
                  ? "border-emerald-500/35 bg-emerald-500/[0.06] hover:bg-emerald-500/10"
                  : "border-border bg-card hover:bg-muted/40"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium text-foreground">
                      {rv.reviewer_name ?? "Anonymous"}
                    </span>
                    <span className="text-foreground">
                      {typeof rv.star_rating === "number" ? `${rv.star_rating}*` : ","}
                    </span>
                    {rv.review_update_time && (
                      <span className="text-foreground text-xs">
                        {new Date(rv.review_update_time).toLocaleDateString()}
                      </span>
                    )}
                    <Badge variant={badge.variant} className={cn("text-[10px]", badge.className)}>
                      {badge.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground truncate">
                    {preview}
                    {preview.length >= 80 ? "â€¦" : ""}
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
              "rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm transition-colors",
              isHandled && "border-emerald-500/40 bg-emerald-500/[0.05] shadow-none"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-foreground">
                    {rv.reviewer_name ?? "Anonymous"}
                  </span>
                  <span className="text-foreground">
                    {typeof rv.star_rating === "number" ? `${rv.star_rating}*` : ","}
                  </span>
                  {rv.review_update_time && (
                    <span className="text-foreground">
                      {new Date(rv.review_update_time).toLocaleDateString()}
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
                  <p className="text-xs text-emerald-800 dark:text-emerald-200/90">
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
                <label className="text-xs font-medium text-foreground">Draft reply</label>
                {workflow === "unsaved_draft" && !isHandled && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-200/90">
                    Not saved yet , click Save draft to pin this version
                  </span>
                )}
                {workflow === "draft_saved" && !isHandled && (
                  <span className="text-[10px] text-sky-800 dark:text-sky-200/90">
                    Draft saved , edit anytime, or mark as posted when final
                  </span>
                )}
              </div>
              <Textarea
                value={draftText}
                onChange={(e) => onDraftChange(rv.google_review_id, e.target.value)}
                placeholder={
                  showTestActions ? "Edit your reply (test mode)" : "Your reply will be posted to Google"
                }
                className="min-h-[80px] resize-y"
                readOnly={isHandled}
                aria-readonly={isHandled}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Button
                onClick={() => onGenerate(rv)}
                title={
                  !hasPaidAccess && !isDemo && !rv.isSample ? "Premium feature" : undefined
                }
                disabled={isHandled}
              >
                Generate reply
              </Button>
              {showTestActions && (
                <Button
                  size="default"
                  onClick={() => onSaveTestDraft(rv)}
                  disabled={isHandled || !draftText.trim()}
                >
                  Save draft
                </Button>
              )}
              {showTestActions ? (
                <Button
                  size="default"
                  onClick={() => onMarkPostedTest(rv)}
                  disabled={isHandled || !draftText.trim()}
                >
                  Mark as posted (test mode)
                </Button>
              ) : (
                <Button
                  onClick={() => onPost(rv)}
                  disabled={isHandled || !draftText.trim() || isDemo}
                  title={isDemo ? "Posting disabled in demo mode" : undefined}
                >
                  Post to Google
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

