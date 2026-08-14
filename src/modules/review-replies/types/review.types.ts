export type Review = {
  google_review_id: string;
  reviewer_name?: string;
  star_rating?: number | null;
  comment?: string | null;
  status: string;
  review_update_time?: string | null;
  isSample?: boolean;
};

export type ReviewApiRow = Review & {
  draft_reply?: string | null;
};

export type ReviewLocation = {
  name: string;
  title?: string;
  locationName: string;
};
