/**
 * The campaign lab is an operator surface for local development only.
 * Hosted access, auth and publishing are deliberately out of scope.
 */
export function isCampaignLabAvailable(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development";
}
