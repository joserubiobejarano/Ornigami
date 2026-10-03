export type Review = {
  google_review_id: string;
  reviewer_name?: string | null;
  star_rating?: number | null;
  comment?: string | null;
  status: string;
  review_update_time?: string | null;
  isSample?: boolean;
  draftState?: ReviewDraftState;
  draftVersion?: number;
  draftUpdatedAt?: string | null;
};

export type ReviewDraftState = "new" | "ai_drafted" | "human_edited" | "approved" | "posted";

export type ReviewDraft = {
  replyId: number | null;
  reviewId: string;
  reply: string | null;
  state: ReviewDraftState;
  version: number;
  updatedAt: string | null;
};

export type ReviewApiRow = Review & {
  draft_reply?: string | null;
  draftReply?: string | null;
  draftState?: ReviewDraftState;
  draftVersion?: number;
  draftUpdatedAt?: string | null;
};

export type ReviewLocation = {
  name: string;
  title?: string;
  locationName: string;
  selected?: boolean;
};
