const GOOGLE_STAR_RATINGS = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
} as const;

export type GoogleStarRating = keyof typeof GOOGLE_STAR_RATINGS;

/** Convert the Google Business Profile enum into the integer stored by our schema. */
export function parseGoogleStarRating(value: unknown): number | null {
  if (typeof value !== "string") return null;
  return GOOGLE_STAR_RATINGS[value as GoogleStarRating] ?? null;
}