export const TRIAL_CHECKOUT_POLICY = {
  paymentMethodCollection: "if_required" as const,
  missingPaymentMethod: "cancel" as const,
};

/** Accept only catalog keys, including protection from inherited object properties. */
export function isCheckoutPlanId(value: unknown): value is "replies" | "booster" | "complete" {
  return typeof value === "string" &&
    (value === "replies" || value === "booster" || value === "complete");
}

export function isCheckoutBillingPeriod(value: unknown): value is "monthly" | "annual" {
  return value === "monthly" || value === "annual";
}

export function isRecoverableCheckoutClaim(kind: string): boolean {
  return kind === "busy" || kind === "conflict" || kind === "blocked";
}
