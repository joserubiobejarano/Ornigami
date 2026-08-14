"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  getReviewWorkflowDisplay,
} from "@/components/reviews/review-workflow";
import type { Review } from "@/modules/review-replies/types/review.types";

type DraftMap = Record<string, string>;

type ReviewInboxSummaryProps = {
  reviews: Review[];
  drafts: DraftMap;
  savedDraftSnapshots: DraftMap;
};

export function ReviewInboxSummary({
  reviews,
  drafts,
  savedDraftSnapshots,
}: ReviewInboxSummaryProps) {
  const summary = useMemo(() => {
    let unanswered = 0;
    let draftsActive = 0;
    let posted = 0;

    for (const review of reviews) {
      const draftText = drafts[review.google_review_id] ?? "";
      const { workflow } = getReviewWorkflowDisplay(review, draftText, savedDraftSnapshots, false);
      if (workflow === "unanswered") unanswered += 1;
      else if (workflow === "posted") posted += 1;
      else draftsActive += 1;
    }

    return { total: reviews.length, unanswered, drafts: draftsActive, posted };
  }, [drafts, reviews, savedDraftSnapshots]);

  if (reviews.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border-[1.5px] border-border bg-surface px-3 py-2.5 text-xs text-primary shadow-ink-sm"
      aria-live="polite"
    >
      <span className="font-semibold text-primary">Summary</span>
      <Badge variant="outline" className="font-normal tabular-nums">
        Loaded {summary.total}
      </Badge>
      <Badge variant="outline" className="font-normal tabular-nums">
        Awaiting approval {summary.unanswered}
      </Badge>
      <Badge variant="outline" className="font-normal tabular-nums">
        Drafts {summary.drafts}
      </Badge>
      <Badge variant="outline" className="font-normal tabular-nums">
        Posted {summary.posted}
      </Badge>
    </div>
  );
}
