export type { Review, ReviewApiRow } from "@/modules/review-replies/types/review.types";
import type { Review } from "@/modules/review-replies/types/review.types";

export type ReviewWorkflow = "unanswered" | "unsaved_draft" | "draft_saved" | "posted";

export type WorkflowBadgeConfig = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
};

export function getReviewWorkflowDisplay(
  review: Review,
  draftText: string,
  savedSnapshots: Record<string, string>,
  isDemo: boolean
): { workflow: ReviewWorkflow; badge: WorkflowBadgeConfig } {
  const id = review.google_review_id;
  const isPosted = review.status.toLowerCase() === "replied";
  const inTestContext = Boolean(review.isSample || isDemo);

  if (isPosted) {
    return {
      workflow: "posted",
      badge: {
        label: inTestContext ? "Posted (test mode)" : "Replied",
        variant: "secondary",
        className: "border-accent-green/35 bg-accent-green/10 text-primary",
      },
    };
  }

  const trimmed = draftText.trim();
  if (!trimmed) {
    return {
      workflow: "unanswered",
      badge: {
        label: "Awaiting approval",
        variant: "outline",
        className: "text-foreground",
      },
    };
  }

  const saved = savedSnapshots[id];
  if (saved !== undefined && saved === draftText) {
    return {
      workflow: "draft_saved",
      badge: {
        label: "Draft saved",
        variant: "secondary",
        className: "border-navy/35 bg-tint-navy text-navy",
      },
    };
  }

  return {
    workflow: "unsaved_draft",
    badge: {
      label: "Unsaved draft",
      variant: "outline",
      className: "border-accent-marigold/35 bg-tint-butter text-primary",
    },
  };
}

export function shouldShowTestWorkflowActions(review: Review, isDemo: boolean): boolean {
  return Boolean(review.isSample || isDemo);
}
