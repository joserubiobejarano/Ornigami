export const TRIAL_CHECKOUT_POLICY = {
  paymentMethodCollection: "if_required" as const,
  missingPaymentMethod: "cancel" as const,
};
