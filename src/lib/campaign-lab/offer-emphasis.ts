export type OfferEmphasisRange = {
  start: number;
  end: number;
  text: string;
};

/**
 * Resolves the reviewed price substring inside the complete offer. This is
 * intentionally an exact, literal match: the first currency amount in an offer
 * is not necessarily the final price, and the renderer must never guess which
 * number the brand approved for emphasis.
 */
export function findApprovedOfferPrice(
  offer: string,
  approvedPrice: string | undefined,
): OfferEmphasisRange | null {
  const price = approvedPrice?.trim();
  if (!price) return null;
  const start = offer.indexOf(price);
  if (start < 0) return null;
  return {
    start,
    end: start + price.length,
    text: price,
  };
}

/**
 * A reviewed substring is an explicit operator choice, so its presence is
 * enough to enable emphasis. The token remains supported for existing private
 * direction fixtures that declared emphasis before this field was exposed.
 */
export function shouldEmphasizeOffer(
  approvedPrice: string | undefined,
  tokenEnabled?: boolean,
): boolean {
  return Boolean(tokenEnabled) || Boolean(approvedPrice?.trim());
}
